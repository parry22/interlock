// End-to-end + property tests for the weaveos Move package.
//
// Uses a marker `USDC` coin type so escrow can be parameterized exactly as it
// will be on mainnet (just with the real Circle USDC type substituted at
// deploy). `coin::mint_for_testing<USDC>` provides a real Coin<USDC> without
// needing a TreasuryCap, which is the standard Sui test pattern.
#[test_only]
module weaveos::weaveos_tests;

use std::string;
use sui::clock;
use sui::coin;
use sui::test_scenario as ts;
use weaveos::attestation;
use weaveos::execution;
use weaveos::outcome;
use weaveos::quote;
use weaveos::registry::{Self, AdminCap, Product, ProviderRegistry};
use weaveos::settlement::{Self, Settlement};
use weaveos::types;
use weaveos::workflow::{Self, Workflow};

/// Marker stablecoin used as the phantom T throughout tests.
public struct USDC has drop {}

// === Test fixtures ===

const ADMIN: address = @0xA1;
const CUSTOMER: address = @0xC1;
const AGENT_CO: address = @0xA6;
const MODEL_PROVIDER: address = @0xB6;
const TOOL_PROVIDER: address = @0xC6;
const PLATFORM_TREASURY: address = @0xF0;
const ATTACKER: address = @0xBAD;

const PRICE: u64 = 100_000_000;        // 100 USDC (6 decimals)
const FEE_BPS: u16 = 500;              // 5%
const FEE_CAP: u64 = 10_000_000;       // 10 USDC absolute cap
const FEE_MAX_BPS: u16 = 1_000;        // 10% upper bound on fee_bps
const DISPUTE_WINDOW_SEC: u64 = 86_400; // 24h
const PCR: vector<u8> = b"PCR_DEV_v1_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const ENCLAVE_ID_A: vector<u8> = b"i-aaaaaaaaaaaaaaaaa";

fun mint(amount: u64, ctx: &mut TxContext): coin::Coin<USDC> {
    coin::mint_for_testing<USDC>(amount, ctx)
}

fun atte(sig: vector<u8>): attestation::EnclaveAttestation {
    attestation::new_attestation(PCR, ENCLAVE_ID_A, sig)
}

fun zero_bytes(n: u64): vector<u8> {
    let mut v: vector<u8> = vector[];
    let mut i: u64 = 0;
    while (i < n) {
        v.push_back(0u8);
        i = i + 1;
    };
    v
}

/// Set up: AdminCap, ProviderRegistry, Product with one allowed PCR, plus
/// registered model + tool providers. Returns Product ID + Quote ID + the
/// final scenario state in `tx_2`.
fun setup_scenario(scenario: &mut ts::Scenario): (ID, ID) {
    // Tx 1 — publish: mint AdminCap + share empty ProviderRegistry
    ts::next_tx(scenario, ADMIN);
    {
        registry::init_for_testing(ts::ctx(scenario));
    };

    // Tx 2 — admin creates Product + registers providers + allows PCR
    ts::next_tx(scenario, ADMIN);
    let product_id;
    {
        let admin = ts::take_from_sender<AdminCap>(scenario);
        let mut preg = ts::take_shared<ProviderRegistry>(scenario);

        product_id = registry::create_product(
            &admin,
            string::utf8(b"ticket-resolution"),
            AGENT_CO,
            FEE_BPS,
            FEE_CAP,
            FEE_MAX_BPS,
            1, // min_attestations
            types::failure_full_refund(),
            0,
            ts::ctx(scenario),
        );
        // The product was shared — take it back to add PCR.
        registry::register_provider(
            &admin, &mut preg, MODEL_PROVIDER,
            types::role_model_provider(), string::utf8(b"anthropic"),
        );
        registry::register_provider(
            &admin, &mut preg, TOOL_PROVIDER,
            types::role_tool(), string::utf8(b"zendesk"),
        );

        ts::return_to_sender(scenario, admin);
        ts::return_shared(preg);
    };

    // Tx 3 — admin adds PCR to the product
    ts::next_tx(scenario, ADMIN);
    {
        let admin = ts::take_from_sender<AdminCap>(scenario);
        let mut product = ts::take_shared<Product>(scenario);
        registry::allow_pcr(&admin, &mut product, PCR);
        ts::return_to_sender(scenario, admin);
        ts::return_shared(product);
    };

    // Tx 4 — customer creates a Quote against the product
    ts::next_tx(scenario, CUSTOMER);
    let quote_id;
    {
        let product = ts::take_shared<Product>(scenario);
        let mut clk = clock::create_for_testing(ts::ctx(scenario));
        clock::set_for_testing(&mut clk, 1_000_000);

        quote_id = quote::create_and_freeze(
            &product,
            CUSTOMER,
            PRICE,
            types::pricing_fixed(),
            b"success-criteria-bytes",
            2_000_000, // expires
            vector[],  // empty issuer attestation (P1)
            &clk,
            ts::ctx(scenario),
        );

        ts::return_shared(product);
        clock::destroy_for_testing(clk);
    };

    (product_id, quote_id)
}

