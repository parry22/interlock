// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {WeaveosTypes} from "./WeaveosTypes.sol";

/// Product configuration, provider directory, enclave PCR allowlist, and
/// dev-signer allowlist. Port of backend/move/sources/registry.move.
///
/// Sui's AdminCap capability object becomes a plain admin address (the
/// deployer), transferable via transferAdmin.
contract WeaveosRegistry {
    // === Errors (Move error-code parity noted inline) ===
    error NotAdmin(); // enforced structurally by &AdminCap in Move
    error InvalidFeeBps(); // 100002
    error InvalidFailurePolicy(); // 100003
    error InvalidMinAttestations(); // 100004
    error ProviderAlreadyRegistered(); // 100005
    error ProviderNotRegistered(); // 100006
    error PcrAlreadyAllowed(); // 100007
    error PcrNotAllowed(); // 100008
    error ProductInactive(); // 100009
    error DevSignerAlreadyAllowed(); // 100010
    error DevSignerNotAllowed(); // 100011
    error UnknownProduct();

    uint16 public constant MAX_BPS = 10_000;

    struct Product {
        string slug;
        address agentCompany;
        uint16 feeBps;
        uint64 feeCap; // absolute cap in USDC base units
        uint16 feeMaxBps;
        uint8 minAttestations;
        uint8 failurePolicy;
        bool active;
        uint64 createdAtMs;
        bool exists;
    }

    address public admin;
    uint256 public nextProductId = 1;
    mapping(uint256 => Product) private _products;
    /// productId => keccak256(pcr) => allowed
    mapping(uint256 => mapping(bytes32 => bool)) private _allowedPcrs;
    /// productId => signer address => allowed (hackathon-mode ECDSA signers)
    mapping(uint256 => mapping(address => bool)) private _allowedDevSigners;
    /// keccak256(addr, role) => registered
    mapping(bytes32 => bool) private _providerRegistered;
    mapping(bytes32 => string) private _providerNames;

    // === Events (port of Move events) ===
    event ProductCreated(uint256 indexed productId, string slug, address agentCompany);
    event ProductDeactivated(uint256 indexed productId);
    event ProviderRegistered(address indexed addr, uint8 role, string name);
    event ProviderRemoved(address indexed addr, uint8 role);
    event PcrAllowed(uint256 indexed productId, bytes pcr);
    event PcrRevoked(uint256 indexed productId, bytes pcr);
    event DevSignerAllowed(uint256 indexed productId, address signer);
    event DevSignerRevoked(uint256 indexed productId, address signer);
    event AdminTransferred(address indexed from, address indexed to);

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    // === Admin: products ===

    function createProduct(
        string calldata slug_,
        address agentCompany_,
        uint16 feeBps_,
        uint64 feeCap_,
        uint16 feeMaxBps_,
        uint8 minAttestations_,
        uint8 failurePolicy_
    ) external onlyAdmin returns (uint256 productId) {
        if (feeBps_ > MAX_BPS || feeMaxBps_ > MAX_BPS || feeBps_ > feeMaxBps_) revert InvalidFeeBps();
        if (minAttestations_ < 1) revert InvalidMinAttestations();
        if (!WeaveosTypes.isValidFailurePolicy(failurePolicy_)) revert InvalidFailurePolicy();

        productId = nextProductId++;
        _products[productId] = Product({
            slug: slug_,
            agentCompany: agentCompany_,
            feeBps: feeBps_,
            feeCap: feeCap_,
            feeMaxBps: feeMaxBps_,
            minAttestations: minAttestations_,
            failurePolicy: failurePolicy_,
            active: true,
            createdAtMs: uint64(block.timestamp * 1000),
            exists: true
        });
        emit ProductCreated(productId, slug_, agentCompany_);
    }

    function deactivateProduct(uint256 productId) external onlyAdmin {
        _requireProduct(productId);
        _products[productId].active = false;
        emit ProductDeactivated(productId);
    }

    // === Admin: PCR allowlist (production Nitro path) ===

    function allowPcr(uint256 productId, bytes calldata pcr) external onlyAdmin {
        _requireProduct(productId);
        bytes32 key = keccak256(pcr);
        if (_allowedPcrs[productId][key]) revert PcrAlreadyAllowed();
        _allowedPcrs[productId][key] = true;
        emit PcrAllowed(productId, pcr);
    }

    function revokePcr(uint256 productId, bytes calldata pcr) external onlyAdmin {
        _requireProduct(productId);
        bytes32 key = keccak256(pcr);
        if (!_allowedPcrs[productId][key]) revert PcrNotAllowed();
        _allowedPcrs[productId][key] = false;
        emit PcrRevoked(productId, pcr);
    }

    // === Admin: dev signers (hackathon-mode ECDSA path) ===

    function allowDevSigner(uint256 productId, address signer) external onlyAdmin {
        _requireProduct(productId);
        if (_allowedDevSigners[productId][signer]) revert DevSignerAlreadyAllowed();
        _allowedDevSigners[productId][signer] = true;
        emit DevSignerAllowed(productId, signer);
    }

    function revokeDevSigner(uint256 productId, address signer) external onlyAdmin {
        _requireProduct(productId);
        if (!_allowedDevSigners[productId][signer]) revert DevSignerNotAllowed();
        _allowedDevSigners[productId][signer] = false;
        emit DevSignerRevoked(productId, signer);
    }

    // === Admin: provider directory ===

    function registerProvider(address addr, uint8 role, string calldata name_) external onlyAdmin {
        bytes32 key = _providerKey(addr, role);
        if (_providerRegistered[key]) revert ProviderAlreadyRegistered();
        _providerRegistered[key] = true;
        _providerNames[key] = name_;
        emit ProviderRegistered(addr, role, name_);
    }

    function removeProvider(address addr, uint8 role) external onlyAdmin {
        bytes32 key = _providerKey(addr, role);
        if (!_providerRegistered[key]) revert ProviderNotRegistered();
        delete _providerRegistered[key];
        delete _providerNames[key];
        emit ProviderRemoved(addr, role);
    }

    // === Read-only accessors (used by WeaveosCore for invariant checks) ===

    function getProduct(uint256 productId) external view returns (Product memory) {
        _requireProduct(productId);
        return _products[productId];
    }

    function productExists(uint256 productId) external view returns (bool) {
        return _products[productId].exists;
    }

    function isActive(uint256 productId) external view returns (bool) {
        return _products[productId].active;
    }

    function assertActive(uint256 productId) external view {
        _requireProduct(productId);
        if (!_products[productId].active) revert ProductInactive();
    }

    function agentCompany(uint256 productId) external view returns (address) {
        return _products[productId].agentCompany;
    }

    function feeBps(uint256 productId) external view returns (uint16) {
        return _products[productId].feeBps;
    }

    function feeCap(uint256 productId) external view returns (uint64) {
        return _products[productId].feeCap;
    }

    function feeMaxBps(uint256 productId) external view returns (uint16) {
        return _products[productId].feeMaxBps;
    }

    function minAttestations(uint256 productId) external view returns (uint8) {
        return _products[productId].minAttestations;
    }

    function failurePolicy(uint256 productId) external view returns (uint8) {
        return _products[productId].failurePolicy;
    }

    function isPcrAllowed(uint256 productId, bytes calldata pcr) external view returns (bool) {
        return _allowedPcrs[productId][keccak256(pcr)];
    }

    function isDevSignerAllowed(uint256 productId, address signer) external view returns (bool) {
        return _allowedDevSigners[productId][signer];
    }

    function isRegisteredProvider(address addr, uint8 role) external view returns (bool) {
        return _providerRegistered[_providerKey(addr, role)];
    }

    function providerName(address addr, uint8 role) external view returns (string memory) {
        return _providerNames[_providerKey(addr, role)];
    }

    // === Internal ===

    function _providerKey(address addr, uint8 role) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(addr, role));
    }

    function _requireProduct(uint256 productId) internal view {
        if (!_products[productId].exists) revert UnknownProduct();
    }
}
