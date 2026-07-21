// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {WeaveosTypes} from "./WeaveosTypes.sol";
import {WeaveosRegistry} from "./WeaveosRegistry.sol";
import {IERC20} from "./MockUSDC.sol";

/// The workflow lifecycle: Quote → Workflow (escrow lock) → Execution →
/// Outcome (attestation-gated) → Dispute window → Atomic settlement.
///
/// Port of the Sui Move modules quote.move, escrow.move, workflow.move,
/// execution.move, outcome.move, attestation.move, settlement.move into a
/// single contract. Sui shared objects become structs in mappings; the
/// phantom-typed Coin<T> escrow becomes an ERC20 balance held by this
/// contract; atomicity of the settlement PTB is native to an EVM tx.
contract WeaveosCore {
    using WeaveosTypes for uint8;

    // === Errors (Move error-code namespaces noted inline) ===
    // quote (2xxxxx)
    error InvalidPricingModel(); // 200001
    error ExpiresInPast(); // 200002
    error UnsupportedPricingModelMvp(); // 200003
    error PriceZero(); // 200004
    error CriteriaEmpty(); // 200005
    // workflow (4xxxxx)
    error QuoteProductMismatch(); // 400001
    error QuoteExpired(); // 400002
    error NotCustomer(); // 400003 / 500001 / 600002
    error InsufficientPayment(); // 400004
    // execution (5xxxxx)
    error ExecutionAlreadyRecorded(); // 500002
    error InvalidCategory(); // 500003
    error NotExecuting(); // 500004
    // outcome (6xxxxx)
    error OutcomeAlreadyRecorded(); // 600001
    error NotVerified(); // 600003 / 800001
    error DisputeWindowClosed(); // 600004
    // attestation (7xxxxx)
    error WorkflowMismatch(); // 700001
    error TimestampFuture(); // 700002
    error InsufficientAttestations(); // 700003
    error BadPcr(); // 700004
    error DuplicateEnclave(); // 700005
    error QuoteMismatch(); // 700006 / 800008
    error ExecutionRequired(); // 700007
    error BadDevSigner(); // 700009
    error BadDevSignature(); // 700010
    error DuplicateDevSigner(); // 700011
    // settlement (8xxxxx)
    error DisputeWindowOpen(); // 800002
    error DisputeOpen(); // 800003
    error PayloadWorkflowMismatch(); // 800004
    error PayloadOutcomeMismatch(); // 800005
    error SelfPay(); // 800009
    error ZeroSplit(); // 800010
    error BadAgentRecipient(); // 800011
    error UnregisteredProvider(); // 800012
    error InvalidRole(); // 800013
    error ExceedsEscrow(); // 800014
    error ExceedsPrice(); // 800015
    error FeeExceedsCap(); // 800016
    error FeeExceedsMaxBps(); // 800017
    error CostMismatch(); // 800018
    error UnknownWorkflow();
    error UnknownQuote();
    error TransferFailed();
    error NotDisputed();
    error NotAdmin();

    /// Allowed clock skew for payload timestamps: the off-chain verifier
    /// signs with Date.now(); block.timestamp may lag wall clock slightly.
    uint256 public constant TIMESTAMP_SKEW_MS = 120_000;

    // === Storage ===

    struct Quote {
        uint256 productId;
        address customer;
        uint64 price; // USDC base units
        uint8 pricingModel;
        bytes successCriteria; // CBOR-encoded SuccessCriterion DSL
        bytes32 successCriteriaHash; // sha256(successCriteria)
        uint64 expiresAtMs;
        bytes issuerAttestation; // empty in MVP
        uint64 createdAtMs;
        bool exists;
    }

    struct Workflow {
        address customer;
        uint256 productId;
        WeaveosTypes.Status status;
        uint256 quoteId;
        bool hasExecution;
        bool hasOutcome;
        bool hasSettlement;
        uint8 openDisputeCount;
        uint256 escrowBalance; // ERC20 units held by this contract
        uint64 totalRevenue;
        uint64 totalCost;
        uint64 margin;
        uint64 createdAtMs;
        uint64 updatedAtMs;
        bool exists;
    }

    struct Execution {
        uint64 startedAtMs;
        uint64 completedAtMs;
        bytes traceBlobId; // Walrus/IPFS blob id for the full trace
        WeaveosTypes.CostItem[] costItems;
        uint64 totalCost;
    }

    struct Outcome {
        bool success;
        bytes artifactBlobId;
        bytes proofBlobId;
        bytes teeAttestation; // primary attestation signature (audit trail)
        bytes enclaveMeasurement; // primary signer (dev path: abi-encoded address)
        uint64 verifiedAtMs;
        uint64 disputeWindowEndsMs;
    }

    struct Settlement {
        WeaveosTypes.Split[] splits;
        uint64 totalSettled;
        uint64 platformFee;
        uint64 settledAtMs;
    }

    WeaveosRegistry public immutable registry;
    IERC20 public immutable token;

    uint256 public nextQuoteId = 1;
    uint256 public nextWorkflowId = 1;
    mapping(uint256 => Quote) private _quotes;
    mapping(uint256 => Workflow) private _workflows;
    // Execution / Outcome / Settlement are 1:1 with a workflow → keyed by workflowId.
    mapping(uint256 => Execution) private _executions;
    mapping(uint256 => Outcome) private _outcomes;
    mapping(uint256 => Settlement) private _settlements;

    // === Events (port of Move events) ===
    event QuoteCreated(
        uint256 indexed quoteId,
        uint256 indexed productId,
        address indexed customer,
        uint64 price,
        uint8 pricingModel,
        uint64 expiresAtMs
    );
    event WorkflowCreated(
        uint256 indexed workflowId,
        address indexed customer,
        uint256 indexed productId,
        uint256 quoteId,
        uint256 escrowed
    );
    event WorkflowStatusChanged(uint256 indexed workflowId, uint8 fromStatus, uint8 toStatus);
    event ExecutionRecorded(uint256 indexed workflowId, uint64 totalCost, uint256 itemCount);
    event OutcomeVerified(uint256 indexed workflowId, bool success, uint64 disputeWindowEndsMs);
    event DisputeFiled(uint256 indexed workflowId, bytes evidenceBlobId, address filedBy);
    event DisputeResolved(uint256 indexed workflowId, bool refunded, address resolvedBy);
    event WorkflowSettled(uint256 indexed workflowId, uint64 totalSettled, uint64 platformFee);
    event WorkflowRefunded(uint256 indexed workflowId, uint256 refundAmount);
    event CostReportingDrift(uint256 indexed workflowId, uint64 reportedTotal, uint64 reconciledTotal);

    constructor(WeaveosRegistry registry_, IERC20 token_) {
        registry = registry_;
        token = token_;
    }

    // ============================================================
    // Stage 1 — Quote (port of quote.move)
    // ============================================================

    function createQuote(
        uint256 productId,
        address customer,
        uint64 price,
        uint8 pricingModel,
        bytes calldata successCriteria,
        uint64 expiresAtMs,
        bytes calldata issuerAttestation
    ) external returns (uint256 quoteId) {
        registry.assertActive(productId);
        if (!WeaveosTypes.isValidPricingModel(pricingModel)) revert InvalidPricingModel();
        if (pricingModel != WeaveosTypes.PRICING_FIXED) revert UnsupportedPricingModelMvp();
        if (price == 0) revert PriceZero();
        if (successCriteria.length == 0) revert CriteriaEmpty();

        uint64 nowMs = _nowMs();
        if (expiresAtMs <= nowMs) revert ExpiresInPast();

        quoteId = nextQuoteId++;
        Quote storage q = _quotes[quoteId];
        q.productId = productId;
        q.customer = customer;
        q.price = price;
        q.pricingModel = pricingModel;
        q.successCriteria = successCriteria;
        q.successCriteriaHash = sha256(successCriteria);
        q.expiresAtMs = expiresAtMs;
        q.issuerAttestation = issuerAttestation;
        q.createdAtMs = nowMs;
        q.exists = true;

        emit QuoteCreated(quoteId, productId, customer, price, pricingModel, expiresAtMs);
    }

    // ============================================================
    // Stage 2 — payment authorization (port of workflow.move + escrow.move)
    // Caller must have approved `amount` of `token` to this contract.
    // ============================================================

    function createWorkflowFromQuote(uint256 quoteId, uint256 amount)
        external
        returns (uint256 workflowId)
    {
        Quote storage q = _quotes[quoteId];
        if (!q.exists) revert UnknownQuote();
        registry.assertActive(q.productId);
        uint64 nowMs = _nowMs();
        if (q.expiresAtMs <= nowMs) revert QuoteExpired();
        if (q.customer != msg.sender) revert NotCustomer();
        if (amount < q.price) revert InsufficientPayment();

        // Lock the full payment into escrow (residual returns at settlement).
        if (!token.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();

        workflowId = nextWorkflowId++;
        Workflow storage w = _workflows[workflowId];
        w.customer = msg.sender;
        w.productId = q.productId;
        w.status = WeaveosTypes.Status.Executing;
        w.quoteId = quoteId;
        w.escrowBalance = amount;
        w.createdAtMs = nowMs;
        w.updatedAtMs = nowMs;
        w.exists = true;

        emit WorkflowCreated(workflowId, msg.sender, q.productId, quoteId, amount);
    }

    // ============================================================
    // Stage 3 — Execution record (port of execution.move)
    // ============================================================

    function recordExecution(
        uint256 workflowId,
        uint64 startedAtMs,
        WeaveosTypes.CostItem[] calldata costItems,
        bytes calldata traceBlobId
    ) external {
        Workflow storage w = _requireWorkflow(workflowId);
        if (w.customer != msg.sender) revert NotCustomer();
        if (w.status != WeaveosTypes.Status.Executing) revert NotExecuting();
        if (w.hasExecution) revert ExecutionAlreadyRecorded();

        uint64 totalCost = 0;
        for (uint256 i = 0; i < costItems.length; i++) {
            if (!WeaveosTypes.isValidCategory(costItems[i].category)) revert InvalidCategory();
            totalCost += costItems[i].amount;
        }

        Execution storage e = _executions[workflowId];
        e.startedAtMs = startedAtMs;
        e.completedAtMs = _nowMs();
        e.traceBlobId = traceBlobId;
        for (uint256 i = 0; i < costItems.length; i++) {
            e.costItems.push(costItems[i]);
        }
        e.totalCost = totalCost;

        w.hasExecution = true;
        w.updatedAtMs = _nowMs();

        emit ExecutionRecorded(workflowId, totalCost, costItems.length);
    }

    // ============================================================
    // Attestation verification (port of attestation.move)
    // ============================================================

    /// Canonical digest the verifier signs. The off-chain verifier computes
    /// the same via ethers: keccak256(AbiCoder.encode([payloadTuple], [payload])).
    function payloadDigest(WeaveosTypes.AttestationPayload calldata payload)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(payload));
    }

    /// HACKATHON MODE: verify M-of-N ECDSA attestations against
    /// Product.allowedDevSigners. Port of attestation::verify_dev_attestations
    /// with ed25519 swapped for EVM-native secp256k1 ecrecover.
    function verifyDevAttestations(
        uint256 workflowId,
        WeaveosTypes.AttestationPayload calldata payload,
        WeaveosTypes.DevAttestation[] calldata atts
    ) public view {
        Workflow storage w = _requireWorkflow(workflowId);

        // 1. Workflow binding
        if (payload.workflowId != workflowId) revert WorkflowMismatch();

        // 2. Timestamp not from the future (small skew allowed; see const)
        if (payload.timestampMs > _nowMs() + TIMESTAMP_SKEW_MS) revert TimestampFuture();

        // 3. Min-N
        if (atts.length < registry.minAttestations(w.productId)) {
            revert InsufficientAttestations();
        }

        // 4. Canonical payload digest — EIP-191 prefixed so the TS verifier
        //    can use wallet.signMessage(digestBytes).
        bytes32 digest = keccak256(abi.encode(payload));
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));

        // 5. Distinct signers + allowlist + live signature verification
        for (uint256 i = 0; i < atts.length; i++) {
            address signer = atts[i].signer;
            if (!registry.isDevSignerAllowed(w.productId, signer)) revert BadDevSigner();
            for (uint256 j = 0; j < i; j++) {
                if (atts[j].signer == signer) revert DuplicateDevSigner();
            }
            if (_recover(ethDigest, atts[i].signature) != signer) revert BadDevSignature();
        }
    }

    /// Production path (AWS Nitro). P1-stub parity with the Move package:
    /// PCR allowlist + distinct instance IDs + M-of-N are enforced; the
    /// cert-chain signature verification lands in P2.
    function verifyAttestations(
        uint256 workflowId,
        WeaveosTypes.AttestationPayload calldata payload,
        WeaveosTypes.EnclaveAttestation[] calldata atts
    ) public view {
        Workflow storage w = _requireWorkflow(workflowId);

        if (payload.workflowId != workflowId) revert WorkflowMismatch();
        if (payload.timestampMs > _nowMs() + TIMESTAMP_SKEW_MS) revert TimestampFuture();
        if (atts.length < registry.minAttestations(w.productId)) {
            revert InsufficientAttestations();
        }

        for (uint256 i = 0; i < atts.length; i++) {
            if (!registry.isPcrAllowed(w.productId, atts[i].pcr)) revert BadPcr();
            bytes32 instanceKey = keccak256(atts[i].enclaveInstanceId);
            for (uint256 j = 0; j < i; j++) {
                if (keccak256(atts[j].enclaveInstanceId) == instanceKey) revert DuplicateEnclave();
            }
        }
        // (P2) verify each signature against the leaf key from each enclave's
        // Nitro attestation document + cert chain to the AWS root.
    }

    // ============================================================
    // Stage 5 — verify + record outcome (port of
    // attestation::verify_and_record_outcome_dev / outcome.move)
    // ============================================================

    function verifyAndRecordOutcomeDev(
        uint256 workflowId,
        WeaveosTypes.AttestationPayload calldata payload,
        WeaveosTypes.DevAttestation[] calldata atts,
        uint64 disputeWindowSeconds
    ) external {
        Workflow storage w = _requireWorkflow(workflowId);
        if (w.quoteId == 0) revert QuoteMismatch();
        if (!w.hasExecution) revert ExecutionRequired();
        if (w.hasOutcome) revert OutcomeAlreadyRecorded();

        verifyDevAttestations(workflowId, payload, atts);

        uint64 nowMs = _nowMs();
        Outcome storage o = _outcomes[workflowId];
        o.success = payload.outcomeSuccess;
        o.artifactBlobId = payload.outcomeBlobId;
        o.proofBlobId = payload.proofBlobId;
        o.teeAttestation = atts[0].signature;
        o.enclaveMeasurement = abi.encodePacked(atts[0].signer);
        o.verifiedAtMs = nowMs;
        o.disputeWindowEndsMs = nowMs + disputeWindowSeconds * 1000;

        w.hasOutcome = true;
        _setStatus(workflowId, w, WeaveosTypes.Status.Verified);

        emit OutcomeVerified(workflowId, payload.outcomeSuccess, o.disputeWindowEndsMs);
    }

    // ============================================================
    // Stage 6 — dispute filing (port of outcome::file_dispute)
    // ============================================================

    function fileDispute(uint256 workflowId, bytes calldata evidenceBlobId) external {
        Workflow storage w = _requireWorkflow(workflowId);
        if (w.customer != msg.sender) revert NotCustomer();
        if (w.status != WeaveosTypes.Status.Verified) revert NotVerified();
        Outcome storage o = _outcomes[workflowId];
        if (_nowMs() >= o.disputeWindowEndsMs) revert DisputeWindowClosed();

        w.openDisputeCount += 1;
        _setStatus(workflowId, w, WeaveosTypes.Status.Disputed);
        emit DisputeFiled(workflowId, evidenceBlobId, msg.sender);
    }

    /// MVP arbitration: the registry admin either refunds the customer in
    /// full (dispute upheld) or dismisses the dispute, returning the workflow
    /// to Verified so permissionless settlement can proceed. Without this, a
    /// filed dispute would freeze the escrow forever — settlement requires
    /// openDisputeCount == 0. Phase 2 replaces the admin with an attested
    /// arbitrator enclave.
    function resolveDispute(uint256 workflowId, bool refundCustomer) external {
        if (msg.sender != registry.admin()) revert NotAdmin();
        Workflow storage w = _requireWorkflow(workflowId);
        if (w.status != WeaveosTypes.Status.Disputed || w.openDisputeCount == 0) {
            revert NotDisputed();
        }
        w.openDisputeCount -= 1;

        if (refundCustomer) {
            // Refund resolves the workflow outright — clear any other disputes.
            w.openDisputeCount = 0;
            uint256 total = w.escrowBalance;
            w.escrowBalance = 0;
            _setStatus(workflowId, w, WeaveosTypes.Status.Refunded);
            if (!token.transfer(w.customer, total)) revert TransferFailed();
            emit WorkflowRefunded(workflowId, total);
        } else if (w.openDisputeCount == 0) {
            _setStatus(workflowId, w, WeaveosTypes.Status.Verified);
        }
        emit DisputeResolved(workflowId, refundCustomer, msg.sender);
    }

    // ============================================================
    // Stage 7 — atomic multi-party settlement (port of settlement.move)
    // Permissionless: callable by anyone once the dispute window closes.
    // ============================================================

    /// HACKATHON path — ECDSA dev-signer verification, then settle.
    function settleWorkflowDev(
        uint256 workflowId,
        WeaveosTypes.AttestationPayload calldata payload,
        WeaveosTypes.DevAttestation[] calldata atts
    ) external {
        _prepareSettlement(workflowId, payload);
        verifyDevAttestations(workflowId, payload, atts);
        _doSettle(workflowId, payload);
    }

    /// Production path — Nitro attestation verification, then settle.
    /// Identical invariants; only the signature check differs.
    function settleWorkflow(
        uint256 workflowId,
        WeaveosTypes.AttestationPayload calldata payload,
        WeaveosTypes.EnclaveAttestation[] calldata atts
    ) external {
        _prepareSettlement(workflowId, payload);
        verifyAttestations(workflowId, payload, atts);
        _doSettle(workflowId, payload);
    }

    // === Internal: shared preconditions (port of prepare_settlement) ===

    function _prepareSettlement(
        uint256 workflowId,
        WeaveosTypes.AttestationPayload calldata payload
    ) internal view {
        Workflow storage w = _requireWorkflow(workflowId);
        Outcome storage o = _outcomes[workflowId];

        if (w.status != WeaveosTypes.Status.Verified) revert NotVerified();
        if (_nowMs() < o.disputeWindowEndsMs) revert DisputeWindowOpen();
        if (w.openDisputeCount != 0) revert DisputeOpen();

        // Payload binding — what the verifier signed must match chain state.
        if (payload.workflowId != workflowId) revert PayloadWorkflowMismatch();
        if (payload.outcomeSuccess != o.success) revert PayloadOutcomeMismatch();
    }

    // === Internal: post-verification settlement (port of do_settle) ===

    function _doSettle(uint256 workflowId, WeaveosTypes.AttestationPayload calldata payload)
        internal
    {
        Workflow storage w = _workflows[workflowId];
        Quote storage q = _quotes[w.quoteId];
        address customer = w.customer;
        address agentCo = registry.agentCompany(w.productId);

        // === 2. Failure branch — full refund (MVP failure_policy) ===
        if (!payload.outcomeSuccess) {
            uint256 total = w.escrowBalance;
            w.escrowBalance = 0;
            _setStatus(workflowId, w, WeaveosTypes.Status.Refunded);
            if (!token.transfer(customer, total)) revert TransferFailed();
            emit WorkflowRefunded(workflowId, total);
            return;
        }

        // === 3. Success-path invariants ===
        WeaveosTypes.Split[] calldata splits = payload.splits;
        uint64 platformFee = payload.platformFee;

        uint64 reconciledTotal = 0;
        for (uint256 i = 0; i < payload.reconciledCostItems.length; i++) {
            reconciledTotal += payload.reconciledCostItems[i].amount;
        }

        uint64 totalOut = 0;
        uint64 providerTotal = 0;
        for (uint256 i = 0; i < splits.length; i++) {
            WeaveosTypes.Split calldata s = splits[i];
            // 3a. amount > 0 ; no self-pay
            if (s.amount == 0) revert ZeroSplit();
            if (s.recipient == customer) revert SelfPay();
            // 3b. recipients must be known
            if (!WeaveosTypes.isValidRole(s.role)) revert InvalidRole();
            if (s.role == WeaveosTypes.ROLE_AGENT_COMPANY) {
                if (s.recipient != agentCo) revert BadAgentRecipient();
            } else if (s.role == WeaveosTypes.ROLE_PLATFORM) {
                // Platform fee recipient is not pre-registered; fee bounds below.
            } else {
                if (!registry.isRegisteredProvider(s.recipient, s.role)) {
                    revert UnregisteredProvider();
                }
                providerTotal += s.amount;
            }
            totalOut += s.amount;
        }

        // 3c. Sum bounds
        if (totalOut > w.escrowBalance) revert ExceedsEscrow();
        if (totalOut > q.price) revert ExceedsPrice();

        // 3d. Platform fee bounds
        if (platformFee > registry.feeCap(w.productId)) revert FeeExceedsCap();
        uint256 maxFeeByBps = (uint256(q.price) * registry.feeMaxBps(w.productId)) / 10_000;
        if (platformFee > maxFeeByBps) revert FeeExceedsMaxBps();

        // 3e. Provider splits == reconciled costs
        if (providerTotal != reconciledTotal) revert CostMismatch();

        // 3f. Cost reporting drift (informational)
        uint64 reported = _executions[workflowId].totalCost;
        if (reconciledTotal != reported) {
            emit CostReportingDrift(workflowId, reported, reconciledTotal);
        }

        // === 4. Atomic disbursement (native to the EVM tx) ===
        for (uint256 i = 0; i < splits.length; i++) {
            w.escrowBalance -= splits[i].amount;
            if (!token.transfer(splits[i].recipient, splits[i].amount)) revert TransferFailed();
        }

        // Residual back to customer (price headroom not consumed by costs).
        uint256 residual = w.escrowBalance;
        if (residual > 0) {
            w.escrowBalance = 0;
            if (!token.transfer(customer, residual)) revert TransferFailed();
        }

        // === 5. State commit ===
        uint64 margin = totalOut - providerTotal - platformFee;
        Settlement storage st = _settlements[workflowId];
        for (uint256 i = 0; i < splits.length; i++) {
            st.splits.push(splits[i]);
        }
        st.totalSettled = totalOut;
        st.platformFee = platformFee;
        st.settledAtMs = _nowMs();

        w.hasSettlement = true;
        w.totalRevenue = totalOut;
        w.totalCost = providerTotal;
        w.margin = margin;
        _setStatus(workflowId, w, WeaveosTypes.Status.Settled);

        emit WorkflowSettled(workflowId, totalOut, platformFee);
    }

    // ============================================================
    // Getters
    // ============================================================

    function getQuote(uint256 quoteId) external view returns (Quote memory) {
        if (!_quotes[quoteId].exists) revert UnknownQuote();
        return _quotes[quoteId];
    }

    function getWorkflow(uint256 workflowId) external view returns (Workflow memory) {
        _requireWorkflow(workflowId);
        return _workflows[workflowId];
    }

    function getExecution(uint256 workflowId) external view returns (Execution memory) {
        return _executions[workflowId];
    }

    function getOutcome(uint256 workflowId) external view returns (Outcome memory) {
        return _outcomes[workflowId];
    }

    function getSettlement(uint256 workflowId) external view returns (Settlement memory) {
        return _settlements[workflowId];
    }

    function disputeWindowClosed(uint256 workflowId) external view returns (bool) {
        return _nowMs() >= _outcomes[workflowId].disputeWindowEndsMs;
    }

    // ============================================================
    // Internal helpers
    // ============================================================

    function _requireWorkflow(uint256 workflowId) internal view returns (Workflow storage w) {
        w = _workflows[workflowId];
        if (!w.exists) revert UnknownWorkflow();
    }

    function _setStatus(uint256 workflowId, Workflow storage w, WeaveosTypes.Status to) internal {
        uint8 from = uint8(w.status);
        w.status = to;
        w.updatedAtMs = _nowMs();
        emit WorkflowStatusChanged(workflowId, from, uint8(to));
    }

    function _nowMs() internal view returns (uint64) {
        return uint64(block.timestamp * 1000);
    }

    function _recover(bytes32 ethDigest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (v < 27) v += 27;
        return ecrecover(ethDigest, v, r, s);
    }
}
