// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {WeaveosTypes} from "../src/WeaveosTypes.sol";
import {WeaveosRegistry} from "../src/WeaveosRegistry.sol";
import {WeaveosCore} from "../src/WeaveosCore.sol";
import {MockUSDC, IERC20} from "../src/MockUSDC.sol";

/// Deploys the weaveos EVM stack to Avalanche Fuji (chain 43113) and seeds
/// the same demo configuration the Sui testnet deployment had:
/// a "hackathon-demo" Product (5% fee, 10 USDC cap, 1 attestation, full
/// refund policy), a registered dev signer, and two registered providers.
///
/// Env:
///   PRIVATE_KEY          deployer/admin key (required)
///   DEV_SIGNER_ADDRESS   ECDSA verifier signer (default: deployer)
///   AGENT_COMPANY        agent company payout address (default: deployer)
///   MODEL_PROVIDER       model provider payout address (default: deployer)
///   TOOL_PROVIDER        tool provider payout address (default: deployer)
///   USDC_ADDRESS         existing ERC20 to escrow (default: deploy MockUSDC)
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address devSigner = vm.envOr("DEV_SIGNER_ADDRESS", deployer);
        address agentCompany = vm.envOr("AGENT_COMPANY", deployer);
        address modelProvider = vm.envOr("MODEL_PROVIDER", deployer);
        address toolProvider = vm.envOr("TOOL_PROVIDER", deployer);
        address usdcAddr = vm.envOr("USDC_ADDRESS", address(0));

        vm.startBroadcast(pk);

        if (usdcAddr == address(0)) {
            MockUSDC usdc = new MockUSDC();
            usdc.mint(deployer, 10_000_000_000); // 10,000 mUSDC for demos
            usdcAddr = address(usdc);
        }

        WeaveosRegistry registry = new WeaveosRegistry();
        WeaveosCore core = new WeaveosCore(registry, IERC20(usdcAddr));

        uint256 productId = registry.createProduct(
            "hackathon-demo",
            agentCompany,
            500, // fee_bps 5%
            10_000_000, // fee_cap 10 USDC
            1000, // fee_max_bps 10%
            1, // min_attestations
            WeaveosTypes.FAILURE_FULL_REFUND
        );
        registry.allowDevSigner(productId, devSigner);
        registry.registerProvider(modelProvider, WeaveosTypes.ROLE_MODEL_PROVIDER, "anthropic");
        registry.registerProvider(toolProvider, WeaveosTypes.ROLE_TOOL, "serpapi");

        vm.stopBroadcast();

        console.log("deployer/admin:   ", deployer);
        console.log("MockUSDC/token:   ", usdcAddr);
        console.log("WeaveosRegistry:  ", address(registry));
        console.log("WeaveosCore:      ", address(core));
        console.log("productId:        ", productId);
        console.log("devSigner:        ", devSigner);
    }
}
