// Outcome object — Stage 5 of the workflow lifecycle.
//
// Created by `attestation::verify_and_record_outcome` after the Nautilus
// signature is validated. Records the success bool, Walrus blob IDs for the
// outcome record / proof, and the dispute window.
//
// Dispute filing (Stage 6) lives here too — anyone who is the workflow's
// customer can call `file_dispute` while the window is open. This module
// only opens disputes; resolution lives in `settlement` (the dispute
// arbitrator enclave attests a final verdict in Phase 2).
module weaveos::outcome;

use sui::clock::Clock;
use sui::event;
use weaveos::types;
use weaveos::workflow::{Self, Workflow};

const E_OUTCOME_ALREADY_RECORDED: u64 = 600001;
const E_NOT_CUSTOMER: u64 = 600002;
const E_NOT_VERIFIED: u64 = 600003;
const E_DISPUTE_WINDOW_CLOSED: u64 = 600004;
const E_OUTCOME_WORKFLOW_MISMATCH: u64 = 600005;

public struct Outcome has key, store {
    id: UID,
    workflow_id: ID,
    success: bool,
    artifact_blob_id: vector<u8>,
    proof_blob_id: vector<u8>,
    /// AWS Nitro signature bytes — the primary attestation's signature.
    /// Settlement re-verifies the full set; this field is kept for audit.
    tee_attestation: vector<u8>,
    /// PCR values for reproducibility (primary attestation's PCR).
    enclave_measurement: vector<u8>,
    verified_at_ms: u64,
    dispute_window_ends_ms: u64,
}

public struct OutcomeVerified has copy, drop {
    outcome_id: ID,
    workflow_id: ID,
    success: bool,
    dispute_window_ends_ms: u64,
}

public struct DisputeFiled has copy, drop {
    workflow_id: ID,
    outcome_id: ID,
    evidence_blob_id: vector<u8>,
    filed_by: address,
}

/// Package-internal: called by `attestation::verify_and_record_outcome`.
/// Not directly callable by SDK — the attestation module is the only gate
/// that should create an Outcome.
public(package) fun create<T>(
    workflow: &mut Workflow<T>,
    success: bool,
    artifact_blob_id: vector<u8>,
    proof_blob_id: vector<u8>,
    tee_attestation: vector<u8>,
    enclave_measurement: vector<u8>,
    dispute_window_seconds: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    assert!(workflow::outcome_id(workflow).is_none(), E_OUTCOME_ALREADY_RECORDED);
    let now = clock.timestamp_ms();
    let dispute_window_ends_ms = now + dispute_window_seconds * 1000;

    let o = Outcome {
        id: object::new(ctx),
        workflow_id: object::id(workflow),
        success,
        artifact_blob_id,
        proof_blob_id,
        tee_attestation,
        enclave_measurement,
        verified_at_ms: now,
        dispute_window_ends_ms,
    };
    let oid = object::id(&o);
    event::emit(OutcomeVerified {
        outcome_id: oid,
        workflow_id: object::id(workflow),
        success,
        dispute_window_ends_ms,
    });
    workflow::set_outcome(workflow, oid, clock);
    transfer::share_object(o);
    oid
}

/// Stage 6 — Customer files a dispute during the window.
public fun file_dispute<T>(
    workflow: &mut Workflow<T>,
    outcome: &Outcome,
    evidence_blob_id: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(outcome.workflow_id == object::id(workflow), E_OUTCOME_WORKFLOW_MISMATCH);
    assert!(workflow::customer(workflow) == ctx.sender(), E_NOT_CUSTOMER);
    assert!(workflow::status(workflow) == types::status_verified(), E_NOT_VERIFIED);
    let now = clock.timestamp_ms();
    assert!(now < outcome.dispute_window_ends_ms, E_DISPUTE_WINDOW_CLOSED);

    workflow::mark_disputed(workflow, clock);
    event::emit(DisputeFiled {
        workflow_id: object::id(workflow),
        outcome_id: object::id(outcome),
        evidence_blob_id,
        filed_by: ctx.sender(),
    });
}

// === Getters ===
public fun workflow_id(o: &Outcome): ID { o.workflow_id }
public fun success(o: &Outcome): bool { o.success }
public fun artifact_blob_id(o: &Outcome): &vector<u8> { &o.artifact_blob_id }
public fun proof_blob_id(o: &Outcome): &vector<u8> { &o.proof_blob_id }
public fun tee_attestation(o: &Outcome): &vector<u8> { &o.tee_attestation }
public fun enclave_measurement(o: &Outcome): &vector<u8> { &o.enclave_measurement }
public fun verified_at_ms(o: &Outcome): u64 { o.verified_at_ms }
public fun dispute_window_ends_ms(o: &Outcome): u64 { o.dispute_window_ends_ms }

public fun dispute_window_closed(o: &Outcome, clock: &Clock): bool {
    clock.timestamp_ms() >= o.dispute_window_ends_ms
}
