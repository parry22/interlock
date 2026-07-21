// Customer registration, product configuration, success criteria templates,
// provider directory, enclave PCR allowlist, and fee schedules.
//
// The Product object is shared. Mutations require AdminCap. Reads are free.
module weaveos::registry;

use std::string::String;
use sui::event;
use sui::vec_map::{Self, VecMap};
use sui::vec_set::{Self, VecSet};
use weaveos::types;

// === Error codes (namespace: 1_xxxxx) ===
// Admin authorization is enforced statically by passing `&AdminCap`, so no
// E_NOT_ADMIN code is needed.
const E_INVALID_FEE_BPS: u64 = 100002;
const E_INVALID_FAILURE_POLICY: u64 = 100003;
const E_INVALID_MIN_ATTESTATIONS: u64 = 100004;
const E_PROVIDER_ALREADY_REGISTERED: u64 = 100005;
const E_PROVIDER_NOT_REGISTERED: u64 = 100006;
const E_PCR_ALREADY_ALLOWED: u64 = 100007;
const E_PCR_NOT_ALLOWED: u64 = 100008;
const E_PRODUCT_INACTIVE: u64 = 100009;
const E_DEV_SIGNER_ALREADY_ALLOWED: u64 = 100010;
const E_DEV_SIGNER_NOT_ALLOWED: u64 = 100011;
const E_INVALID_DEV_SIGNER_LENGTH: u64 = 100012;

/// Length of an ed25519 public key in bytes.
const ED25519_PUBKEY_LEN: u64 = 32;

const MAX_BPS: u16 = 10_000;

// === Capabilities ===

/// Singleton capability minted to package publisher. Holder is the platform admin.
public struct AdminCap has key, store {
    id: UID,
}

// === Objects ===

/// Per-product configuration. Shared object so anyone can read; admin-only writes.
public struct Product has key {
    id: UID,
    /// Human-readable product slug (e.g., "ticket-resolution").
    slug: String,
    /// The agent company that owns this product. Receives revenue minus
    /// platform fee minus reconciled provider costs on success-path settlement.
    agent_company_address: address,
    /// Platform fee in basis points (out of 10_000). Multiplied by quote.price.
    fee_bps: u16,
    /// Absolute cap on the platform fee in USDC base units, regardless of price.
    fee_cap: u64,
    /// Belt-and-braces upper bound on fee_bps used during settlement validation.
    fee_max_bps: u16,
    /// Minimum number of independent enclave attestations required for settlement.
    /// 1 by default; > 1 means M-of-N (see ARCHITECTURE.md §11.7).
    min_attestations: u8,
    /// PCR measurements that are accepted for outcome verification. Add-before-remove
    /// rolling upgrades keep workflows in flight valid (§11.6).
    allowed_pcrs: VecSet<vector<u8>>,
    /// HACKATHON MODE: ed25519 public keys (32 bytes each) authorized to sign
    /// AttestationPayloads via the dev path. Used by `attestation::verify_dev_attestations`
    /// when the production Nautilus path is not available.
    /// In production this would typically be empty; the Nitro PCR allowlist takes over.
    allowed_dev_signers: VecSet<vector<u8>>,
    /// MVP: always FAILURE_FULL_REFUND. Phase 2: per-product configurable.
    failure_policy: u8,
    /// Whether new workflows can be quoted against this product.
    active: bool,
    created_at_ms: u64,
}

/// Global provider directory. Maps Sui address to declared role.
/// One entry per (provider, role) pair so a single address can act in multiple roles.
public struct ProviderRegistry has key {
    id: UID,
    /// (address, role) -> provider name. VecMap is fine at MVP scale (< 1000 entries).
    providers: VecMap<ProviderKey, String>,
}

public struct ProviderKey has copy, drop, store {
    addr: address,
    role: u8,
}

// === Events ===

public struct ProductCreated has copy, drop {
    product_id: ID,
    slug: String,
    agent_company_address: address,
}

public struct ProductDeactivated has copy, drop {
    product_id: ID,
}

public struct ProviderRegistered has copy, drop {
    addr: address,
    role: u8,
    name: String,
}

public struct ProviderRemoved has copy, drop {
    addr: address,
    role: u8,
}

public struct PcrAllowed has copy, drop {
    product_id: ID,
    pcr: vector<u8>,
}

public struct PcrRevoked has copy, drop {
    product_id: ID,
    pcr: vector<u8>,
}

public struct DevSignerAllowed has copy, drop {
    product_id: ID,
    pubkey: vector<u8>,
}

public struct DevSignerRevoked has copy, drop {
    product_id: ID,
    pubkey: vector<u8>,
}

// === Init ===

/// Module initializer. Mints AdminCap to publisher and creates the empty
/// ProviderRegistry as a shared object. Runs exactly once at publish.
fun init(ctx: &mut TxContext) {
    let admin = AdminCap { id: object::new(ctx) };
    transfer::public_transfer(admin, ctx.sender());

    let registry = ProviderRegistry {
        id: object::new(ctx),
        providers: vec_map::empty(),
    };
    transfer::share_object(registry);
}

// === Admin entry: create Product ===

