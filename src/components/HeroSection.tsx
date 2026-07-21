"use client";

import { RequestAccessButton } from "@/components/RequestAccessButton";

export function HeroSection() {
  return (
    <section
      className="relative z-10 w-full overflow-hidden flex items-center justify-center"
      style={{ minHeight: "100svh" }}
    >
      <div className="relative z-10 w-full max-w-[1200px] mx-auto px-5 flex justify-center text-center">
        <div className="max-w-[640px] flex flex-col items-center">

          <h1
            className="font-medium text-white tracking-tight text-[32px] sm:text-[48px]"
            style={{ lineHeight: 1.1 }}
          >
            Payment your AI agents actually earn
          </h1>

          <p
            className="mt-4 sm:mt-5 leading-relaxed text-[14px] sm:text-[18px]"
            style={{ color: "#808080", maxWidth: "480px" }}
          >
            Set your price and success criteria up front. Your customer&apos;s
            payment waits safely in escrow while an independent verifier checks
            the result. The moment it passes, everyone gets paid at once. If it
            doesn&apos;t, your customer is refunded automatically, in full.
          </p>

          {/* CTA — kicks off Google OAuth → /dashboard */}
          <div className="mt-6 sm:mt-8">
            <RequestAccessButton size="md" />
          </div>

        </div>
      </div>
    </section>
  );
}
