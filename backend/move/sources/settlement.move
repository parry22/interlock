// Atomic multi-party settlement — Stage 7.
//
// This module is the heart of the platform. It implements
// `ARCHITECTURE.md` §10.3 verbatim: preconditions, attestation re-verification,
// failure-refund branch, success-path invariants (no self-pay, registered
// recipients, sum bounds, fee bounds, cost reconciliation), atomic
// disbursement, and state commit.
//
// **Permissionless trigger** — `settle_workflow` is `public`, callable by
// any address. The platform runs a keeper that calls it as soon as the
// dispute window closes; agent companies or third parties can also call.
module weaveos::settlement;

use sui::clock::Clock;
use sui::event;
use weaveos::attestation::{Self, AttestationPayload, DevAttestation, EnclaveAttestation, Split};
use weaveos::escrow;
use weaveos::execution::{Self, Execution, CostItem};
use weaveos::outcome::{Self, Outcome};
use weaveos::quote::{Self, Quote};
use weaveos::registry::{Self, Product, ProviderRegistry};
use weaveos::types;
use weaveos::workflow::{Self, Workflow};

// === Error codes (8_xxxxx) ===
const E_NOT_VERIFIED: u64 = 800001;
const E_DISPUTE_WINDOW_OPEN: u64 = 800002;
const E_DISPUTE_OPEN: u64 = 800003;
const E_PAYLOAD_WORKFLOW_MISMATCH: u64 = 800004;
const E_PAYLOAD_OUTCOME_MISMATCH: u64 = 800005;
const E_OUTCOME_WORKFLOW_MISMATCH: u64 = 800006;
const E_EXECUTION_WORKFLOW_MISMATCH: u64 = 800007;
const E_QUOTE_MISMATCH: u64 = 800008;
const E_SELF_PAY: u64 = 800009;
const E_ZERO_SPLIT: u64 = 800010;
const E_BAD_AGENT_RECIPIENT: u64 = 800011;
const E_UNREGISTERED_PROVIDER: u64 = 800012;
const E_INVALID_ROLE: u64 = 800013;
const E_EXCEEDS_ESCROW: u64 = 800014;
const E_EXCEEDS_PRICE: u64 = 800015;
const E_FEE_EXCEEDS_CAP: u64 = 800016;
const E_FEE_EXCEEDS_MAX_BPS: u64 = 800017;
const E_COST_MISMATCH: u64 = 800018;
const E_PRODUCT_MISMATCH: u64 = 800019;

public struct Settlement has key, store {
    id: UID,
    workflow_id: ID,
    splits: vector<Split>,
    total_settled: u64,
    platform_fee: u64,
    settled_at_ms: u64,
}

public struct WorkflowSettled has copy, drop {
    workflow_id: ID,
    settlement_id: ID,
    total_settled: u64,
    platform_fee: u64,
}

public struct WorkflowRefunded has copy, drop {
    workflow_id: ID,
    refund_amount: u64,
}

public struct CostReportingDrift has copy, drop {
    workflow_id: ID,
    reported_total: u64,
    reconciled_total: u64,
}

/// Production path — implements ARCHITECTURE.md §10.3.
/// Verifies AWS Nitro attestation, then applies the settlement proposal.
public fun settle_workflow<T>(
    workflow: &mut Workflow<T>,
    product: &Product,
    provider_registry: &ProviderRegistry,
    quote: &Quote,
    execution: &Execution,
    outcome_obj: &Outcome,
    payload: AttestationPayload,
    attestations: vector<EnclaveAttestation>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    prepare_settlement(workflow, product, quote, execution, outcome_obj, &payload, clock);
    attestation::verify_attestations(workflow, product, &payload, &attestations, clock);
    do_settle(workflow, product, provider_registry, quote, execution, payload, clock, ctx);
}

/// HACKATHON path — verifies ed25519 dev-signer attestations, then applies the
/// settlement proposal. Identical invariants to `settle_workflow`; only the
/// signature verification step differs.
public fun settle_workflow_dev<T>(
    workflow: &mut Workflow<T>,
    product: &Product,
    provider_registry: &ProviderRegistry,
    quote: &Quote,
    execution: &Execution,
    outcome_obj: &Outcome,
    payload: AttestationPayload,
    dev_attestations: vector<DevAttestation>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    prepare_settlement(workflow, product, quote, execution, outcome_obj, &payload, clock);
    attestation::verify_dev_attestations(workflow, product, &payload, &dev_attestations, clock);
    do_settle(workflow, product, provider_registry, quote, execution, payload, clock, ctx);
}