/// Drives a full happy-path lifecycle (quote → workflow → execution → outcome
/// → wait for dispute window → settlement). Returns the workflow ID for
/// inspection.
fun run_happy_path(scenario: &mut ts::Scenario): ID {
    let (_product_id, quote_id) = setup_scenario(scenario);
    let _ = quote_id;

    // Tx 5 — customer locks USDC + creates Workflow
    ts::next_tx(scenario, CUSTOMER);
    let wf_id;
    {
        let product = ts::take_shared<Product>(scenario);
        let quote = ts::take_immutable<quote::Quote>(scenario);
        let payment = mint(PRICE, ts::ctx(scenario));
        let mut clk = clock::create_for_testing(ts::ctx(scenario));
        clock::set_for_testing(&mut clk, 1_500_000);

        wf_id = workflow::create_from_quote<USDC>(
            &product, &quote, payment, &clk, ts::ctx(scenario),
        );

        ts::return_shared(product);
        ts::return_immutable(quote);
        clock::destroy_for_testing(clk);
    };

    // Tx 6 — customer records execution
    ts::next_tx(scenario, CUSTOMER);
    {
        let mut wf = ts::take_shared<Workflow<USDC>>(scenario);
        let mut clk = clock::create_for_testing(ts::ctx(scenario));
        clock::set_for_testing(&mut clk, 1_600_000);

        let items = vector[
            execution::new_cost_item(MODEL_PROVIDER, types::category_model(), 12000, 20_000_000),
            execution::new_cost_item(TOOL_PROVIDER, types::category_tool(), 3, 2_000_000),
        ];
        execution::record<USDC>(
            &mut wf, 1_500_000, items, b"trace_blob_id", &clk, ts::ctx(scenario),
        );

        ts::return_shared(wf);
        clock::destroy_for_testing(clk);
    };

    // Tx 7 — verifier (off-chain) sends signed payload; we record Outcome.
    ts::next_tx(scenario, CUSTOMER);
    {
        let mut wf = ts::take_shared<Workflow<USDC>>(scenario);
        let product = ts::take_shared<Product>(scenario);
        let quote = ts::take_immutable<quote::Quote>(scenario);
        let mut clk = clock::create_for_testing(ts::ctx(scenario));
        clock::set_for_testing(&mut clk, 1_700_000);

        let reconciled = vector[
            execution::new_cost_item(MODEL_PROVIDER, types::category_model(), 12000, 20_000_000),
            execution::new_cost_item(TOOL_PROVIDER, types::category_tool(), 3, 2_000_000),
        ];
        let splits = vector[
            attestation::new_split(MODEL_PROVIDER, 20_000_000, types::role_model_provider()),
            attestation::new_split(TOOL_PROVIDER, 2_000_000, types::role_tool()),
            attestation::new_split(PLATFORM_TREASURY, 5_000_000, types::role_platform()),
            attestation::new_split(AGENT_CO, 73_000_000, types::role_agent_company()),
        ];
        let payload = attestation::new_payload(
            object::id(&wf),
            true, // success
            b"outcome_blob",
            b"trace_blob",
            b"proof_blob",
            reconciled,
            splits,
            5_000_000,
            b"nonce_abc",
            1_700_000,
        );
        let attestations = vector[atte(b"sig_a")];

        attestation::verify_and_record_outcome<USDC>(
            &mut wf, &product, &quote, payload, attestations,
            DISPUTE_WINDOW_SEC, &clk, ts::ctx(scenario),
        );

        ts::return_shared(wf);
        ts::return_shared(product);
        ts::return_immutable(quote);
        clock::destroy_for_testing(clk);
    };

    // Tx 8 — keeper (any address) calls settle_workflow after dispute window.
    ts::next_tx(scenario, ATTACKER); // demonstrating permissionless trigger
    {
        let mut wf = ts::take_shared<Workflow<USDC>>(scenario);
        let product = ts::take_shared<Product>(scenario);
        let preg = ts::take_shared<ProviderRegistry>(scenario);
        let quote = ts::take_immutable<quote::Quote>(scenario);
        let exec = ts::take_shared<execution::Execution>(scenario);
        let outc = ts::take_shared<outcome::Outcome>(scenario);

        // Advance clock past dispute window (1_700_000 + 24h*1000 = 88_100_000)
        let mut clk = clock::create_for_testing(ts::ctx(scenario));
        clock::set_for_testing(&mut clk, 100_000_000);

        // Reconstruct the same payload + attestations the SDK would submit.
        let reconciled = vector[
            execution::new_cost_item(MODEL_PROVIDER, types::category_model(), 12000, 20_000_000),
            execution::new_cost_item(TOOL_PROVIDER, types::category_tool(), 3, 2_000_000),
        ];
        let splits = vector[
            attestation::new_split(MODEL_PROVIDER, 20_000_000, types::role_model_provider()),
            attestation::new_split(TOOL_PROVIDER, 2_000_000, types::role_tool()),
            attestation::new_split(PLATFORM_TREASURY, 5_000_000, types::role_platform()),
            attestation::new_split(AGENT_CO, 73_000_000, types::role_agent_company()),
        ];
        let payload = attestation::new_payload(
            object::id(&wf), true,
            b"outcome_blob", b"trace_blob", b"proof_blob",
            reconciled, splits, 5_000_000, b"nonce_abc", 1_700_000,
        );
        let attestations = vector[atte(b"sig_a")];

        settlement::settle_workflow<USDC>(
            &mut wf, &product, &preg, &quote, &exec, &outc,
            payload, attestations, &clk, ts::ctx(scenario),
        );

        // Workflow should now be SETTLED.
        assert!(workflow::status(&wf) == types::status_settled(), 9001);
        assert!(workflow::escrow_balance(&wf) == 0, 9002);
        assert!(workflow::total_revenue(&wf) == 100_000_000, 9003);
        assert!(workflow::total_cost(&wf) == 22_000_000, 9004);
        assert!(workflow::margin(&wf) == 73_000_000, 9005);

        ts::return_shared(wf);
        ts::return_shared(product);
        ts::return_shared(preg);
        ts::return_immutable(quote);
        ts::return_shared(exec);
        ts::return_shared(outc);
        clock::destroy_for_testing(clk);
    };

    wf_id
}

