// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {WeaveosTypes} from "../src/WeaveosTypes.sol";
import {WeaveosRegistry} from "../src/WeaveosRegistry.sol";
import {WeaveosCore} from "../src/WeaveosCore.sol";
import {MockUSDC, IERC20} from "../src/MockUSDC.sol";

/// Port of backend/move/tests/weaveos_tests.move — same 8 scenarios.
contract WeaveosTest is Test {
    WeaveosRegistry registry;
    WeaveosCore core;
    MockUSDC usdc;

    address admin = makeAddr("admin");
    address customer = makeAddr("customer");
    address agentCo = makeAddr("agentCo");
    address modelProvider = makeAddr("modelProvider");
    address toolProvider = makeAddr("toolProvider");
    address platform = makeAddr("platform");

    uint256 devSignerKey;
    address devSigner;
    uint256 rogueKey;
    address rogueSigner;

    uint256 productId;

    uint64 constant PRICE = 100_000_000; // 100 USDC
    uint64 constant MODEL_COST = 15_000_000; // 15 USDC
    uint64 constant TOOL_COST = 7_000_000; // 7 USDC
    uint64 constant FEE = 5_000_000; // 5 USDC (5%)
    uint64 constant DISPUTE_WINDOW_S = 3600;

    function setUp() public {
        (devSigner, devSignerKey) = makeAddrAndKey("devSigner");
        (rogueSigner, rogueKey) = makeAddrAndKey("rogueSigner");

        vm.startPrank(admin);
        registry = new WeaveosRegistry();
        usdc = new MockUSDC();
        core = new WeaveosCore(registry, IERC20(address(usdc)));

        productId = registry.createProduct(
            "ticket-resolution",
            agentCo,
            500, // fee_bps 5%
            10_000_000, // fee_cap 10 USDC
            1000, // fee_max_bps 10%
            1, // min_attestations
            WeaveosTypes.FAILURE_FULL_REFUND
        );
        registry.allowDevSigner(productId, devSigner);
        registry.registerProvider(modelProvider, WeaveosTypes.ROLE_MODEL_PROVIDER, "anthropic");
        registry.registerProvider(toolProvider, WeaveosTypes.ROLE_TOOL, "serpapi");
        vm.stopPrank();

        usdc.mint(customer, 1_000_000_000); // 1000 USDC
    }

    // === Helpers ===

    function _createQuoteAndWorkflow() internal returns (uint256 workflowId) {
        vm.startPrank(customer);
        uint256 quoteId = core.createQuote(
            productId,
            customer,
            PRICE,
            WeaveosTypes.PRICING_FIXED,
            hex"a1", // CBOR stub criteria
            uint64((block.timestamp + 1 days) * 1000),
            ""
        );
        usdc.approve(address(core), PRICE);
        workflowId = core.createWorkflowFromQuote(quoteId, PRICE);
        vm.stopPrank();
    }

    function _recordExecution(uint256 workflowId) internal {
        WeaveosTypes.CostItem[] memory items = new WeaveosTypes.CostItem[](2);
        items[0] = WeaveosTypes.CostItem(modelProvider, WeaveosTypes.CATEGORY_MODEL, 120_000, MODEL_COST);
        items[1] = WeaveosTypes.CostItem(toolProvider, WeaveosTypes.CATEGORY_TOOL, 4, TOOL_COST);
        vm.prank(customer);
        core.recordExecution(workflowId, uint64(block.timestamp * 1000), items, "trace-blob");
    }

    function _defaultSplits() internal view returns (WeaveosTypes.Split[] memory splits) {
        splits = new WeaveosTypes.Split[](4);
        splits[0] = WeaveosTypes.Split(agentCo, PRICE - MODEL_COST - TOOL_COST - FEE, WeaveosTypes.ROLE_AGENT_COMPANY);
        splits[1] = WeaveosTypes.Split(modelProvider, MODEL_COST, WeaveosTypes.ROLE_MODEL_PROVIDER);
        splits[2] = WeaveosTypes.Split(toolProvider, TOOL_COST, WeaveosTypes.ROLE_TOOL);
        splits[3] = WeaveosTypes.Split(platform, FEE, WeaveosTypes.ROLE_PLATFORM);
    }

    function _payload(uint256 workflowId, bool success, WeaveosTypes.Split[] memory splits)
        internal
        view
        returns (WeaveosTypes.AttestationPayload memory p)
    {
        WeaveosTypes.CostItem[] memory reconciled = new WeaveosTypes.CostItem[](2);
        reconciled[0] = WeaveosTypes.CostItem(modelProvider, WeaveosTypes.CATEGORY_MODEL, 120_000, MODEL_COST);
        reconciled[1] = WeaveosTypes.CostItem(toolProvider, WeaveosTypes.CATEGORY_TOOL, 4, TOOL_COST);
        p = WeaveosTypes.AttestationPayload({
            workflowId: workflowId,
            outcomeSuccess: success,
            outcomeBlobId: "outcome-blob",
            traceBlobId: "trace-blob",
            proofBlobId: "proof-blob",
            reconciledCostItems: reconciled,
            splits: splits,
            platformFee: success ? FEE : 0,
            nonce: keccak256("nonce"),
            timestampMs: uint64(block.timestamp * 1000)
        });
        if (!success) {
            p.reconciledCostItems = new WeaveosTypes.CostItem[](0);
        }
    }

    function _sign(WeaveosTypes.AttestationPayload memory p, uint256 key)
        internal
        pure
        returns (WeaveosTypes.DevAttestation[] memory atts)
    {
        bytes32 digest = keccak256(abi.encode(p));
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, ethDigest);
        atts = new WeaveosTypes.DevAttestation[](1);
        atts[0] = WeaveosTypes.DevAttestation(vm.addr(key), abi.encodePacked(r, s, v));
    }

    function _verifiedWorkflow(bool success)
        internal
        returns (uint256 workflowId, WeaveosTypes.AttestationPayload memory p, WeaveosTypes.DevAttestation[] memory atts)
    {
        workflowId = _createQuoteAndWorkflow();
        _recordExecution(workflowId);
        WeaveosTypes.Split[] memory splits = success
            ? _defaultSplits()
            : new WeaveosTypes.Split[](0);
        p = _payload(workflowId, success, splits);
        atts = _sign(p, devSignerKey);
        core.verifyAndRecordOutcomeDev(workflowId, p, atts, DISPUTE_WINDOW_S);
    }

    // === 1. happy_path_settlement ===
    function test_HappyPathSettlement() public {
        (uint256 wfId, WeaveosTypes.AttestationPayload memory p, WeaveosTypes.DevAttestation[] memory atts) =
            _verifiedWorkflow(true);

        vm.warp(block.timestamp + DISPUTE_WINDOW_S + 1);
        core.settleWorkflowDev(wfId, p, atts);

        WeaveosCore.Workflow memory w = core.getWorkflow(wfId);
        assertEq(uint8(w.status), uint8(WeaveosTypes.Status.Settled));
        assertEq(w.totalRevenue, PRICE);
        assertEq(w.totalCost, MODEL_COST + TOOL_COST);
        assertEq(w.margin, PRICE - MODEL_COST - TOOL_COST - FEE);
        assertEq(w.escrowBalance, 0);

        assertEq(usdc.balanceOf(agentCo), PRICE - MODEL_COST - TOOL_COST - FEE);
        assertEq(usdc.balanceOf(modelProvider), MODEL_COST);
        assertEq(usdc.balanceOf(toolProvider), TOOL_COST);
        assertEq(usdc.balanceOf(platform), FEE);

        WeaveosCore.Settlement memory st = core.getSettlement(wfId);
        assertEq(st.totalSettled, PRICE);
        assertEq(st.platformFee, FEE);
        assertEq(st.splits.length, 4);
    }

    // === 2. failure_path_full_refund ===
    function test_FailurePathFullRefund() public {
        uint256 balBefore = usdc.balanceOf(customer);
        (uint256 wfId, WeaveosTypes.AttestationPayload memory p, WeaveosTypes.DevAttestation[] memory atts) =
            _verifiedWorkflow(false);
        assertEq(usdc.balanceOf(customer), balBefore - PRICE);

        vm.warp(block.timestamp + DISPUTE_WINDOW_S + 1);
        core.settleWorkflowDev(wfId, p, atts);

        WeaveosCore.Workflow memory w = core.getWorkflow(wfId);
        assertEq(uint8(w.status), uint8(WeaveosTypes.Status.Refunded));
        assertEq(w.escrowBalance, 0);
        assertEq(usdc.balanceOf(customer), balBefore); // full refund
        assertEq(usdc.balanceOf(agentCo), 0); // agent company eats costs
    }

    // === 3. settle_before_dispute_window_closes_aborts (Move 800002) ===
    function test_RevertWhen_SettleBeforeDisputeWindowCloses() public {
        (uint256 wfId, WeaveosTypes.AttestationPayload memory p, WeaveosTypes.DevAttestation[] memory atts) =
            _verifiedWorkflow(true);

        vm.expectRevert(WeaveosCore.DisputeWindowOpen.selector);
        core.settleWorkflowDev(wfId, p, atts);
    }

    // === 4. self_pay_rejected (Move 800009) ===
    function test_RevertWhen_SelfPay() public {
        uint256 wfId = _createQuoteAndWorkflow();
        _recordExecution(wfId);

        WeaveosTypes.Split[] memory splits = _defaultSplits();
        splits[0] = WeaveosTypes.Split(customer, splits[0].amount, WeaveosTypes.ROLE_AGENT_COMPANY);
        WeaveosTypes.AttestationPayload memory p = _payload(wfId, true, splits);
        WeaveosTypes.DevAttestation[] memory atts = _sign(p, devSignerKey);
        core.verifyAndRecordOutcomeDev(wfId, p, atts, DISPUTE_WINDOW_S);

        vm.warp(block.timestamp + DISPUTE_WINDOW_S + 1);
        vm.expectRevert(WeaveosCore.SelfPay.selector);
        core.settleWorkflowDev(wfId, p, atts);
    }

    // === 5. unregistered_recipient_rejected (Move 800012) ===
    function test_RevertWhen_UnregisteredRecipient() public {
        uint256 wfId = _createQuoteAndWorkflow();
        _recordExecution(wfId);

        WeaveosTypes.Split[] memory splits = _defaultSplits();
        splits[1] = WeaveosTypes.Split(makeAddr("stranger"), MODEL_COST, WeaveosTypes.ROLE_MODEL_PROVIDER);
        WeaveosTypes.AttestationPayload memory p = _payload(wfId, true, splits);
        WeaveosTypes.DevAttestation[] memory atts = _sign(p, devSignerKey);
        core.verifyAndRecordOutcomeDev(wfId, p, atts, DISPUTE_WINDOW_S);

        vm.warp(block.timestamp + DISPUTE_WINDOW_S + 1);
        vm.expectRevert(WeaveosCore.UnregisteredProvider.selector);
        core.settleWorkflowDev(wfId, p, atts);
    }

    // === 6. dev_path_unregistered_signer_rejected (Move 700009) ===
    function test_RevertWhen_UnregisteredDevSigner() public {
        uint256 wfId = _createQuoteAndWorkflow();
        _recordExecution(wfId);

        WeaveosTypes.AttestationPayload memory p = _payload(wfId, true, _defaultSplits());
        WeaveosTypes.DevAttestation[] memory atts = _sign(p, rogueKey);

        vm.expectRevert(WeaveosCore.BadDevSigner.selector);
        core.verifyAndRecordOutcomeDev(wfId, p, atts, DISPUTE_WINDOW_S);
    }

    // === 7. dev_path_bad_signature_rejected (Move 700010) ===
    function test_RevertWhen_BadSignature() public {
        uint256 wfId = _createQuoteAndWorkflow();
        _recordExecution(wfId);

        WeaveosTypes.AttestationPayload memory p = _payload(wfId, true, _defaultSplits());
        // Signature from the rogue key but claiming to be the registered signer.
        WeaveosTypes.DevAttestation[] memory atts = _sign(p, rogueKey);
        atts[0].signer = devSigner;

        vm.expectRevert(WeaveosCore.BadDevSignature.selector);
        core.verifyAndRecordOutcomeDev(wfId, p, atts, DISPUTE_WINDOW_S);
    }

    // === 8. dispute_filed_blocks_settlement (Move 800001) ===
    function test_RevertWhen_DisputeFiledBlocksSettlement() public {
        (uint256 wfId, WeaveosTypes.AttestationPayload memory p, WeaveosTypes.DevAttestation[] memory atts) =
            _verifiedWorkflow(true);

        vm.prank(customer);
        core.fileDispute(wfId, "evidence-blob");

        WeaveosCore.Workflow memory w = core.getWorkflow(wfId);
        assertEq(uint8(w.status), uint8(WeaveosTypes.Status.Disputed));
        assertEq(w.openDisputeCount, 1);

        vm.warp(block.timestamp + DISPUTE_WINDOW_S + 1);
        vm.expectRevert(WeaveosCore.NotVerified.selector);
        core.settleWorkflowDev(wfId, p, atts);
    }

    // === Extra EVM-specific guards ===

    function test_RevertWhen_TamperedPayload() public {
        (uint256 wfId,, WeaveosTypes.DevAttestation[] memory atts) = _verifiedWorkflow(true);

        // Attacker rewrites the splits after signing → signature no longer matches.
        WeaveosTypes.Split[] memory evil = new WeaveosTypes.Split[](1);
        evil[0] = WeaveosTypes.Split(agentCo, PRICE, WeaveosTypes.ROLE_AGENT_COMPANY);
        WeaveosTypes.AttestationPayload memory tampered = _payload(wfId, true, evil);

        vm.warp(block.timestamp + DISPUTE_WINDOW_S + 1);
        vm.expectRevert(WeaveosCore.BadDevSignature.selector);
        core.settleWorkflowDev(wfId, tampered, atts);
    }

    function test_ResidualReturnsToCustomer() public {
        // Customer escrows more than the quote price; residual returns at settlement.
        vm.startPrank(customer);
        uint256 quoteId = core.createQuote(
            productId, customer, PRICE, WeaveosTypes.PRICING_FIXED,
            hex"a1", uint64((block.timestamp + 1 days) * 1000), ""
        );
        usdc.approve(address(core), PRICE + 1_000_000);
        uint256 wfId = core.createWorkflowFromQuote(quoteId, PRICE + 1_000_000);
        vm.stopPrank();

        _recordExecution(wfId);
        WeaveosTypes.AttestationPayload memory p = _payload(wfId, true, _defaultSplits());
        WeaveosTypes.DevAttestation[] memory atts = _sign(p, devSignerKey);
        core.verifyAndRecordOutcomeDev(wfId, p, atts, DISPUTE_WINDOW_S);

        uint256 balBefore = usdc.balanceOf(customer);
        vm.warp(block.timestamp + DISPUTE_WINDOW_S + 1);
        core.settleWorkflowDev(wfId, p, atts);
        assertEq(usdc.balanceOf(customer), balBefore + 1_000_000);
    }

    // === Dispute resolution (admin arbitration) ===

    function test_ResolveDispute_RefundsCustomer() public {
        uint256 balBefore = usdc.balanceOf(customer);
        (uint256 wfId,,) = _verifiedWorkflow(true);
        vm.prank(customer);
        core.fileDispute(wfId, "evidence-blob");

        vm.prank(admin);
        core.resolveDispute(wfId, true);

        WeaveosCore.Workflow memory w = core.getWorkflow(wfId);
        assertEq(uint8(w.status), uint8(WeaveosTypes.Status.Refunded));
        assertEq(w.openDisputeCount, 0);
        assertEq(w.escrowBalance, 0);
        assertEq(usdc.balanceOf(customer), balBefore); // made whole
    }

    function test_ResolveDispute_DismissAllowsSettlement() public {
        (uint256 wfId, WeaveosTypes.AttestationPayload memory p, WeaveosTypes.DevAttestation[] memory atts) =
            _verifiedWorkflow(true);
        vm.prank(customer);
        core.fileDispute(wfId, "evidence-blob");

        vm.prank(admin);
        core.resolveDispute(wfId, false); // dismissed → back to Verified

        WeaveosCore.Workflow memory w = core.getWorkflow(wfId);
        assertEq(uint8(w.status), uint8(WeaveosTypes.Status.Verified));
        assertEq(w.openDisputeCount, 0);

        vm.warp(block.timestamp + DISPUTE_WINDOW_S + 1);
        core.settleWorkflowDev(wfId, p, atts);
        assertEq(uint8(core.getWorkflow(wfId).status), uint8(WeaveosTypes.Status.Settled));
    }

    function test_RevertWhen_ResolveDisputeNotAdmin() public {
        (uint256 wfId,,) = _verifiedWorkflow(true);
        vm.prank(customer);
        core.fileDispute(wfId, "evidence-blob");

        vm.prank(customer);
        vm.expectRevert(WeaveosCore.NotAdmin.selector);
        core.resolveDispute(wfId, true);
    }

    function test_RevertWhen_ResolveWithoutDispute() public {
        (uint256 wfId,,) = _verifiedWorkflow(true);
        vm.prank(admin);
        vm.expectRevert(WeaveosCore.NotDisputed.selector);
        core.resolveDispute(wfId, false);
    }

    function test_RevertWhen_FeeExceedsMaxBps() public {
        uint256 wfId = _createQuoteAndWorkflow();
        _recordExecution(wfId);

        // fee_max_bps = 10% of 100 USDC = 10 USDC; fee_cap = 10 USDC.
        // 9.5 USDC fee passes the cap but the splits must still sum <= price.
        uint64 bigFee = 11_000_000; // > cap → FeeExceedsCap fires first
        WeaveosTypes.Split[] memory splits = _defaultSplits();
        splits[3] = WeaveosTypes.Split(platform, bigFee, WeaveosTypes.ROLE_PLATFORM);
        splits[0].amount = PRICE - MODEL_COST - TOOL_COST - bigFee;
        WeaveosTypes.AttestationPayload memory p = _payload(wfId, true, splits);
        p.platformFee = bigFee;
        WeaveosTypes.DevAttestation[] memory atts = _sign(p, devSignerKey);
        core.verifyAndRecordOutcomeDev(wfId, p, atts, DISPUTE_WINDOW_S);

        vm.warp(block.timestamp + DISPUTE_WINDOW_S + 1);
        vm.expectRevert(WeaveosCore.FeeExceedsCap.selector);
        core.settleWorkflowDev(wfId, p, atts);
    }
}
