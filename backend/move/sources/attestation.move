// AWS Nitro attestation verification + payload binding.
//
// The Nautilus verifier enclave emits a signed `AttestationPayload` that
// names: (workflow_id, outcome_success, blob_ids, reconciled_cost_items,
// proposed_splits, platform_fee, nonce, timestamp).
//
// Move re-verifies:
//   1. payload binds to *this* workflow + a sane timestamp
//   2. M-of-N independent enclave signatures
//   3. each enclave's PCR is in `Product.allowed_pcrs`
//   4. enclave instance IDs are distinct (no replay of one signature N times)
//
// MVP STATUS (P1): everything above except the actual AWS Nitro cert-chain
// verification is implemented. Cert-chain verification (parsing x509,
// validating to AWS root, extracting PCR from the attestation doc) is
// scheduled for P2. For P1 we accept the signature opaquely and trust the
// PCR + instance-ID fields the SDK passes; this is enough to wire the
// full lifecycle on devnet while the enclave is being built.
module weaveos::attestation;

use std::bcs;
use sui::clock::Clock;
use sui::ed25519;
use weaveos::execution::CostItem;
use weaveos::outcome;
use weaveos::quote::{Self, Quote};
use weaveos::registry::{Self, Product};
use weaveos::workflow::{Self, Workflow};

// === Error codes (7_xxxxx) ===
const E_WORKFLOW_MISMATCH: u64 = 700001;
const E_TIMESTAMP_FUTURE: u64 = 700002;
const E_INSUFFICIENT_ATTESTATIONS: u64 = 700003;
const E_BAD_PCR: u64 = 700004;
const E_DUPLICATE_ENCLAVE: u64 = 700005;
const E_QUOTE_MISMATCH: u64 = 700006;
const E_EXECUTION_REQUIRED: u64 = 700007;
const E_PRODUCT_MISMATCH: u64 = 700008;
const E_BAD_DEV_SIGNER: u64 = 700009;
const E_BAD_DEV_SIGNATURE: u64 = 700010;
const E_DUPLICATE_DEV_SIGNER: u64 = 700011;

// === Public types (re-used by settlement) ===

/// One enclave's attestation. In P1 the `signature` is accepted opaquely.
public struct EnclaveAttestation has store, copy, drop {
    /// PCR measurement (PCR0/1/2 concatenated, see AWS Nitro docs).
    pcr: vector<u8>,
    /// EC2 instance ID embedded in the Nitro attestation document.
    enclave_instance_id: vector<u8>,
    /// ECDSA signature over `sha256(serialize(payload))`. Not verified in P1.
    signature: vector<u8>,
}

/// HACKATHON MODE: one ed25519 attestation from a registered dev signer.
/// `signature` is verified live (unlike `EnclaveAttestation.signature` in P1).
public struct DevAttestation has store, copy, drop {
    /// 32-byte ed25519 public key. Must be in `Product.allowed_dev_signers`.
    signer_pubkey: vector<u8>,
    /// 64-byte ed25519 signature over `bcs::to_bytes(&payload)`.
    signature: vector<u8>,
}

/// Proposed settlement split. Re-used by settlement and AttestationPayload.
public struct Split has store, copy, drop {
    recipient: address,
    amount: u64,
    role: u8,
}

/// The full payload the verifier enclave signs. Move never deserializes this
/// from bytes — the SDK constructs it as a Move value and the hash of its
/// canonical serialization is what was signed.
public struct AttestationPayload has store, copy, drop {
    workflow_id: ID,
    outcome_success: bool,
    outcome_blob_id: vector<u8>,
    trace_blob_id: vector<u8>,
    proof_blob_id: vector<u8>,
    reconciled_cost_items: vector<CostItem>,
    splits: vector<Split>,
    platform_fee: u64,
    nonce: vector<u8>,
    timestamp_ms: u64,
}

// === Constructors (SDK helpers) ===

public fun new_split(recipient: address, amount: u64, role: u8): Split {
    Split { recipient, amount, role }
}

public fun split_recipient(s: &Split): address { s.recipient }
public fun split_amount(s: &Split): u64 { s.amount }
public fun split_role(s: &Split): u8 { s.role }

public fun new_attestation(
    pcr: vector<u8>,
    enclave_instance_id: vector<u8>,
    signature: vector<u8>,
): EnclaveAttestation {
    EnclaveAttestation { pcr, enclave_instance_id, signature }
}

public fun attestation_pcr(a: &EnclaveAttestation): &vector<u8> { &a.pcr }
public fun attestation_instance_id(a: &EnclaveAttestation): &vector<u8> {
    &a.enclave_instance_id
}
public fun attestation_signature(a: &EnclaveAttestation): &vector<u8> { &a.signature }

public fun new_dev_attestation(
    signer_pubkey: vector<u8>,
    signature: vector<u8>,
): DevAttestation {
    DevAttestation { signer_pubkey, signature }
}

