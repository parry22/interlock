// Quote object — Stage 1 of the workflow lifecycle.
//
// Holds the committed price, the CBOR-encoded success criteria (DSL from
// ARCHITECTURE.md §11.2), and the issuer attestation from the Nautilus
// pricing enclave.
//
// MVP only accepts `pricing_model = fixed`. The other variants are reserved
// in the schema for Phase 2 (capped / success_fee / hybrid).
//
// MVP also accepts an empty `issuer_attestation` and skips on-chain
// verification of it. P2 will require a real Nautilus signature and verify
// via `attestation` module.
module weaveos::quote;

use std::hash;
use sui::clock::Clock;
use sui::event;
use weaveos::registry::{Self, Product};
use weaveos::types;

const E_INVALID_PRICING_MODEL: u64 = 200001;
const E_EXPIRES_IN_PAST: u64 = 200002;
const E_UNSUPPORTED_PRICING_MODEL_MVP: u64 = 200003;
const E_PRICE_ZERO: u64 = 200004;
const E_CRITERIA_EMPTY: u64 = 200005;

public struct Quote has key, store {
    id: UID,
    product_id: ID,
    customer: address,
    /// Committed price in coin base units (e.g., USDC at 6 decimals).
    price: u64,
    pricing_model: u8,
    /// CBOR-encoded `SuccessCriterion` (see ARCHITECTURE.md §11.2).
    success_criteria: vector<u8>,
    /// SHA-256 of `success_criteria` — verifier asserts this matches before
    /// evaluating, so criteria cannot be retroactively changed.
    success_criteria_hash: vector<u8>,
    expires_at_ms: u64,
    /// Nautilus pricing-enclave signature over the quote. Empty in MVP.
    issuer_attestation: vector<u8>,
    created_at_ms: u64,
}

public struct QuoteCreated has copy, drop {
    quote_id: ID,
    product_id: ID,
    customer: address,
    price: u64,
    pricing_model: u8,
    expires_at_ms: u64,
}

/// Create a Quote. Returns it by value so the caller can pass it directly
/// into `workflow::create_from_quote` in the same PTB without an extra
/// object lookup, or freeze it for asynchronous flows.
public fun create(
    product: &Product,
    customer: address,
    price: u64,
    pricing_model: u8,
    success_criteria: vector<u8>,
    expires_at_ms: u64,
    issuer_attestation: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
): Quote {
    registry::assert_active(product);
    assert!(types::is_valid_pricing_model(pricing_model), E_INVALID_PRICING_MODEL);
    assert!(pricing_model == types::pricing_fixed(), E_UNSUPPORTED_PRICING_MODEL_MVP);
    assert!(price > 0, E_PRICE_ZERO);
    assert!(!success_criteria.is_empty(), E_CRITERIA_EMPTY);

    let now = clock.timestamp_ms();
    assert!(expires_at_ms > now, E_EXPIRES_IN_PAST);

    let success_criteria_hash = hash::sha2_256(success_criteria);

    let q = Quote {
        id: object::new(ctx),
        product_id: object::id(product),
        customer,
        price,
        pricing_model,
        success_criteria,
        success_criteria_hash,
        expires_at_ms,
        issuer_attestation,
        created_at_ms: now,
    };
    event::emit(QuoteCreated {
        quote_id: object::id(&q),
        product_id: q.product_id,
        customer: q.customer,
        price: q.price,
        pricing_model: q.pricing_model,
        expires_at_ms: q.expires_at_ms,
    });
    q
}

/// Convenience entry: create + freeze. Returns the ID so the SDK can
/// reference the quote in a follow-up tx.
public fun create_and_freeze(
    product: &Product,
    customer: address,
    price: u64,
    pricing_model: u8,
    success_criteria: vector<u8>,
    expires_at_ms: u64,
    issuer_attestation: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    let q = create(
        product,
        customer,
        price,
        pricing_model,
        success_criteria,
        expires_at_ms,
        issuer_attestation,
        clock,
        ctx,
    );
    let qid = object::id(&q);
    transfer::public_freeze_object(q);
    qid
}

// === Getters ===
public fun product_id(q: &Quote): ID { q.product_id }
public fun customer(q: &Quote): address { q.customer }
public fun price(q: &Quote): u64 { q.price }
public fun pricing_model(q: &Quote): u8 { q.pricing_model }
public fun success_criteria(q: &Quote): &vector<u8> { &q.success_criteria }
public fun success_criteria_hash(q: &Quote): &vector<u8> { &q.success_criteria_hash }
public fun expires_at_ms(q: &Quote): u64 { q.expires_at_ms }
public fun issuer_attestation(q: &Quote): &vector<u8> { &q.issuer_attestation }
public fun created_at_ms(q: &Quote): u64 { q.created_at_ms }
