/* ─────────────────────────────────────────────────────────────────
   Global CTA — bottom-of-page section
   Left: badge + heading + subtitle + button
   Right: visual placeholder (user will populate)
   ───────────────────────────────────────────────────────────────── */

import { RequestAccessButton } from "@/components/RequestAccessButton";

export function CtaSection() {
  return (
    <section className="relative z-10 w-full bg-black py-20">
      <div className="max-w-[1200px] mx-auto px-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* ── Left: text ───────────────────────────────────────── */}
          <div className="flex flex-col gap-6">

            {/* Badge */}
            <div className="inline-flex w-fit rounded-full p-[1px]" style={{ background: "linear-gradient(135deg, #1a1a1a, #2e2e2e)" }}>
              <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-[#111113]">
                <span className="text-[#3064FF] text-[13px] font-medium">Start now</span>
              </div>
            </div>

            {/* Heading */}
            <h2
              className="font-bold text-white tracking-tight"
              style={{ fontSize: "clamp(32px, 4vw, 52px)", lineHeight: 1.1 }}
            >
              Make every AI<br />task worth running.
            </h2>

            {/* Subtitle */}
            <p className="text-[16px] leading-relaxed" style={{ color: "#808080" }}>
              Quote, control, and track margin before agents burn money.
            </p>

            <div className="self-start">
              <RequestAccessButton size="sm" />
            </div>
          </div>

          {/* ── Right: visual placeholder ─────────────────────────
              User will replace this with a 3D / visual asset.    */}
          <div
            className="w-full rounded-[20px] min-h-[320px] lg:min-h-[380px]"
            style={{ background: "#0f0f11", border: "1px solid #1e1e1e" }}
          />

        </div>
      </div>
    </section>
  );
}
