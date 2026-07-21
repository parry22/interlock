"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertDiamondIcon,
  Cancel01Icon,
  CheckmarkCircleIcon,
} from "@hugeicons/core-free-icons";

export function DisputeModal({
  workflowId,
  outcomeId,
  onClose,
  onFiled,
}: {
  workflowId: string;
  outcomeId: string;
  onClose: () => void;
  onFiled: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    digest: string;
    evidenceBlobId: string;
    explorer: string;
  } | null>(null);

  async function submit() {
    if (text.trim().length < 5) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/sui/file-dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId, outcomeId, evidenceText: text }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
      setSuccess(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={busy ? undefined : onClose} />

      <div className="relative w-full max-w-[560px] bg-[#0a0a0a] border border-[#1e1e1e] rounded-[20px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e1e]">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={AlertDiamondIcon} size={16} color="#f87171" strokeWidth={1.5} />
            <span className="text-[14px] font-semibold text-white">File dispute</span>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-[#5a5a5a] hover:text-white transition-colors disabled:opacity-50"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} color="currentColor" strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-3">
          {success ? (
            <>
              <div className="flex items-center gap-2 text-[#4ade80]">
                <HugeiconsIcon icon={CheckmarkCircleIcon} size={14} color="currentColor" strokeWidth={1.5} />
                <span className="text-[13px] font-medium">Dispute filed</span>
              </div>
              <p className="text-[12px] text-[#a3a3a3]">
                The Workflow is now in <span className="text-[#f87171]">DISPUTED</span> state on chain. Settlement is blocked until the dispute resolves.
              </p>
              <div className="flex flex-col gap-2 text-[12px] font-mono">
                <div>
                  <span className="text-[#5a5a5a]">Evidence blob: </span>
                  <span className="text-[#60a5fa] break-all">{success.evidenceBlobId}</span>
                </div>
                <div>
                  <span className="text-[#5a5a5a]">Tx: </span>
                  <a
                    href={success.explorer}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#60a5fa] hover:text-[#93c5fd]"
                  >
                    {success.digest}
                  </a>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-[12px] text-[#a3a3a3]">
                Describe why the outcome should be reversed. The text will be uploaded to Walrus and the
                blob ID stored in <code className="font-mono">outcome::DisputeFiled</code> on chain.
              </p>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder="The agent reported ticket_status=closed but the customer never received a refund. See attached email thread..."
                className="bg-[#111] border border-[#1e1e1e] rounded-md px-3 py-2 text-[13px] text-[#d4d4d4] outline-none focus:border-[#2a2a2a] font-mono"
              />
              {error && (
                <p className="text-[12px] text-[#f87171] break-all">{error}</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#1e1e1e] px-5 py-3 flex items-center justify-end gap-2">
          {success ? (
            <button
              onClick={() => {
                onFiled();
                onClose();
              }}
              className="px-4 py-2 rounded-full text-[13px] font-medium bg-[#3064FF] hover:bg-[#2050d0] text-white transition-colors"
            >
              Close + refresh
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={busy}
                className="px-4 py-2 rounded-full text-[13px] font-medium bg-[#1e1e1e] border border-[#272727] text-[#a3a3a3] hover:text-white transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={busy || text.trim().length < 5}
                className="px-4 py-2 rounded-full text-[13px] font-medium bg-[#dc2626] hover:bg-[#b91c1c] disabled:bg-[#1e1e1e] disabled:text-[#5a5a5a] text-white transition-colors"
              >
                {busy ? "Filing…" : "File dispute"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