// === Internal: shared preconditions ===

/// Checks every condition that must hold before we run signature verification:
/// status, dispute window, no open disputes, every passed object belongs to
/// this workflow, and the payload binds to this workflow + outcome.
fun prepare_settlement<T>(
    workflow: &Workflow<T>,
    product: &Product,
    quote: &Quote,
    execution: &Execution,
    outcome_obj: &Outcome,
    payload: &AttestationPayload,
    clock: &Clock,
) {
    // === 0. Preconditions ===
    assert!(workflow::status(workflow) == types::status_verified(), E_NOT_VERIFIED);
    assert!(outcome::dispute_window_closed(outcome_obj, clock), E_DISPUTE_WINDOW_OPEN);
    assert!(workflow::open_dispute_count(workflow) == 0, E_DISPUTE_OPEN);

    // Object linkage — every passed object must belong to this workflow.
    let wf_id = object::id(workflow);
    assert!(outcome::workflow_id(outcome_obj) == wf_id, E_OUTCOME_WORKFLOW_MISMATCH);
    assert!(execution::workflow_id(execution) == wf_id, E_EXECUTION_WORKFLOW_MISMATCH);
    assert!(workflow::product_id(workflow) == object::id(product), E_PRODUCT_MISMATCH);
    let stored_qid_opt = workflow::quote_id(workflow);
    assert!(stored_qid_opt.is_some(), E_QUOTE_MISMATCH);
    assert!(*stored_qid_opt.borrow() == object::id(quote), E_QUOTE_MISMATCH);

    // Payload binding — what the verifier signed must match what we have on chain.
    assert!(
        attestation::payload_workflow_id(payload) == wf_id,
        E_PAYLOAD_WORKFLOW_MISMATCH,
    );
    assert!(
        attestation::payload_outcome_success(payload) == outcome::success(outcome_obj),
        E_PAYLOAD_OUTCOME_MISMATCH,
    );
}

// === Internal: post-verification settlement ===