// === Happy-path test ===

#[test]
fun happy_path_settlement() {
    let mut scenario = ts::begin(ADMIN);
    let _wf_id = run_happy_path(&mut scenario);

    // Inspect Settlement object (sent to AGENT_CO as a side-effect? No,
    // it's a shared object). Take from shared.
    ts::next_tx(&mut scenario, ATTACKER);
    {
        let s = ts::take_shared<Settlement>(&scenario);
        assert!(settlement::total_settled(&s) == 100_000_000, 9100);
        assert!(settlement::platform_fee(&s) == 5_000_000, 9101);
        assert!(settlement::splits(&s).length() == 4, 9102);
        ts::return_shared(s);
    };

    // Verify each recipient received their coin (it would have been
    // public_transfer'd — we can check by trying to take Coin<USDC>).
    ts::next_tx(&mut scenario, AGENT_CO);
    {
        let c = ts::take_from_sender<coin::Coin<USDC>>(&scenario);
        assert!(coin::value(&c) == 73_000_000, 9110);
        ts::return_to_sender(&scenario, c);
    };
    ts::next_tx(&mut scenario, MODEL_PROVIDER);
    {
        let c = ts::take_from_sender<coin::Coin<USDC>>(&scenario);
        assert!(coin::value(&c) == 20_000_000, 9111);
        ts::return_to_sender(&scenario, c);
    };
    ts::next_tx(&mut scenario, TOOL_PROVIDER);
    {
        let c = ts::take_from_sender<coin::Coin<USDC>>(&scenario);
        assert!(coin::value(&c) == 2_000_000, 9112);
        ts::return_to_sender(&scenario, c);
    };
    ts::next_tx(&mut scenario, PLATFORM_TREASURY);
    {
        let c = ts::take_from_sender<coin::Coin<USDC>>(&scenario);
        assert!(coin::value(&c) == 5_000_000, 9113);
        ts::return_to_sender(&scenario, c);
    };

    ts::end(scenario);
}

// === Failure-path test: outcome.success = false → full refund to customer ===

