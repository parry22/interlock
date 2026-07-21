"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { RequestAccessButton } from "@/components/RequestAccessButton";

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [skewX, setSkewX] = useState(-7);
  const [skewY, setSkewY] = useState(2);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    // ShellLayout wraps marketing pages in an overflow-y-auto div
    const container = section.closest(".overflow-y-auto") as HTMLElement | null;
    const target = (container ?? window) as EventTarget;

    const onScroll = () => {
      const scrollTop = container ? container.scrollTop : window.scrollY;
      const heroHeight = section.offsetHeight;
      // progress 0 → 1 over the first 55% of the hero height
      const progress = Math.max(0, Math.min(1, scrollTop / (heroHeight * 0.55)));
      setSkewX(-7 * (1 - progress));
      setSkewY(2 * (1 - progress));
    };

    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative z-10 w-full overflow-hidden flex items-center"
      style={{ minHeight: "100svh" }}
    >

      {/* Left: text + CTA — vertically centred on desktop, left-anchored at all sizes.
          Mobile keeps a top offset so the text sits below the fixed nav. */}
      <div className="relative z-10 w-full max-w-[1200px] mx-auto px-5 pt-[42svh] pb-16 sm:pt-0 sm:pb-0">
        <div className="max-w-[480px]">

          <h1
            className="font-medium text-white tracking-tight text-[32px] sm:text-[48px]"
            style={{ lineHeight: 1.1 }}
          >
            Payment your AI agents actually earn
          </h1>

          <p
            className="mt-4 sm:mt-5 leading-relaxed text-[14px] sm:text-[18px]"
            style={{ color: "#808080", maxWidth: "400px" }}
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

      {/* Right: skewed dashboard — desktop only.
          left: 55% pushes it well right of centre.
          top: 12% / bottom: 0 gives it a fixed height so the image
          can fill by height (width auto) and bleed off the right edge.
          section overflow:hidden clips it.                          */}
      <div
        className="hidden sm:block absolute pointer-events-none"
        style={{ left: "55%", top: "12%", bottom: 0 }}
      >
        <div
          style={{
            transform: `skewX(${skewX}deg) skewY(${skewY}deg)`,
            transformOrigin: "left center",
            height: "100%",
            width: "fit-content",
            overflow: "hidden",
            borderRadius: "14px",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "-24px 24px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.03)",
            transition: "transform 0.07s ease-out",
          }}
        >
          {/* height:100% fills the anchored container; width:auto keeps aspect ratio */}
          <Image
            src="/dashboard-hero.png"
            alt="Interlock Dashboard"
            width={3896}
            height={2091}
            priority
            className="max-w-none block"
            style={{ height: "100%", width: "auto" }}
          />
        </div>
      </div>

      {/* Mobile: skewed background image — sits behind text (no z-index = below z-10 text).
          Height-based sizing: image fills full section height, overflows right — section clips it. */}
      <div className="sm:hidden absolute inset-0 pointer-events-none">
        <div
          style={{
            transform: `skewX(${skewX}deg) skewY(${skewY}deg)`,
            transformOrigin: "center top",
            height: "100%",
            width: "fit-content",
            overflow: "hidden",
            borderRadius: "14px",
            border: "1px solid rgba(255,255,255,0.07)",
            transition: "transform 0.07s ease-out",
          }}
        >
          <Image
            src="/dashboard-hero.png"
            alt="Interlock Dashboard"
            width={3896}
            height={2091}
            priority
            className="max-w-none block"
            style={{ height: "100%", width: "auto" }}
          />
        </div>
        {/* Gradient: image peeks at top and bottom, heavy black covers the centred text zone */}
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.92) 22%, rgba(0,0,0,0.95) 55%, rgba(0,0,0,0.78) 72%, rgba(0,0,0,0.28) 88%, rgba(0,0,0,0.1) 100%)",
          }}
        />
      </div>

    </section>
  );
}
