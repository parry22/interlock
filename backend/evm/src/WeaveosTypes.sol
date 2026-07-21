// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Shared enums + structs used across the weaveos EVM contracts.
/// Direct port of backend/move/sources/types.move (+ the shared structs from
/// execution.move / attestation.move, which EVM contracts can share natively).
library WeaveosTypes {
    // === Workflow.status ===
    enum Status {
        Quoted, // 0
        Executing, // 1
        Verified, // 2
        Settled, // 3
        Disputed, // 4
        Refunded // 5
    }

    // === Split.role ===
    uint8 internal constant ROLE_AGENT_COMPANY = 0;
    uint8 internal constant ROLE_MODEL_PROVIDER = 1;
    uint8 internal constant ROLE_TOOL = 2;
    uint8 internal constant ROLE_HUMAN = 3;
    uint8 internal constant ROLE_PLATFORM = 4;

    // === CostItem.category ===
    uint8 internal constant CATEGORY_MODEL = 0;
    uint8 internal constant CATEGORY_TOOL = 1;
    uint8 internal constant CATEGORY_HUMAN = 2;
    uint8 internal constant CATEGORY_COMPUTE = 3;

    // === Quote.pricing_model ===
    uint8 internal constant PRICING_FIXED = 0;
    uint8 internal constant PRICING_CAPPED = 1;
    uint8 internal constant PRICING_SUCCESS_FEE = 2;
    uint8 internal constant PRICING_HYBRID = 3;

    // === Product.failure_policy ===
    uint8 internal constant FAILURE_FULL_REFUND = 0;
    uint8 internal constant FAILURE_COST_RECOVERY = 1;
    uint8 internal constant FAILURE_PARTIAL = 2;

    function isValidRole(uint8 r) internal pure returns (bool) {
        return r <= ROLE_PLATFORM;
    }

    function isValidCategory(uint8 c) internal pure returns (bool) {
        return c <= CATEGORY_COMPUTE;
    }

    function isValidPricingModel(uint8 p) internal pure returns (bool) {
        return p <= PRICING_HYBRID;
    }

    function isValidFailurePolicy(uint8 f) internal pure returns (bool) {
        return f <= FAILURE_PARTIAL;
    }

    /// One line item of agent execution cost (port of execution::CostItem).
    struct CostItem {
        address provider;
        uint8 category;
        uint64 units;
        uint64 amount; // USDC base units (6 decimals)
    }

    /// Proposed settlement split (port of attestation::Split).
    struct Split {
        address recipient;
        uint64 amount;
        uint8 role;
    }

    /// HACKATHON MODE attestation. ed25519 (Sui) is replaced by ECDSA
    /// secp256k1 (EVM-native, verified via ecrecover). The registered
    /// "dev signer" is therefore an Ethereum address, not a 32-byte pubkey.
    struct DevAttestation {
        address signer;
        bytes signature; // 65-byte ECDSA sig over EIP-191(keccak256(abi.encode(payload)))
    }

    /// Production-path attestation (AWS Nitro). Signature accepted opaquely
    /// in P1, same as the Move package — cert-chain verification lands in P2.
    struct EnclaveAttestation {
        bytes pcr;
        bytes enclaveInstanceId;
        bytes signature;
    }

    /// The full payload the verifier signs (port of attestation::AttestationPayload).
    /// Canonical bytes = abi.encode(payload); digest = keccak256 of that;
    /// signature = ECDSA over the EIP-191 prefixed digest, so the TS verifier
    /// can simply do wallet.signMessage(getBytes(digest)).
    struct AttestationPayload {
        uint256 workflowId;
        bool outcomeSuccess;
        bytes outcomeBlobId;
        bytes traceBlobId;
        bytes proofBlobId;
        CostItem[] reconciledCostItems;
        Split[] splits;
        uint64 platformFee;
        bytes32 nonce;
        uint64 timestampMs;
    }
}