#[test]
fun failure_path_full_refund() {
    let mut scenario = ts::begin(ADMIN);
    let (_pid, _qid) = setup_scenario(&mut scenario);

    // Workflow + execution (same as happy path)
    ts::next_tx(&mut scenario, CUSTOMER);
    {
        let product = ts::take_shared<Product>(&scenario);
        let quote = ts::take_immutable<quote::Quote>(&scenario);
        let payment = mint(PRICE, ts::ctx(&mut scenario));
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 1_500_000);
        workflow::create_from_quote<USDC>(
            &product, &quote, payment, &clk, ts::ctx(&mut scenario),
        );
        ts::return_shared(product);
        ts::return_immutable(quote);
        clock::destroy_for_testing(clk);
    };
    ts::next_tx(&mut scenario, CUSTOMER);
    {
        let mut wf = ts::take_shared<Workflow<USDC>>(&scenario);
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 1_600_000);
        let items = vector[
            execution::new_cost_item(MODEL_PROVIDER, types::category_model(), 12000, 20_000_000),
        ];
        execution::record<USDC>(&mut wf, 1_500_000, items, b"trace", &clk, ts::ctx(&mut scenario));
        ts::return_shared(wf);
        clock::destroy_for_testing(clk);
    };

    // Outcome with success=false
    ts::next_tx(&mut scenario, CUSTOMER);
    {
        let mut wf = ts::take_shared<Workflow<USDC>>(&scenario);
        let product = ts::take_shared<Product>(&scenario);
        let quote = ts::take_immutable<quote::Quote>(&scenario);
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 1_700_000);

        let payload = attestation::new_payload(
            object::id(&wf), false, // FAILURE
            b"outcome_blob", b"trace_blob", b"proof_blob",
            vector[], vector[], 0, b"nonce_fail", 1_700_000,
        );
        let attestations = vector[atte(b"sig_a")];
        attestation::verify_and_record_outcome<USDC>(
            &mut wf, &product, &quote, payload, attestations,
            DISPUTE_WINDOW_SEC, &clk, ts::ctx(&mut scenario),
        );

        ts::return_shared(wf);
        ts::return_shared(product);
        ts::return_immutable(quote);
        clock::destroy_for_testing(clk);
    };

    // Settle — should refund customer in full
    ts::next_tx(&mut scenario, ATTACKER);
    {
        let mut wf = ts::take_shared<Workflow<USDC>>(&scenario);
        let product = ts::take_shared<Product>(&scenario);
        let preg = ts::take_shared<ProviderRegistry>(&scenario);
        let quote = ts::take_immutable<quote::Quote>(&scenario);
        let exec = ts::take_shared<execution::Execution>(&scenario);
        let outc = ts::take_shared<outcome::Outcome>(&scenario);
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 100_000_000);

        let payload = attestation::new_payload(
            object::id(&wf), false,
            b"outcome_blob", b"trace_blob", b"proof_blob",
            vector[], vector[], 0, b"nonce_fail", 1_700_000,
        );
        let attestations = vector[atte(b"sig_a")];
        settlement::settle_workflow<USDC>(
            &mut wf, &product, &preg, &quote, &exec, &outc,
            payload, attestations, &clk, ts::ctx(&mut scenario),
        );
        assert!(workflow::status(&wf) == types::status_refunded(), 9200);
        assert!(workflow::escrow_balance(&wf) == 0, 9201);

        ts::return_shared(wf);
        ts::return_shared(product);
        ts::return_shared(preg);
        ts::return_immutable(quote);
        ts::return_shared(exec);
        ts::return_shared(outc);
        clock::destroy_for_testing(clk);
    };

    // Customer should now hold a Coin<USDC> with the refunded amount.
    ts::next_tx(&mut scenario, CUSTOMER);
    {
        let c = ts::take_from_sender<coin::Coin<USDC>>(&scenario);
        assert!(coin::value(&c) == PRICE, 9210);
        ts::return_to_sender(&scenario, c);
    };

    ts::end(scenario);
}

// === Negative test: settle before dispute window closes is rejected ===

#[test]
#[expected_failure(abort_code = 800002, location = weaveos::settlement)]
fun settle_before_dispute_window_closes_aborts() {
    let mut scenario = ts::begin(ADMIN);
    let (_pid, _qid) = setup_scenario(&mut scenario);
    // Quick lifecycle up to outcome
    ts::next_tx(&mut scenario, CUSTOMER);
    {
        let product = ts::take_shared<Product>(&scenario);
        let quote = ts::take_immutable<quote::Quote>(&scenario);
        let payment = mint(PRICE, ts::ctx(&mut scenario));
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 1_500_000);
        workflow::create_from_quote<USDC>(
            &product, &quote, payment, &clk, ts::ctx(&mut scenario),
        );
        ts::return_shared(product);
        ts::return_immutable(quote);
        clock::destroy_for_testing(clk);
    };
    ts::next_tx(&mut scenario, CUSTOMER);
    {
        let mut wf = ts::take_shared<Workflow<USDC>>(&scenario);
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 1_600_000);
        let items = vector[
            execution::new_cost_item(MODEL_PROVIDER, types::category_model(), 1, 10_000_000),
        ];
        execution::record<USDC>(&mut wf, 1_500_000, items, b"t", &clk, ts::ctx(&mut scenario));
        ts::return_shared(wf);
        clock::destroy_for_testing(clk);
    };
    ts::next_tx(&mut scenario, CUSTOMER);
    {
        let mut wf = ts::take_shared<Workflow<USDC>>(&scenario);
        let product = ts::take_shared<Product>(&scenario);
        let quote = ts::take_immutable<quote::Quote>(&scenario);
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 1_700_000);
        let payload = attestation::new_payload(
            object::id(&wf), true,
            b"o", b"t", b"p",
            vector[execution::new_cost_item(MODEL_PROVIDER, types::category_model(), 1, 10_000_000)],
            vector[
                attestation::new_split(MODEL_PROVIDER, 10_000_000, types::role_model_provider()),
                attestation::new_split(AGENT_CO, 85_000_000, types::role_agent_company()),
                attestation::new_split(PLATFORM_TREASURY, 5_000_000, types::role_platform()),
            ],
            5_000_000, b"n", 1_700_000,
        );
        attestation::verify_and_record_outcome<USDC>(
            &mut wf, &product, &quote, payload, vector[atte(b"s")],
            DISPUTE_WINDOW_SEC, &clk, ts::ctx(&mut scenario),
        );
        ts::return_shared(wf);
        ts::return_shared(product);
        ts::return_immutable(quote);
        clock::destroy_for_testing(clk);
    };
    // Try to settle BEFORE the window closes — expect abort.
    ts::next_tx(&mut scenario, ATTACKER);
    {
        let mut wf = ts::take_shared<Workflow<USDC>>(&scenario);
        let product = ts::take_shared<Product>(&scenario);
        let preg = ts::take_shared<ProviderRegistry>(&scenario);
        let quote = ts::take_immutable<quote::Quote>(&scenario);
        let exec = ts::take_shared<execution::Execution>(&scenario);
        let outc = ts::take_shared<outcome::Outcome>(&scenario);
        // Window not closed yet
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 1_800_000);

        let payload = attestation::new_payload(
            object::id(&wf), true,
            b"o", b"t", b"p",
            vector[execution::new_cost_item(MODEL_PROVIDER, types::category_model(), 1, 10_000_000)],
            vector[
                attestation::new_split(MODEL_PROVIDER, 10_000_000, types::role_model_provider()),
                attestation::new_split(AGENT_CO, 85_000_000, types::role_agent_company()),
                attestation::new_split(PLATFORM_TREASURY, 5_000_000, types::role_platform()),
            ],
            5_000_000, b"n", 1_700_000,
        );
        settlement::settle_workflow<USDC>(
            &mut wf, &product, &preg, &quote, &exec, &outc,
            payload, vector[atte(b"s")], &clk, ts::ctx(&mut scenario),
        );

        ts::return_shared(wf);
        ts::return_shared(product);
        ts::return_shared(preg);
        ts::return_immutable(quote);
        ts::return_shared(exec);
        ts::return_shared(outc);
        clock::destroy_for_testing(clk);
    };
    ts::end(scenario);
}