public fun dev_signer_pubkey(a: &DevAttestation): &vector<u8> { &a.signer_pubkey }
public fun dev_signature(a: &DevAttestation): &vector<u8> { &a.signature }

public fun new_payload(
    workflow_id: ID,
    outcome_success: bool,
    outcome_blob_id: vector<u8>,
    trace_blob_id: vector<u8>,
    proof_blob_id: vector<u8>,
    reconciled_cost_items: vector<CostItem>,
    splits: vector<Split>,
    platform_fee: u64,
    nonce: vector<u8>,
    timestamp_ms: u64,
): AttestationPayload {
    AttestationPayload {
        workflow_id,
        outcome_success,
        outcome_blob_id,
        trace_blob_id,
        proof_blob_id,
        reconciled_cost_items,
        splits,
        platform_fee,
        nonce,
        timestamp_ms,
    }
}

// === Payload accessors ===
public fun payload_workflow_id(p: &AttestationPayload): ID { p.workflow_id }
public fun payload_outcome_success(p: &AttestationPayload): bool { p.outcome_success }
public fun payload_outcome_blob_id(p: &AttestationPayload): &vector<u8> { &p.outcome_blob_id }
public fun payload_trace_blob_id(p: &AttestationPayload): &vector<u8> { &p.trace_blob_id }
public fun payload_proof_blob_id(p: &AttestationPayload): &vector<u8> { &p.proof_blob_id }
public fun payload_reconciled_cost_items(p: &AttestationPayload): &vector<CostItem> {
    &p.reconciled_cost_items
}
public fun payload_splits(p: &AttestationPayload): &vector<Split> { &p.splits }
public fun payload_platform_fee(p: &AttestationPayload): u64 { p.platform_fee }
public fun payload_nonce(p: &AttestationPayload): &vector<u8> { &p.nonce }
public fun payload_timestamp_ms(p: &AttestationPayload): u64 { p.timestamp_ms }

// === Verification ===

/// Verify M-of-N attestations against `product`'s allowlist and the workflow
/// binding. Aborts on any failure. Read-only on `workflow` and `product`.
///
/// Called by both `attestation::verify_and_record_outcome` (Stage 5) and
/// `settlement::settle_workflow` (Stage 7) — settlement re-verifies because
/// the proposal it sees is by-value, not the one stored in `Outcome`.
public fun verify_attestations<T>(
    workflow: &Workflow<T>,
    product: &Product,
    payload: &AttestationPayload,
    attestations: &vector<EnclaveAttestation>,
    clock: &Clock,
) {
    // 1. Workflow binding
    assert!(payload.workflow_id == object::id(workflow), E_WORKFLOW_MISMATCH);

    // 2. Timestamp not from the future
    let now = clock.timestamp_ms();
    assert!(payload.timestamp_ms <= now, E_TIMESTAMP_FUTURE);

    // 3. Min-N
    let n = attestations.length();
    assert!(n >= (registry::min_attestations(product) as u64), E_INSUFFICIENT_ATTESTATIONS);

    // 4. Distinct enclave instances + PCR allowlist
    let mut seen_instances: vector<vector<u8>> = vector[];
    let mut i: u64 = 0;
    while (i < n) {
        let a = attestations.borrow(i);
        assert!(registry::is_pcr_allowed(product, &a.pcr), E_BAD_PCR);
        assert!(!contains_bytes(&seen_instances, &a.enclave_instance_id), E_DUPLICATE_ENCLAVE);
        seen_instances.push_back(a.enclave_instance_id);
        i = i + 1;
    };

    // 5. (P2) Verify each signature against the leaf public key from each
    //    enclave's AWS Nitro attestation document, and verify each doc's
    //    cert chain to the AWS Nitro root certificate. For P1 we trust the
    //    PCR + instance-ID fields are honest. The Move bounds enforced in
    //    settlement.move (no self-pay, registered recipients, sum ≤ escrow,
    //    fee ≤ cap) keep this safe in the P1 testing window.
}

fun contains_bytes(haystack: &vector<vector<u8>>, needle: &vector<u8>): bool {
    let mut i: u64 = 0;
    let n = haystack.length();
    while (i < n) {
        if (haystack.borrow(i) == needle) return true;
        i = i + 1;
    };
    false
}