/// All of ARCHITECTURE.md §10.3 steps 2–5: failure refund, success-path
/// invariant checks, atomic disbursement, state commit. Both `settle_workflow`
/// and `settle_workflow_dev` call this after their respective signature-
/// verification step has succeeded.
fun do_settle<T>(
    workflow: &mut Workflow<T>,
    product: &Product,
    provider_registry: &ProviderRegistry,
    quote: &Quote,
    execution: &Execution,
    payload: AttestationPayload,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let wf_id = object::id(workflow);
    let customer = workflow::customer(workflow);
    let agent_co = registry::agent_company(product);
    let success = attestation::payload_outcome_success(&payload);

    // === 2. Failure branch — full refund (MVP failure_policy) ===
    if (!success) {
        let total = workflow::escrow_balance(workflow);
        let refund_coin = escrow::drain(workflow::escrow_mut(workflow), ctx);
        transfer::public_transfer(refund_coin, customer);
        workflow::mark_refunded(workflow, clock);
        event::emit(WorkflowRefunded {
            workflow_id: wf_id,
            refund_amount: total,
        });
        return
    };

    // === 3. Success-path invariants ===
    let splits: vector<Split> = *attestation::payload_splits(&payload);
    let platform_fee = attestation::payload_platform_fee(&payload);
    let reconciled_total = sum_cost_items(attestation::payload_reconciled_cost_items(&payload));

    let n = splits.length();
    let mut i: u64 = 0;

    // 3a. amount > 0 ; no self-pay
    while (i < n) {
        let s = splits.borrow(i);
        assert!(attestation::split_amount(s) > 0, E_ZERO_SPLIT);
        assert!(attestation::split_recipient(s) != customer, E_SELF_PAY);
        i = i + 1;
    };

    // 3b. Recipients must be known
    i = 0;
    while (i < n) {
        let s = splits.borrow(i);
        let role = attestation::split_role(s);
        let recipient = attestation::split_recipient(s);
        assert!(types::is_valid_role(role), E_INVALID_ROLE);
        if (role == types::role_agent_company()) {
            assert!(recipient == agent_co, E_BAD_AGENT_RECIPIENT);
        } else if (role == types::role_platform()) {
            // Platform fee recipient is not pre-registered. Cap-by-bps below
            // bounds abuse to `fee_max_bps * price`.
        } else {
            assert!(
                registry::is_registered_provider(provider_registry, recipient, role),
                E_UNREGISTERED_PROVIDER,
            );
        };
        i = i + 1;
    };

    // 3c. Sum bounds
    let total_out = sum_split_amounts(&splits);
    assert!(total_out <= workflow::escrow_balance(workflow), E_EXCEEDS_ESCROW);
    assert!(total_out <= quote::price(quote), E_EXCEEDS_PRICE);

    // 3d. Platform fee bounds
    assert!(platform_fee <= registry::fee_cap(product), E_FEE_EXCEEDS_CAP);
    let max_fee_by_bps =
        (quote::price(quote) * (registry::fee_max_bps(product) as u64)) / 10_000;
    assert!(platform_fee <= max_fee_by_bps, E_FEE_EXCEEDS_MAX_BPS);

    // 3e. Provider splits == reconciled costs
    let provider_total = sum_provider_splits(&splits);
    assert!(provider_total == reconciled_total, E_COST_MISMATCH);

    // 3f. Cost reporting drift (informational)
    let reported = execution::total_cost(execution);
    if (reconciled_total != reported) {
        event::emit(CostReportingDrift {
            workflow_id: wf_id,
            reported_total: reported,
            reconciled_total,
        });
    };

    // === 4. Atomic disbursement ===
    i = 0;
    while (i < n) {
        let s = splits.borrow(i);
        let amt = attestation::split_amount(s);
        let recipient = attestation::split_recipient(s);
        let coin_out = escrow::withdraw(workflow::escrow_mut(workflow), amt, ctx);
        transfer::public_transfer(coin_out, recipient);
        i = i + 1;
    };

    // Residual back to customer (rounding / unspent budget — e.g., price
    // headroom not consumed by provider costs).
    let residual = workflow::escrow_balance(workflow);
    if (residual > 0) {
        let res_coin = escrow::drain(workflow::escrow_mut(workflow), ctx);
        transfer::public_transfer(res_coin, customer);
    };

    // === 5. State commit ===
    let margin = total_out - provider_total - platform_fee;
    let s_obj = Settlement {
        id: object::new(ctx),
        workflow_id: wf_id,
        splits,
        total_settled: total_out,
        platform_fee,
        settled_at_ms: clock.timestamp_ms(),
    };
    let s_id = object::id(&s_obj);
    workflow::mark_settled(workflow, s_id, total_out, provider_total, margin, clock);
    event::emit(WorkflowSettled {
        workflow_id: wf_id,
        settlement_id: s_id,
        total_settled: total_out,
        platform_fee,
    });
    transfer::share_object(s_obj);
}

// === Internal helpers ===

fun sum_split_amounts(splits: &vector<Split>): u64 {
    let mut sum: u64 = 0;
    let mut i: u64 = 0;
    let n = splits.length();
    while (i < n) {
        sum = sum + attestation::split_amount(splits.borrow(i));
        i = i + 1;
    };
    sum
}

fun sum_provider_splits(splits: &vector<Split>): u64 {
    let mut sum: u64 = 0;
    let mut i: u64 = 0;
    let n = splits.length();
    while (i < n) {
        let s = splits.borrow(i);
        let role = attestation::split_role(s);
        if (role == types::role_model_provider() ||
            role == types::role_tool() ||
            role == types::role_human()) {
            sum = sum + attestation::split_amount(s);
        };
        i = i + 1;
    };
    sum
}

fun sum_cost_items(items: &vector<CostItem>): u64 {
    let mut sum: u64 = 0;
    let mut i: u64 = 0;
    let n = items.length();
    while (i < n) {
        sum = sum + execution::cost_amount(items.borrow(i));
        i = i + 1;
    };
    sum
}

// === Getters on Settlement ===
public fun workflow_id(s: &Settlement): ID { s.workflow_id }
public fun splits(s: &Settlement): &vector<Split> { &s.splits }
public fun total_settled(s: &Settlement): u64 { s.total_settled }
public fun platform_fee(s: &Settlement): u64 { s.platform_fee }
public fun settled_at_ms(s: &Settlement): u64 { s.settled_at_ms }