// === Negative test: self-pay rejected ===

#[test]
#[expected_failure(abort_code = 800009, location = weaveos::settlement)]
fun self_pay_rejected() {
    let mut scenario = ts::begin(ADMIN);
    let (_pid, _qid) = setup_scenario(&mut scenario);

    ts::next_tx(&mut scenario, CUSTOMER);
    {
        let product = ts::take_shared<Product>(&scenario);
        let quote = ts::take_immutable<quote::Quote>(&scenario);
        let payment = mint(PRICE, ts::ctx(&mut scenario));
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 1_500_000);
        workflow::create_from_quote<USDC>(
            &product, &quote, payment, &clk, ts::ctx(&mut scenario),
        );
        ts::return_shared(product);
        ts::return_immutable(quote);
        clock::destroy_for_testing(clk);
    };
    ts::next_tx(&mut scenario, CUSTOMER);
    {
        let mut wf = ts::take_shared<Workflow<USDC>>(&scenario);
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 1_600_000);
        execution::record<USDC>(&mut wf, 1_500_000, vector[], b"t", &clk, ts::ctx(&mut scenario));
        ts::return_shared(wf);
        clock::destroy_for_testing(clk);
    };
    ts::next_tx(&mut scenario, CUSTOMER);
    {
        let mut wf = ts::take_shared<Workflow<USDC>>(&scenario);
        let product = ts::take_shared<Product>(&scenario);
        let quote = ts::take_immutable<quote::Quote>(&scenario);
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 1_700_000);
        let payload = attestation::new_payload(
            object::id(&wf), true,
            b"o", b"t", b"p", vector[],
            vector[attestation::new_split(AGENT_CO, 100_000_000, types::role_agent_company())],
            0, b"n", 1_700_000,
        );
        attestation::verify_and_record_outcome<USDC>(
            &mut wf, &product, &quote, payload, vector[atte(b"s")],
            DISPUTE_WINDOW_SEC, &clk, ts::ctx(&mut scenario),
        );
        ts::return_shared(wf);
        ts::return_shared(product);
        ts::return_immutable(quote);
        clock::destroy_for_testing(clk);
    };
    ts::next_tx(&mut scenario, ATTACKER);
    {
        let mut wf = ts::take_shared<Workflow<USDC>>(&scenario);
        let product = ts::take_shared<Product>(&scenario);
        let preg = ts::take_shared<ProviderRegistry>(&scenario);
        let quote = ts::take_immutable<quote::Quote>(&scenario);
        let exec = ts::take_shared<execution::Execution>(&scenario);
        let outc = ts::take_shared<outcome::Outcome>(&scenario);
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 100_000_000);

        // Malicious payload: a split going BACK to the customer.
        let payload = attestation::new_payload(
            object::id(&wf), true,
            b"o", b"t", b"p", vector[],
            vector[
                attestation::new_split(CUSTOMER, 50_000_000, types::role_agent_company()),
                attestation::new_split(AGENT_CO, 50_000_000, types::role_agent_company()),
            ],
            0, b"n", 1_700_000,
        );
        settlement::settle_workflow<USDC>(
            &mut wf, &product, &preg, &quote, &exec, &outc,
            payload, vector[atte(b"s")], &clk, ts::ctx(&mut scenario),
        );

        ts::return_shared(wf);
        ts::return_shared(product);
        ts::return_shared(preg);
        ts::return_immutable(quote);
        ts::return_shared(exec);
        ts::return_shared(outc);
        clock::destroy_for_testing(clk);
    };
    ts::end(scenario);
}

// === Negative test: unregistered model provider rejected ===

