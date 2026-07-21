// Walrus testnet publisher + aggregator HTTP wrappers.
//
// Walrus's HTTP API lets us upload blobs and reference them by blob ID. The
// hackathon uses the public testnet publisher (rate-limited, free). Mainnet
// would self-host a publisher per ARCHITECTURE.md §10.2.

import { interlockConfig } from "./config";

/** fetch with an AbortController timeout + one retry, so a hung public
 *  endpoint can't stall the verify→settle pipeline until the function times
 *  out. Throws a clear error on timeout. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  opts?: { timeoutMs?: number; retries?: number },
): Promise<Response> {
  const timeoutMs = opts?.timeoutMs ?? 15_000;
  const retries = opts?.retries ?? 1;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (e) {
      lastErr = e;
      if ((e as Error).name === "AbortError") {
        lastErr = new Error(`request to ${url} timed out after ${timeoutMs}ms`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export type WalrusBlob = {
  /** The Walrus blob ID — bytes referenced in `Outcome.outcome_blob_id` etc. */
  blobId: string;
  /** Size in bytes, as reported by the publisher. */
  size: number;
  /** Epoch the blob is stored until. */
  endEpoch: number;
};

type StoreResponse = {
  newlyCreated?: {
    blobObject: {
      blobId: string;
      size: number;
      storage: { endEpoch: number };
    };
  };
  alreadyCertified?: {
    blobId: string;
    endEpoch: number;
  };
};

/** Upload `body` to Walrus testnet. Returns blob ID + metadata. */
export async function walrusPut(body: Uint8Array | string): Promise<WalrusBlob> {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  const url = `${interlockConfig.walrusPublisher}/v1/blobs?epochs=${interlockConfig.walrusEpochs}`;

  const resp = await fetchWithTimeout(url, {
    method: "PUT",
    // Cast: TypeScript's lib.dom fetch types haven't caught up to Node 22's
    // native Uint8Array support, but Node and Vercel both accept it directly.
    body: bytes as unknown as BodyInit,
    headers: { "Content-Type": "application/octet-stream" },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Walrus put failed: ${resp.status} ${text}`);
  }
  const json = (await resp.json()) as StoreResponse;

  if (json.newlyCreated) {
    return {
      blobId: json.newlyCreated.blobObject.blobId,
      size: json.newlyCreated.blobObject.size,
      endEpoch: json.newlyCreated.blobObject.storage.endEpoch,
    };
  }
  if (json.alreadyCertified) {
    // Content-addressed: identical bytes get the same blobId. Pull size from
    // the request body since the publisher doesn't echo it for the
    // already-certified path.
    return {
      blobId: json.alreadyCertified.blobId,
      size: bytes.length,
      endEpoch: json.alreadyCertified.endEpoch,
    };
  }
  throw new Error(`Walrus put returned unexpected shape: ${JSON.stringify(json)}`);
}

/** Fetch a blob by ID. Returns raw bytes. */
export async function walrusGet(blobId: string): Promise<Uint8Array> {
  const url = `${interlockConfig.walrusAggregator}/v1/blobs/${blobId}`;
  const resp = await fetchWithTimeout(url, {});
  if (!resp.ok) {
    throw new Error(`Walrus get failed: ${resp.status}`);
  }
  const buf = await resp.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Convert a Walrus blob ID (base64-url or hex) to the byte vector Move stores.
 * The Move side stores blob IDs as `vector<u8>` so the SDK just hashes the
 * blob bytes for the on-chain anchor.
 *
 * For the hackathon we encode the blob ID as UTF-8 bytes — this is what
 * `attestation.payload_outcome_blob_id` will reference.
 */
export function blobIdToBytes(blobId: string): Uint8Array {
  return new TextEncoder().encode(blobId);
}
