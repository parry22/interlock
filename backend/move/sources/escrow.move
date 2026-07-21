// Generic, phantom-typed escrow vault embedded inside a `Workflow`.
//
// Generic over `Coin<T>` so we can swap the stablecoin type (USDC native →
// later USDT, sui-native stables, etc.) at deploy time without touching the
// other modules. USDC's actual type lives in its own published package and is
// passed to settlement entry points via the SDK.
module weaveos::escrow;

use sui::balance::Balance;
use sui::coin::{Self, Coin};

const E_INSUFFICIENT_BALANCE: u64 = 300001;

/// `has store` (not `key`) so this is embedded inside `Workflow<T>` rather
/// than living as its own top-level object. Avoids extra Sui ID overhead.
public struct Escrow<phantom T> has store {
    balance: Balance<T>,
}

/// Lock the full value of `coin` into a new Escrow. Used at Stage 2 when
/// the customer signs the payment-authorization PTB.
public fun new<T>(coin: Coin<T>): Escrow<T> {
    Escrow { balance: coin.into_balance() }
}

public fun balance<T>(e: &Escrow<T>): u64 {
    e.balance.value()
}

/// Withdraw `amount` from escrow, returning a Coin the caller can transfer.
/// Aborts if amount > balance.
public fun withdraw<T>(e: &mut Escrow<T>, amount: u64, ctx: &mut TxContext): Coin<T> {
    assert!(e.balance.value() >= amount, E_INSUFFICIENT_BALANCE);
    let bal = e.balance.split(amount);
    coin::from_balance(bal, ctx)
}

/// Drain the entire escrow. Used by the full-refund branch and for the
/// residual back to the customer after splits are paid.
public fun drain<T>(e: &mut Escrow<T>, ctx: &mut TxContext): Coin<T> {
    let amount = e.balance.value();
    let bal = e.balance.split(amount);
    coin::from_balance(bal, ctx)
}

#[test_only]
public fun destroy_empty_for_testing<T>(e: Escrow<T>) {
    let Escrow { balance } = e;
    balance.destroy_zero();
}