#[test]
#[expected_failure(abort_code = 800012, location = weaveos::settlement)]
fun unregistered_recipient_rejected() {
    let mut scenario = ts::begin(ADMIN);
    let (_pid, _qid) = setup_scenario(&mut scenario);
    ts::next_tx(&mut scenario, CUSTOMER);
    {
        let product = ts::take_shared<Product>(&scenario);
        let quote = ts::take_immutable<quote::Quote>(&scenario);
        let payment = mint(PRICE, ts::ctx(&mut scenario));
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 1_500_000);
        workflow::create_from_quote<USDC>(
            &product, &quote, payment, &clk, ts::ctx(&mut scenario),
        );
        ts::return_shared(product);
        ts::return_immutable(quote);
        clock::destroy_for_testing(clk);
    };
    ts::next_tx(&mut scenario, CUSTOMER);
    {
        let mut wf = ts::take_shared<Workflow<USDC>>(&scenario);
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 1_600_000);
        execution::record<USDC>(
            &mut wf, 1_500_000,
            vector[execution::new_cost_item(MODEL_PROVIDER, types::category_model(), 1, 10_000_000)],
            b"t", &clk, ts::ctx(&mut scenario),
        );
        ts::return_shared(wf);
        clock::destroy_for_testing(clk);
    };
    ts::next_tx(&mut scenario, CUSTOMER);
    {
        let mut wf = ts::take_shared<Workflow<USDC>>(&scenario);
        let product = ts::take_shared<Product>(&scenario);
        let quote = ts::take_immutable<quote::Quote>(&scenario);
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 1_700_000);
        let payload = attestation::new_payload(
            object::id(&wf), true,
            b"o", b"t", b"p",
            vector[execution::new_cost_item(@0xDEAD, types::category_model(), 1, 10_000_000)],
            vector[
                // Sending to an UNREGISTERED address with role=model_provider
                attestation::new_split(@0xDEAD, 10_000_000, types::role_model_provider()),
                attestation::new_split(AGENT_CO, 90_000_000, types::role_agent_company()),
            ],
            0, b"n", 1_700_000,
        );
        attestation::verify_and_record_outcome<USDC>(
            &mut wf, &product, &quote, payload, vector[atte(b"s")],
            DISPUTE_WINDOW_SEC, &clk, ts::ctx(&mut scenario),
        );
        ts::return_shared(wf);
        ts::return_shared(product);
        ts::return_immutable(quote);
        clock::destroy_for_testing(clk);
    };
    ts::next_tx(&mut scenario, ATTACKER);
    {
        let mut wf = ts::take_shared<Workflow<USDC>>(&scenario);
        let product = ts::take_shared<Product>(&scenario);
        let preg = ts::take_shared<ProviderRegistry>(&scenario);
        let quote = ts::take_immutable<quote::Quote>(&scenario);
        let exec = ts::take_shared<execution::Execution>(&scenario);
        let outc = ts::take_shared<outcome::Outcome>(&scenario);
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 100_000_000);
        let payload = attestation::new_payload(
            object::id(&wf), true,
            b"o", b"t", b"p",
            vector[execution::new_cost_item(@0xDEAD, types::category_model(), 1, 10_000_000)],
            vector[
                attestation::new_split(@0xDEAD, 10_000_000, types::role_model_provider()),
                attestation::new_split(AGENT_CO, 90_000_000, types::role_agent_company()),
            ],
            0, b"n", 1_700_000,
        );
        settlement::settle_workflow<USDC>(
            &mut wf, &product, &preg, &quote, &exec, &outc,
            payload, vector[atte(b"s")], &clk, ts::ctx(&mut scenario),
        );
        ts::return_shared(wf);
        ts::return_shared(product);
        ts::return_shared(preg);
        ts::return_immutable(quote);
        ts::return_shared(exec);
        ts::return_shared(outc);
        clock::destroy_for_testing(clk);
    };
    ts::end(scenario);
}

// === Dev-signer path: unregistered pubkey is rejected ===
//
// Crypto is hard to exercise inside Move tests because there's no `ed25519_sign`
// — only `ed25519_verify`. So we cover the validation invariants here (signer
// allowlist, bad signature) and leave the happy-path signing to the off-chain
// TS verifier tests (P2 task 24, end-to-end test on Vercel preview).

