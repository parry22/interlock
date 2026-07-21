# interlock — Avalanche EVM contracts

Solidity port of the Sui Move package in `backend/move/`, targeting **Avalanche Fuji testnet** (C-Chain, chainId 43113). Built with Foundry.

## Contract map (Move → Solidity)

| Move module | Solidity | Notes |
|---|---|---|
| `types.move` | `src/WeaveosTypes.sol` | Enums + shared structs (`CostItem`, `Split`, `AttestationPayload`, attestations) |
| `registry.move` | `src/WeaveosRegistry.sol` | Products, provider directory, PCR allowlist, dev-signer allowlist. `AdminCap` → `admin` address |
| `quote.move` | `src/WeaveosCore.sol` (`createQuote`) | `success_criteria_hash = sha256(criteria)` kept identical |
| `escrow.move` + `workflow.move` | `src/WeaveosCore.sol` (`createWorkflowFromQuote`) | `Coin<T>` escrow → ERC20 `transferFrom` held by the core contract |
| `execution.move` | `src/WeaveosCore.sol` (`recordExecution`) | 1:1 with workflow, keyed by workflowId |
| `outcome.move` | `src/WeaveosCore.sol` (`verifyAndRecordOutcomeDev`, `fileDispute`) | Dispute window in ms, same semantics |
| `attestation.move` | `src/WeaveosCore.sol` (`verifyDevAttestations`, `verifyAttestations`) | See "Deliberate adaptations" below |
| `settlement.move` | `src/WeaveosCore.sol` (`settleWorkflowDev`, `settleWorkflow`) | All ARCHITECTURE.md §10.3 invariants preserved verbatim |
| — | `src/MockUSDC.sol` | 6-decimal open-mint ERC20 for the demo; swap in Circle Fuji USDC (`0x5425890298aed601595a70AB815c96711a31Bc65`) via `USDC_ADDRESS` at deploy |

## Deliberate adaptations (Sui → EVM)

1. **ed25519 → ECDSA secp256k1.** The hackathon dev-signer path used Sui's native
   `ed25519_verify`; the EVM has no ed25519 precompile, so dev signers are now
   Ethereum addresses and signatures verify via `ecrecover`. Same M-of-N +
   allowlist + distinct-signer semantics.
2. **BCS → abi.encode.** The canonical signed bytes are
   `digest = keccak256(abi.encode(payload))`, signed EIP-191 style, so a TS
   verifier is just `wallet.signMessage(ethers.getBytes(digest))`.
3. **Shared objects → mappings.** Quote/Workflow/Execution/Outcome/Settlement
   live in one `WeaveosCore` contract; Execution/Outcome/Settlement are keyed
   by `workflowId` (they were always 1:1).
4. **PTB atomicity → tx atomicity.** The multi-party disbursement loop runs in
   a single EVM transaction; any revert unwinds all transfers.
5. **Clock object → block.timestamp.** All stored timestamps stay in **ms**
   for parity with the existing TS/frontend code. Payload timestamps tolerate
   120 s of clock skew (`TIMESTAMP_SKEW_MS`).
6. **Move error codes → custom errors.** Each Solidity error is annotated with
   the Move code it replaces (e.g. `SelfPay()` ⇔ `800009`).

Everything the Move-side settlement enforced is preserved: registered
recipients only, no self-pay, `sum(splits) ≤ escrow` and `≤ quote.price`,
`platform_fee ≤ fee_cap` and `≤ fee_max_bps × price`, provider splits must
equal reconciled costs, dispute window + open-dispute blocking, full-refund
failure branch, residual back to the customer, permissionless settlement.

## Commands

```bash
# test (11 tests: the 8 Move scenarios + tampered-payload, residual, fee-cap)
forge test

# deploy to Fuji (deployer key in .env; needs ~0.2 test AVAX)
source .env
forge script script/Deploy.s.sol --rpc-url fuji --broadcast

# check deployer balance
cast balance $DEPLOYER_ADDRESS --rpc-url fuji
```

Faucets: https://core.app/tools/testnet-faucet/ (sign in; coupon needed
without mainnet AVAX — grab one via https://guild.xyz/avalanche) or
https://faucets.chain.link/fuji (GitHub sign-in).

Deployment records land in `deployments/fuji.json` (mirrors
`backend/move/deployments/testnet.json`).