/// HACKATHON MODE: verify M-of-N ed25519 attestations against
/// `Product.allowed_dev_signers`. Drop-in replacement for `verify_attestations`
/// that uses Vercel-style ed25519 keys instead of AWS Nitro cert chains.
///
/// The signature MUST be over `bcs::to_bytes(payload)`. The TS verifier must
/// use the @mysten/sui BCS encoder with the same field order as
/// `AttestationPayload` to produce identical bytes.
public fun verify_dev_attestations<T>(
    workflow: &Workflow<T>,
    product: &Product,
    payload: &AttestationPayload,
    dev_attestations: &vector<DevAttestation>,
    clock: &Clock,
) {
    // 1. Workflow binding
    assert!(payload.workflow_id == object::id(workflow), E_WORKFLOW_MISMATCH);

    // 2. Timestamp not from the future
    let now = clock.timestamp_ms();
    assert!(payload.timestamp_ms <= now, E_TIMESTAMP_FUTURE);

    // 3. Min-N (re-uses Product.min_attestations — same semantics as Nitro path)
    let n = dev_attestations.length();
    assert!(n >= (registry::min_attestations(product) as u64), E_INSUFFICIENT_ATTESTATIONS);

    // 4. Canonical payload bytes (BCS) — must match what TS signed.
    let payload_bytes = bcs::to_bytes(payload);

    // 5. Distinct signers + pubkey in allowlist + signature valid
    let mut seen_pubkeys: vector<vector<u8>> = vector[];
    let mut i: u64 = 0;
    while (i < n) {
        let a = dev_attestations.borrow(i);
        assert!(registry::is_dev_signer_allowed(product, &a.signer_pubkey), E_BAD_DEV_SIGNER);
        assert!(!contains_bytes(&seen_pubkeys, &a.signer_pubkey), E_DUPLICATE_DEV_SIGNER);
        seen_pubkeys.push_back(a.signer_pubkey);

        let valid = ed25519::ed25519_verify(&a.signature, &a.signer_pubkey, &payload_bytes);
        assert!(valid, E_BAD_DEV_SIGNATURE);

        i = i + 1;
    };
}

/// HACKATHON MODE: verify ed25519 attestations + create the Outcome object.
/// Mirror of `verify_and_record_outcome` for the dev path.
public fun verify_and_record_outcome_dev<T>(
    workflow: &mut Workflow<T>,
    product: &Product,
    quote: &Quote,
    payload: AttestationPayload,
    dev_attestations: vector<DevAttestation>,
    dispute_window_seconds: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    // Linkage checks (same as production path)
    assert!(workflow::product_id(workflow) == object::id(product), E_PRODUCT_MISMATCH);
    assert!(quote::product_id(quote) == object::id(product), E_PRODUCT_MISMATCH);
    let stored_qid_opt = workflow::quote_id(workflow);
    assert!(stored_qid_opt.is_some(), E_QUOTE_MISMATCH);
    assert!(*stored_qid_opt.borrow() == object::id(quote), E_QUOTE_MISMATCH);
    assert!(workflow::execution_id(workflow).is_some(), E_EXECUTION_REQUIRED);

    verify_dev_attestations(workflow, product, &payload, &dev_attestations, clock);

    // Use primary attestation's pubkey as the recorded "measurement" (audit trail).
    let primary_pubkey = *dev_signer_pubkey(dev_attestations.borrow(0));
    let primary_sig = *dev_signature(dev_attestations.borrow(0));
    let outcome_blob = *payload_outcome_blob_id(&payload);
    let proof_blob = *payload_proof_blob_id(&payload);
    let success = payload.outcome_success;

    outcome::create(
        workflow,
        success,
        outcome_blob,
        proof_blob,
        primary_sig,
        primary_pubkey,
        dispute_window_seconds,
        clock,
        ctx,
    )
}

/// Stage 5 — verify attestation + create the Outcome object.
/// The customer SDK calls this after receiving the signed payload back from
/// the verifier enclave.
public fun verify_and_record_outcome<T>(
    workflow: &mut Workflow<T>,
    product: &Product,
    quote: &Quote,
    payload: AttestationPayload,
    attestations: vector<EnclaveAttestation>,
    dispute_window_seconds: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    // Linkage checks
    assert!(workflow::product_id(workflow) == object::id(product), E_PRODUCT_MISMATCH);
    assert!(quote::product_id(quote) == object::id(product), E_PRODUCT_MISMATCH);
    let stored_qid_opt = workflow::quote_id(workflow);
    assert!(stored_qid_opt.is_some(), E_QUOTE_MISMATCH);
    assert!(*stored_qid_opt.borrow() == object::id(quote), E_QUOTE_MISMATCH);
    assert!(workflow::execution_id(workflow).is_some(), E_EXECUTION_REQUIRED);

    // Attestation verification
    verify_attestations(workflow, product, &payload, &attestations, clock);

    // Use primary attestation for the Outcome's recorded measurement.
    let primary_pcr = *attestation_pcr(attestations.borrow(0));
    let primary_sig = *attestation_signature(attestations.borrow(0));
    let outcome_blob = *payload_outcome_blob_id(&payload);
    let proof_blob = *payload_proof_blob_id(&payload);
    let success = payload.outcome_success;

    outcome::create(
        workflow,
        success,
        outcome_blob,
        proof_blob,
        primary_sig,
        primary_pcr,
        dispute_window_seconds,
        clock,
        ctx,
    )
}
