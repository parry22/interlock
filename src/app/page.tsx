import { LandingNav } from "@/components/LandingNav";
import { HeroSection } from "@/components/HeroSection";
import { FeaturesSection } from "@/components/FeaturesSection";
import { FeatureSplitSection } from "@/components/FeatureSplitSection";
import { LogoTicker } from "@/components/LogoTicker";
import { FaqSection } from "@/components/FaqSection";
import { Footer } from "@/components/Footer";

export default function LandingPage() {
  return (
    <div className="min-h-full flex flex-col bg-black text-white">

      {/* Fixed landing navbar */}
      <LandingNav />

      {/* Radial glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(30, 60, 180, 0.1) 0%, transparent 70%)",
        }}
      />

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <HeroSection />

      {/* ── Features (3-card grid) ───────────────────────────────── */}
      <FeaturesSection />

      {/* ── Feature split rows ───────────────────────────────────── */}
      <FeatureSplitSection />

      {/* ── Logo ticker ─────────────────────────────────────────── */}
      <LogoTicker />

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <FaqSection />

      {/* ── Footer ───────────────────────────────────────────────── */}
      <Footer />

    </div>
  );
}