#[test]
#[expected_failure(abort_code = 700009, location = weaveos::attestation)]
fun dev_path_unregistered_signer_rejected() {
    let mut scenario = ts::begin(ADMIN);
    let (_pid, _qid) = setup_scenario(&mut scenario);
    // Note: setup_scenario only registers the PCR (production path). It does
    // NOT register any dev signers, so any dev attestation should fail.
    ts::next_tx(&mut scenario, CUSTOMER);
    {
        let product = ts::take_shared<Product>(&scenario);
        let quote = ts::take_immutable<quote::Quote>(&scenario);
        let payment = mint(PRICE, ts::ctx(&mut scenario));
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 1_500_000);
        workflow::create_from_quote<USDC>(
            &product, &quote, payment, &clk, ts::ctx(&mut scenario),
        );
        ts::return_shared(product);
        ts::return_immutable(quote);
        clock::destroy_for_testing(clk);
    };
    ts::next_tx(&mut scenario, CUSTOMER);
    {
        let mut wf = ts::take_shared<Workflow<USDC>>(&scenario);
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 1_600_000);
        execution::record<USDC>(&mut wf, 1_500_000, vector[], b"t", &clk, ts::ctx(&mut scenario));
        ts::return_shared(wf);
        clock::destroy_for_testing(clk);
    };
    // Try to verify outcome via dev path — pubkey is not registered → abort.
    ts::next_tx(&mut scenario, CUSTOMER);
    {
        let mut wf = ts::take_shared<Workflow<USDC>>(&scenario);
        let product = ts::take_shared<Product>(&scenario);
        let quote = ts::take_immutable<quote::Quote>(&scenario);
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 1_700_000);

        let payload = attestation::new_payload(
            object::id(&wf), true,
            b"o", b"t", b"p", vector[],
            vector[attestation::new_split(AGENT_CO, 100_000_000, types::role_agent_company())],
            0, b"n", 1_700_000,
        );
        let bogus_pubkey: vector<u8> = vector[
            1u8,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15, 16,
           17,   18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
        ];
        let bogus_sig: vector<u8> = zero_bytes(64);
        let dev_attestations = vector[attestation::new_dev_attestation(bogus_pubkey, bogus_sig)];

        attestation::verify_and_record_outcome_dev<USDC>(
            &mut wf, &product, &quote, payload, dev_attestations,
            DISPUTE_WINDOW_SEC, &clk, ts::ctx(&mut scenario),
        );

        ts::return_shared(wf);
        ts::return_shared(product);
        ts::return_immutable(quote);
        clock::destroy_for_testing(clk);
    };
    ts::end(scenario);
}

// === Dev-signer path: registered pubkey but bad signature is rejected ===

#[test]
#[expected_failure(abort_code = 700010, location = weaveos::attestation)]
fun dev_path_bad_signature_rejected() {
    let mut scenario = ts::begin(ADMIN);
    let (_pid, _qid) = setup_scenario(&mut scenario);

    // Register a dummy ed25519 pubkey on the Product. We never use the
    // corresponding private key — we just want the allowlist check to pass
    // so the bad-signature check fires next.
    let dev_pubkey: vector<u8> = vector[
        7u8, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
        7,   7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
    ];
    ts::next_tx(&mut scenario, ADMIN);
    {
        let admin = ts::take_from_sender<AdminCap>(&scenario);
        let mut product = ts::take_shared<Product>(&scenario);
        registry::allow_dev_signer(&admin, &mut product, dev_pubkey);
        ts::return_to_sender(&scenario, admin);
        ts::return_shared(product);
    };

    ts::next_tx(&mut scenario, CUSTOMER);
    {
        let product = ts::take_shared<Product>(&scenario);
        let quote = ts::take_immutable<quote::Quote>(&scenario);
        let payment = mint(PRICE, ts::ctx(&mut scenario));
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 1_500_000);
        workflow::create_from_quote<USDC>(
            &product, &quote, payment, &clk, ts::ctx(&mut scenario),
        );
        ts::return_shared(product);
        ts::return_immutable(quote);
        clock::destroy_for_testing(clk);
    };
    ts::next_tx(&mut scenario, CUSTOMER);
    {
        let mut wf = ts::take_shared<Workflow<USDC>>(&scenario);
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 1_600_000);
        execution::record<USDC>(&mut wf, 1_500_000, vector[], b"t", &clk, ts::ctx(&mut scenario));
        ts::return_shared(wf);
        clock::destroy_for_testing(clk);
    };
    ts::next_tx(&mut scenario, CUSTOMER);
    {
        let mut wf = ts::take_shared<Workflow<USDC>>(&scenario);
        let product = ts::take_shared<Product>(&scenario);
        let quote = ts::take_immutable<quote::Quote>(&scenario);
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 1_700_000);

        let payload = attestation::new_payload(
            object::id(&wf), true,
            b"o", b"t", b"p", vector[],
            vector[attestation::new_split(AGENT_CO, 100_000_000, types::role_agent_company())],
            0, b"n", 1_700_000,
        );
        // pubkey is allowlisted; signature is all zeros → ed25519_verify returns false
        let bad_sig: vector<u8> = zero_bytes(64);
        let dev_pubkey_local: vector<u8> = vector[
            7u8, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
            7,   7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
        ];
        let dev_attestations = vector[
            attestation::new_dev_attestation(dev_pubkey_local, bad_sig),
        ];

        attestation::verify_and_record_outcome_dev<USDC>(
            &mut wf, &product, &quote, payload, dev_attestations,
            DISPUTE_WINDOW_SEC, &clk, ts::ctx(&mut scenario),
        );

        ts::return_shared(wf);
        ts::return_shared(product);
        ts::return_immutable(quote);
        clock::destroy_for_testing(clk);
    };
    ts::end(scenario);
}

