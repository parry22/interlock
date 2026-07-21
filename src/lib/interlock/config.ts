// Centralized env config for the Interlock off-chain services.
//
// Chain-specific config (RPC, contract addresses) lives in ./evm.ts.
// This file holds the chain-agnostic pieces: Walrus blob storage + business
// constants. The verifier signing key is read from process.env at request
// time and never logged.

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export const interlockConfig = {
  /**
   * Public Walrus testnet endpoints — free, rate-limited, fine for demo
   * scale. Production would self-host a publisher. Walrus is chain-agnostic
   * blob storage (plain HTTP), used for traces / outcomes / proof records.
   */
  walrusPublisher: process.env.WALRUS_PUBLISHER ?? "https://publisher.walrus-testnet.walrus.space",
  walrusAggregator: process.env.WALRUS_AGGREGATOR ?? "https://aggregator.walrus-testnet.walrus.space",

  /** How many Walrus epochs to keep blobs alive for (2 weeks each on testnet). */
  walrusEpochs: 5,

  /** Default dispute window for demos (1 minute → snappier demo flow). */
  defaultDisputeWindowSeconds: 60,
} as const;

/** Lazy getters for secrets — throw if missing only when actually needed. */
export const interlockSecrets = {
  /** ECDSA private key (0x-hex) the verifier signs attestations with.
   *  Its address must be registered via WeaveosRegistry.allowDevSigner. */
  get devSignerPrivkey(): string {
    return required("INTERLOCK_DEV_SIGNER_PRIVKEY");
  },
  /** Registry admin + gas sponsor for custodial-wallet funding. */
  get adminPrivkey(): string {
    return required("INTERLOCK_ADMIN_PRIVKEY");
  },
};
