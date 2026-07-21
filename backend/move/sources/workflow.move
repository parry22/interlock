// Workflow object — the lifecycle root.
//
// Generic over the escrow coin type `T`. At deploy time the SDK instantiates
// `Workflow<USDC>`; future stablecoin support just instantiates a different T
// without touching this module.
//
// Workflow is a shared object so the customer, the platform keeper, and the
// settlement caller can all act on it. Mutating entry points enforce their own
// auth checks (customer, admin, or attestation-gated).
module weaveos::workflow;

use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use weaveos::escrow::{Self, Escrow};
use weaveos::quote::{Self, Quote};
use weaveos::registry::{Self, Product};
use weaveos::types;

const E_QUOTE_PRODUCT_MISMATCH: u64 = 400001;
const E_QUOTE_EXPIRED: u64 = 400002;
const E_NOT_CUSTOMER: u64 = 400003;
const E_INSUFFICIENT_PAYMENT: u64 = 400004;

public struct Workflow<phantom T> has key {
    id: UID,
    customer: address,
    product_id: ID,
    status: u8,
    quote_id: Option<ID>,
    execution_id: Option<ID>,
    outcome_id: Option<ID>,
    settlement_id: Option<ID>,
    /// Counter so that future dispute extensions don't lose state.
    open_dispute_count: u8,
    escrow: Escrow<T>,
    /// Populated at settlement: paid out across all parties.
    total_revenue: u64,
    /// Populated at settlement: sum of all provider splits.
    total_cost: u64,
    /// Populated at settlement: revenue − cost − platform_fee.
    margin: u64,
    created_at_ms: u64,
    updated_at_ms: u64,
}

public struct WorkflowCreated has copy, drop {
    workflow_id: ID,
    customer: address,
    product_id: ID,
    quote_id: ID,
    escrowed: u64,
}

public struct WorkflowStatusChanged has copy, drop {
    workflow_id: ID,
    from_status: u8,
    to_status: u8,
}

/// Stage 2 — payment authorization.
/// Customer signs a PTB that:
///   (1) creates the Quote (or references a previously frozen one), and
///   (2) calls this fn with `payment >= quote.price`.
///
/// On success the workflow lands in EXECUTING with the USDC locked in escrow.
public fun create_from_quote<T>(
    product: &Product,
    quote: &Quote,
    payment: Coin<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    registry::assert_active(product);
    assert!(quote::product_id(quote) == object::id(product), E_QUOTE_PRODUCT_MISMATCH);
    let now = clock.timestamp_ms();
    assert!(quote::expires_at_ms(quote) > now, E_QUOTE_EXPIRED);

    let customer = ctx.sender();
    assert!(quote::customer(quote) == customer, E_NOT_CUSTOMER);

    let pay_value = coin::value(&payment);
    assert!(pay_value >= quote::price(quote), E_INSUFFICIENT_PAYMENT);

    let wf = Workflow<T> {
        id: object::new(ctx),
        customer,
        product_id: object::id(product),
        status: types::status_executing(),
        quote_id: option::some(object::id(quote)),
        execution_id: option::none(),
        outcome_id: option::none(),
        settlement_id: option::none(),
        open_dispute_count: 0,
        escrow: escrow::new(payment),
        total_revenue: 0,
        total_cost: 0,
        margin: 0,
        created_at_ms: now,
        updated_at_ms: now,
    };
    let wf_id = object::id(&wf);
    event::emit(WorkflowCreated {
        workflow_id: wf_id,
        customer,
        product_id: object::id(product),
        quote_id: object::id(quote),
        escrowed: pay_value,
    });
    transfer::share_object(wf);
    wf_id
}

// === Read-only getters ===
public fun customer<T>(w: &Workflow<T>): address { w.customer }
public fun product_id<T>(w: &Workflow<T>): ID { w.product_id }
public fun status<T>(w: &Workflow<T>): u8 { w.status }
public fun quote_id<T>(w: &Workflow<T>): &Option<ID> { &w.quote_id }
public fun execution_id<T>(w: &Workflow<T>): &Option<ID> { &w.execution_id }
public fun outcome_id<T>(w: &Workflow<T>): &Option<ID> { &w.outcome_id }
public fun settlement_id<T>(w: &Workflow<T>): &Option<ID> { &w.settlement_id }
public fun open_dispute_count<T>(w: &Workflow<T>): u8 { w.open_dispute_count }
public fun escrow_balance<T>(w: &Workflow<T>): u64 { escrow::balance(&w.escrow) }
public fun total_revenue<T>(w: &Workflow<T>): u64 { w.total_revenue }
public fun total_cost<T>(w: &Workflow<T>): u64 { w.total_cost }
public fun margin<T>(w: &Workflow<T>): u64 { w.margin }
public fun escrow_mut<T>(w: &mut Workflow<T>): &mut Escrow<T> { &mut w.escrow }
public fun escrow_ref<T>(w: &Workflow<T>): &Escrow<T> { &w.escrow }

// === Package-internal state transitions ===
// These are called only by sibling modules (execution, outcome, attestation,
// settlement) — `public(package)` keeps the state machine encapsulated.

public(package) fun set_execution<T>(w: &mut Workflow<T>, execution_id: ID, clock: &Clock) {
    w.execution_id = option::some(execution_id);
    w.updated_at_ms = clock.timestamp_ms();
}

public(package) fun set_outcome<T>(w: &mut Workflow<T>, outcome_id: ID, clock: &Clock) {
    let prev = w.status;
    w.status = types::status_verified();
    w.outcome_id = option::some(outcome_id);
    w.updated_at_ms = clock.timestamp_ms();
    event::emit(WorkflowStatusChanged {
        workflow_id: object::id(w),
        from_status: prev,
        to_status: w.status,
    });
}

public(package) fun mark_disputed<T>(w: &mut Workflow<T>, clock: &Clock) {
    let prev = w.status;
    w.open_dispute_count = w.open_dispute_count + 1;
    w.status = types::status_disputed();
    w.updated_at_ms = clock.timestamp_ms();
    event::emit(WorkflowStatusChanged {
        workflow_id: object::id(w),
        from_status: prev,
        to_status: w.status,
    });
}

public(package) fun mark_settled<T>(
    w: &mut Workflow<T>,
    settlement_id: ID,
    total_revenue: u64,
    total_cost: u64,
    margin: u64,
    clock: &Clock,
) {
    let prev = w.status;
    w.status = types::status_settled();
    w.settlement_id = option::some(settlement_id);
    w.total_revenue = total_revenue;
    w.total_cost = total_cost;
    w.margin = margin;
    w.updated_at_ms = clock.timestamp_ms();
    event::emit(WorkflowStatusChanged {
        workflow_id: object::id(w),
        from_status: prev,
        to_status: w.status,
    });
}

public(package) fun mark_refunded<T>(w: &mut Workflow<T>, clock: &Clock) {
    let prev = w.status;
    w.status = types::status_refunded();
    w.updated_at_ms = clock.timestamp_ms();
    event::emit(WorkflowStatusChanged {
        workflow_id: object::id(w),
        from_status: prev,
        to_status: w.status,
    });
}