// === Dispute filing during the window succeeds and blocks settlement ===
// Note: when a dispute is filed, status flips to DISPUTED, so the first
// guard E_NOT_VERIFIED (800001) fires before E_DISPUTE_OPEN (800003).
// E_DISPUTE_OPEN remains as defensive coverage for Phase 2 dispute resolution
// flows that may restore status to VERIFIED while a dispute is still open.

#[test]
#[expected_failure(abort_code = 800001, location = weaveos::settlement)]
fun dispute_filed_blocks_settlement() {
    let mut scenario = ts::begin(ADMIN);
    let (_pid, _qid) = setup_scenario(&mut scenario);
    ts::next_tx(&mut scenario, CUSTOMER);
    {
        let product = ts::take_shared<Product>(&scenario);
        let quote = ts::take_immutable<quote::Quote>(&scenario);
        let payment = mint(PRICE, ts::ctx(&mut scenario));
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 1_500_000);
        workflow::create_from_quote<USDC>(
            &product, &quote, payment, &clk, ts::ctx(&mut scenario),
        );
        ts::return_shared(product);
        ts::return_immutable(quote);
        clock::destroy_for_testing(clk);
    };
    ts::next_tx(&mut scenario, CUSTOMER);
    {
        let mut wf = ts::take_shared<Workflow<USDC>>(&scenario);
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 1_600_000);
        execution::record<USDC>(&mut wf, 1_500_000, vector[], b"t", &clk, ts::ctx(&mut scenario));
        ts::return_shared(wf);
        clock::destroy_for_testing(clk);
    };
    ts::next_tx(&mut scenario, CUSTOMER);
    {
        let mut wf = ts::take_shared<Workflow<USDC>>(&scenario);
        let product = ts::take_shared<Product>(&scenario);
        let quote = ts::take_immutable<quote::Quote>(&scenario);
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 1_700_000);
        let payload = attestation::new_payload(
            object::id(&wf), true,
            b"o", b"t", b"p", vector[],
            vector[
                attestation::new_split(AGENT_CO, 100_000_000, types::role_agent_company()),
            ],
            0, b"n", 1_700_000,
        );
        attestation::verify_and_record_outcome<USDC>(
            &mut wf, &product, &quote, payload, vector[atte(b"s")],
            DISPUTE_WINDOW_SEC, &clk, ts::ctx(&mut scenario),
        );
        ts::return_shared(wf);
        ts::return_shared(product);
        ts::return_immutable(quote);
        clock::destroy_for_testing(clk);
    };
    // Customer files dispute
    ts::next_tx(&mut scenario, CUSTOMER);
    {
        let mut wf = ts::take_shared<Workflow<USDC>>(&scenario);
        let outc = ts::take_shared<outcome::Outcome>(&scenario);
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 1_800_000);
        outcome::file_dispute<USDC>(&mut wf, &outc, b"evidence", &clk, ts::ctx(&mut scenario));
        assert!(workflow::status(&wf) == types::status_disputed(), 9300);
        assert!(workflow::open_dispute_count(&wf) == 1, 9301);
        ts::return_shared(wf);
        ts::return_shared(outc);
        clock::destroy_for_testing(clk);
    };
    // Try to settle — should fail because both status != VERIFIED and
    // open_dispute_count > 0. The status check trips first (E_NOT_VERIFIED).
    // To target E_DISPUTE_OPEN specifically we'd need to bypass status; here
    // we just verify a dispute blocks settlement. E_NOT_VERIFIED = 800001.
    ts::next_tx(&mut scenario, ATTACKER);
    {
        let mut wf = ts::take_shared<Workflow<USDC>>(&scenario);
        let product = ts::take_shared<Product>(&scenario);
        let preg = ts::take_shared<ProviderRegistry>(&scenario);
        let quote = ts::take_immutable<quote::Quote>(&scenario);
        let exec = ts::take_shared<execution::Execution>(&scenario);
        let outc = ts::take_shared<outcome::Outcome>(&scenario);
        let mut clk = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clk, 100_000_000);
        let payload = attestation::new_payload(
            object::id(&wf), true,
            b"o", b"t", b"p", vector[],
            vector[attestation::new_split(AGENT_CO, 100_000_000, types::role_agent_company())],
            0, b"n", 1_700_000,
        );
        // This call will abort. E_NOT_VERIFIED = 800001 fires first because
        // we marked the workflow DISPUTED. To make the dispute-open code path
        // 800003 fire instead, the workflow status would need to remain
        // VERIFIED — which would require a different test setup. We assert
        // the first guard fires.
        settlement::settle_workflow<USDC>(
            &mut wf, &product, &preg, &quote, &exec, &outc,
            payload, vector[atte(b"s")], &clk, ts::ctx(&mut scenario),
        );
        ts::return_shared(wf);
        ts::return_shared(product);
        ts::return_shared(preg);
        ts::return_immutable(quote);
        ts::return_shared(exec);
        ts::return_shared(outc);
        clock::destroy_for_testing(clk);
    };
    ts::end(scenario);
}
