#!/usr/bin/env node
// Generate a fresh secp256k1 (Ethereum) keypair for the lifecycle demo's
// "customer" role on Avalanche Fuji. Distinct from the deployer/admin key
// (which is also the agent_company + provider) to avoid the E_SELF_PAY check.
//
// Usage:  node backend/scripts/gen-customer-keypair.mjs

import { ethers } from "ethers";

const wallet = ethers.Wallet.createRandom();
console.log("=== Interlock customer keypair (Avalanche Fuji) ===\n");
console.log("Address:", wallet.address, "\n");
console.log("Add to .env.local:");
console.log(`INTERLOCK_CUSTOMER_PRIVKEY=${wallet.privateKey}\n`);
console.log("Fund it from the deployer/admin (foundry cast):");
console.log(
  `  cast send <MockUSDC> "mint(address,uint256)" ${wallet.address} 1000000000 --private-key <ADMIN_PK> --rpc-url https://api.avax-test.network/ext/bc/C/rpc`,
);
console.log(
  `  cast send ${wallet.address} --value 0.01ether --private-key <ADMIN_PK> --rpc-url https://api.avax-test.network/ext/bc/C/rpc`,
);