public fun create_product(
    _admin: &AdminCap,
    slug: String,
    agent_company_address: address,
    fee_bps: u16,
    fee_cap: u64,
    fee_max_bps: u16,
    min_attestations: u8,
    failure_policy: u8,
    clock_ms: u64,
    ctx: &mut TxContext,
): ID {
    assert!(fee_bps <= MAX_BPS, E_INVALID_FEE_BPS);
    assert!(fee_max_bps <= MAX_BPS, E_INVALID_FEE_BPS);
    assert!(fee_bps <= fee_max_bps, E_INVALID_FEE_BPS);
    assert!(min_attestations >= 1, E_INVALID_MIN_ATTESTATIONS);
    assert!(types::is_valid_failure_policy(failure_policy), E_INVALID_FAILURE_POLICY);

    let product = Product {
        id: object::new(ctx),
        slug,
        agent_company_address,
        fee_bps,
        fee_cap,
        fee_max_bps,
        min_attestations,
        allowed_pcrs: vec_set::empty(),
        allowed_dev_signers: vec_set::empty(),
        failure_policy,
        active: true,
        created_at_ms: clock_ms,
    };
    let product_id = object::id(&product);
    event::emit(ProductCreated {
        product_id,
        slug: product.slug,
        agent_company_address,
    });
    transfer::share_object(product);
    product_id
}

public fun deactivate_product(_admin: &AdminCap, product: &mut Product) {
    product.active = false;
    event::emit(ProductDeactivated { product_id: object::id(product) });
}

public fun allow_pcr(_admin: &AdminCap, product: &mut Product, pcr: vector<u8>) {
    assert!(!product.allowed_pcrs.contains(&pcr), E_PCR_ALREADY_ALLOWED);
    let pcr_copy = pcr;
    product.allowed_pcrs.insert(pcr);
    event::emit(PcrAllowed { product_id: object::id(product), pcr: pcr_copy });
}

public fun revoke_pcr(_admin: &AdminCap, product: &mut Product, pcr: vector<u8>) {
    assert!(product.allowed_pcrs.contains(&pcr), E_PCR_NOT_ALLOWED);
    let pcr_copy = pcr;
    product.allowed_pcrs.remove(&pcr);
    event::emit(PcrRevoked { product_id: object::id(product), pcr: pcr_copy });
}

// === Admin: dev signer (hackathon-mode) ===

public fun allow_dev_signer(_admin: &AdminCap, product: &mut Product, pubkey: vector<u8>) {
    assert!(pubkey.length() == ED25519_PUBKEY_LEN, E_INVALID_DEV_SIGNER_LENGTH);
    assert!(!product.allowed_dev_signers.contains(&pubkey), E_DEV_SIGNER_ALREADY_ALLOWED);
    let pubkey_copy = pubkey;
    product.allowed_dev_signers.insert(pubkey);
    event::emit(DevSignerAllowed { product_id: object::id(product), pubkey: pubkey_copy });
}

public fun revoke_dev_signer(_admin: &AdminCap, product: &mut Product, pubkey: vector<u8>) {
    assert!(product.allowed_dev_signers.contains(&pubkey), E_DEV_SIGNER_NOT_ALLOWED);
    let pubkey_copy = pubkey;
    product.allowed_dev_signers.remove(&pubkey);
    event::emit(DevSignerRevoked { product_id: object::id(product), pubkey: pubkey_copy });
}

// === Admin entry: provider directory ===

public fun register_provider(
    _admin: &AdminCap,
    registry: &mut ProviderRegistry,
    addr: address,
    role: u8,
    name: String,
) {
    let key = ProviderKey { addr, role };
    assert!(!registry.providers.contains(&key), E_PROVIDER_ALREADY_REGISTERED);
    registry.providers.insert(key, name);
    event::emit(ProviderRegistered { addr, role, name });
}

public fun remove_provider(
    _admin: &AdminCap,
    registry: &mut ProviderRegistry,
    addr: address,
    role: u8,
) {
    let key = ProviderKey { addr, role };
    assert!(registry.providers.contains(&key), E_PROVIDER_NOT_REGISTERED);
    registry.providers.remove(&key);
    event::emit(ProviderRemoved { addr, role });
}

// === Read-only accessors (used by settlement.move for invariant checks) ===

public fun is_registered_provider(
    registry: &ProviderRegistry,
    addr: address,
    role: u8,
): bool {
    registry.providers.contains(&ProviderKey { addr, role })
}

public fun is_active(product: &Product): bool { product.active }

public fun agent_company(product: &Product): address { product.agent_company_address }

public fun fee_bps(product: &Product): u16 { product.fee_bps }
public fun fee_cap(product: &Product): u64 { product.fee_cap }
public fun fee_max_bps(product: &Product): u16 { product.fee_max_bps }
public fun min_attestations(product: &Product): u8 { product.min_attestations }
public fun failure_policy(product: &Product): u8 { product.failure_policy }

public fun is_pcr_allowed(product: &Product, pcr: &vector<u8>): bool {
    product.allowed_pcrs.contains(pcr)
}

public fun is_dev_signer_allowed(product: &Product, pubkey: &vector<u8>): bool {
    product.allowed_dev_signers.contains(pubkey)
}

public fun assert_active(product: &Product) {
    assert!(product.active, E_PRODUCT_INACTIVE);
}

// === Test-only helpers ===

#[test_only]
public fun new_admin_for_testing(ctx: &mut TxContext): AdminCap {
    AdminCap { id: object::new(ctx) }
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) { init(ctx) }

#[test_only]
public fun burn_admin_for_testing(cap: AdminCap) {
    let AdminCap { id } = cap;
    id.delete();
}
