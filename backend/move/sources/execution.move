// Execution object — Stage 3 of the workflow lifecycle.
//
// The agent runs off-chain; the SDK streams cost events to our backend.
// Once the agent completes, the SDK uploads the full trace to Walrus and
// then calls `execution::record` with the buffered cost items + the Walrus
// blob ID. From the chain's perspective, only this single record-tx is needed.
//
// The on-chain `cost_items` are what the customer SDK reported. The verifier
// enclave will independently reconcile these against provider invoices and
// produce a `reconciled_cost_items` list in its attestation payload — that
// reconciled list (not these reported items) is what settlement pays out on.
module weaveos::execution;

use sui::clock::Clock;
use sui::event;
use weaveos::types;
use weaveos::workflow::{Self, Workflow};

const E_NOT_CUSTOMER: u64 = 500001;
const E_EXECUTION_ALREADY_RECORDED: u64 = 500002;
const E_INVALID_CATEGORY: u64 = 500003;
const E_NOT_EXECUTING: u64 = 500004;

public struct CostItem has store, copy, drop {
    provider: address,
    category: u8,
    units: u64,
    amount: u64,
}

public fun new_cost_item(provider: address, category: u8, units: u64, amount: u64): CostItem {
    assert!(types::is_valid_category(category), E_INVALID_CATEGORY);
    CostItem { provider, category, units, amount }
}

public fun cost_provider(c: &CostItem): address { c.provider }
public fun cost_category(c: &CostItem): u8 { c.category }
public fun cost_units(c: &CostItem): u64 { c.units }
public fun cost_amount(c: &CostItem): u64 { c.amount }

public struct Execution has key, store {
    id: UID,
    workflow_id: ID,
    started_at_ms: u64,
    completed_at_ms: u64,
    /// Walrus blob ID for the full execution trace (often megabytes).
    trace_blob_id: vector<u8>,
    cost_items: vector<CostItem>,
    /// Sum of `cost_items[*].amount` — kept on-chain so it's cheap to read.
    total_cost: u64,
}

public struct ExecutionRecorded has copy, drop {
    execution_id: ID,
    workflow_id: ID,
    total_cost: u64,
    item_count: u64,
}

/// Stage 3 / Stage 4 boundary — agent has completed, SDK posts the trace +
/// cost items on-chain. After this call the workflow is ready for outcome
/// verification.
public fun record<T>(
    workflow: &mut Workflow<T>,
    started_at_ms: u64,
    cost_items: vector<CostItem>,
    trace_blob_id: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    assert!(workflow::customer(workflow) == ctx.sender(), E_NOT_CUSTOMER);
    assert!(workflow::status(workflow) == types::status_executing(), E_NOT_EXECUTING);
    assert!(workflow::execution_id(workflow).is_none(), E_EXECUTION_ALREADY_RECORDED);

    let now = clock.timestamp_ms();
    let total_cost = sum_amounts(&cost_items);
    let item_count = cost_items.length();

    let exec = Execution {
        id: object::new(ctx),
        workflow_id: object::id(workflow),
        started_at_ms,
        completed_at_ms: now,
        trace_blob_id,
        cost_items,
        total_cost,
    };
    let eid = object::id(&exec);
    event::emit(ExecutionRecorded {
        execution_id: eid,
        workflow_id: object::id(workflow),
        total_cost,
        item_count,
    });
    workflow::set_execution(workflow, eid, clock);
    transfer::share_object(exec);
    eid
}

fun sum_amounts(items: &vector<CostItem>): u64 {
    let mut sum: u64 = 0;
    let mut i: u64 = 0;
    let n = items.length();
    while (i < n) {
        sum = sum + items.borrow(i).amount;
        i = i + 1;
    };
    sum
}

// === Getters ===
public fun workflow_id(e: &Execution): ID { e.workflow_id }
public fun started_at_ms(e: &Execution): u64 { e.started_at_ms }
public fun completed_at_ms(e: &Execution): u64 { e.completed_at_ms }
public fun trace_blob_id(e: &Execution): &vector<u8> { &e.trace_blob_id }
public fun cost_items(e: &Execution): &vector<CostItem> { &e.cost_items }
public fun total_cost(e: &Execution): u64 { e.total_cost }
