import Link from "next/link";
import { LandingNav } from "@/components/LandingNav";
import { FaqSection } from "@/components/FaqSection";
import { Footer } from "@/components/Footer";

export const metadata = {
  title: "Pricing — Interlock",
  description: "Transparent pricing aligned with your success. Start free, scale on GMV.",
};

/* ── Pricing data ─────────────────────────────────────────────────────── */
const PLANS = [
  {
    name: "Free",
    priceLabel: "$0",
    period: "forever",
    description: "Instrument your first workflows, track real costs, and see exactly where margin leaks.",
    cta: "Start for free",
    ctaHref: "/dashboard",
    primary: false,
    badge: null,
    gmv: "0.5%",
    gmvNote: "on settled GMV · no cap",
    features: [
      "Full dashboard — margin tracking & cost attribution",
      "Value receipts on every settled workflow",
      "Basic integrations",
      "Up to 100 workflows / month",
    ],
  },
  {
    name: "Growth",
    priceLabel: "$150",
    period: "per month",
    description: "For teams actively shipping AI products who need pricing controls and customer-level analytics.",
    cta: "Get started",
    ctaHref: "/dashboard",
    primary: false,
    badge: null,
    gmv: "0.5%",
    gmvNote: "on settled GMV",
    features: [
      "Everything in Free",
      "Unlimited workflows",
      "Pre-execution quote builder",
      "Stop-loss guardrails",
      "A/B pricing tests",
      "Customer-level analytics",
      "Advanced integrations",
    ],
  },
  {
    name: "Scale",
    priceLabel: "$500",
    period: "per month",
    description: "For scaling teams running complex multi-agent workflows who need intelligence and policy controls.",
    cta: "Get started",
    ctaHref: "/dashboard",
    primary: true,
    badge: "Most Popular",
    gmv: "0.5%",
    gmvNote: "on settled GMV",
    features: [
      "Everything in Growth",
      "Benchmarking & pricing intelligence",
      "Multi-agent workflow support",
      "Custom margin policies",
      "Approval flows",
      "Priority support",
    ],
  },
  {
    name: "Enterprise",
    priceLabel: "Custom",
    period: "contact sales",
    description: "For organisations requiring on-chain settlement, atomic multi-party splits, and enterprise compliance.",
    cta: "Talk to us",
    ctaHref: "/contact",
    primary: false,
    badge: null,
    gmv: "0.4%",
    gmvNote: "on settled GMV · volume discount",
    features: [
      "Everything in Scale",
      "Escrow & dispute resolution",
      "Multi-party atomic splits",
      "Immutable audit trail exports",
      "SSO / SAML / VPC",
      "Dedicated CSM",
      "Custom SLA",
    ],
  },
];

const PRICING_FAQS = [
  {
    q: "What counts as settled GMV?",
    a: "GMV is the total value of workflows that successfully complete and settle through Interlock. Failed workflows, refunds, and disputes that have not resolved are excluded — you only pay when value actually moves.",
  },
  {
    q: "Is the GMV rate charged on top of the monthly fee?",
    a: "Yes. The monthly fee covers platform access and feature tier. The GMV rate applies separately to the value of each settled workflow. On the Free plan there is no monthly fee — only the 0.5% GMV rate applies.",
  },
  {
    q: "What happens when I hit the 100-workflow cap on Free?",
    a: "Execution pauses until the next billing cycle resets the counter. You receive warnings at 80% and 100%. Upgrading to Growth removes the cap entirely.",
  },
  {
    q: "Can I switch plans at any time?",
    a: "Yes. Upgrades take effect immediately. Downgrades apply at the start of the next billing cycle. Annual billing is available on Growth and Scale with a 20% discount.",
  },
  {
    q: "What does the Enterprise GMV discount look like?",
    a: "Enterprise accounts negotiate a custom rate below 0.5%, typically based on committed monthly GMV volume. Reach out and we will run the numbers with you.",
  },
];

/* ── Feature row ──────────────────────────────────────────────────────── */
function FeatureItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-[3px] shrink-0 text-[13px] font-semibold" style={{ color: "#3064FF" }}>—</span>
      <span className="text-[13px] leading-snug" style={{ color: "#808080" }}>{text}</span>
    </li>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */
export default function PricingPage() {
  return (
    <div className="min-h-full flex flex-col bg-black text-white">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{ background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(30,60,180,0.07) 0%, transparent 70%)" }}
      />

      <LandingNav />

      <div className="relative z-10 w-full flex-1 pt-32 pb-0 px-5">
        <div className="max-w-[1200px] mx-auto">

          {/* ── Header ──────────────────────────────────────────── */}
          <div className="text-center mb-16">
            {/* Badge */}
            <div className="inline-flex w-fit rounded-full p-[1px] mb-5" style={{ background: "linear-gradient(135deg, #1a1a1a, #2e2e2e)" }}>
              <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-[#111113]">
                <span className="text-[#3064FF] text-[13px] font-medium">Pricing</span>
              </div>
            </div>

            <h1
              className="font-semibold text-white tracking-tight"
              style={{ fontSize: "clamp(30px, 4vw, 52px)", lineHeight: 1.1 }}
            >
              Aligned with your success.
            </h1>
            <p className="mt-4 text-[16px] leading-relaxed max-w-[500px] mx-auto" style={{ color: "#808080" }}>
              Start free. Scale on GMV. Interlock earns only when your workflows settle — not before.
            </p>
          </div>

          {/* ── Cards ────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className="relative flex flex-col rounded-[20px] p-6"
                style={{
                  background: plan.primary ? "rgba(48,100,255,0.04)" : "#171718",
                  border: plan.primary ? "1px solid rgba(48,100,255,0.25)" : "1px solid #1e1e1e",
                }}
              >
                {/* Most Popular badge */}
                {plan.badge && (
                  <div className="absolute -top-[13px] left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <span
                      className="px-3 py-1 rounded-full text-[11px] font-semibold"
                      style={{ background: "#3064FF", color: "#fff" }}
                    >
                      {plan.badge}
                    </span>
                  </div>
                )}

                {/* Plan name */}
                <p
                  className="text-[11px] font-semibold uppercase tracking-widest mb-5"
                  style={{ color: plan.primary ? "#3064FF" : "#3a3a3a" }}
                >
                  {plan.name}
                </p>

                {/* Price */}
                <div className="flex items-end gap-1.5 mb-1">
                  <span className="text-[38px] font-semibold text-white leading-none tracking-tight">
                    {plan.priceLabel}
                  </span>
                  {plan.priceLabel !== "Custom" && (
                    <span className="text-[13px] mb-1" style={{ color: "#5a5a5a" }}>/mo</span>
                  )}
                </div>
                <p className="text-[12px] mb-5" style={{ color: "#3a3a3a" }}>{plan.period}</p>

                {/* Description */}
                <p className="text-[13px] leading-relaxed mb-6" style={{ color: "#5a5a5a" }}>
                  {plan.description}
                </p>

                {/* CTA */}
                <Link
                  href={plan.ctaHref}
                  className="group relative flex items-center justify-center gap-2 w-full rounded-full overflow-hidden pt-[9px] pb-[9px] pl-5 pr-[3px] mb-7 transition-opacity"
                  style={
                    plan.primary
                      ? { background: "#3064FF", border: "2px solid #3064FF" }
                      : { background: "transparent", border: "1px solid #272727" }
                  }
                >
                  {plan.primary && (
                    <span
                      className="absolute right-[3px] top-1/2 -translate-y-1/2 w-[30px] h-[30px] rounded-full bg-black scale-0 group-hover:scale-[10] transition-transform duration-500 ease-in-out"
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className="relative z-10 text-[13px] font-semibold"
                    style={{ color: plan.primary ? "#fff" : "#808080" }}
                  >
                    {plan.cta}
                  </span>
                  <span
                    className="relative z-10 w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0"
                    style={{ background: plan.primary ? "#000" : "#1e1e1e" }}
                  >
                    <svg
                      className={plan.primary ? "transition-transform duration-500 group-hover:-rotate-45" : ""}
                      width="10" height="10" viewBox="0 0 11 11" fill="none"
                    >
                      <path d="M2 5.5h7M5.5 2 9 5.5 5.5 9" stroke={plan.primary ? "white" : "#5a5a5a"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </Link>

                {/* GMV rate */}
                <p className="text-[13px] mb-5" style={{ color: "#808080" }}>
                  <span className="text-white font-semibold">{plan.gmv}</span>
                  {" "}{plan.gmvNote}
                </p>

                {/* Divider */}
                <div className="mb-5" style={{ borderTop: "1px dashed #272727" }} />

                {/* Features */}
                <ul className="flex flex-col gap-2.5">
                  {plan.features.map((f, i) => (
                    <FeatureItem key={i} text={f} />
                  ))}
                </ul>

              </div>
            ))}
          </div>

          {/* ── All-plans note ───────────────────────────────────── */}
          <p className="text-center text-[12px] mb-20" style={{ color: "#3a3a3a" }}>
            GMV fee charged only on successfully settled workflows — failed or disputed workflows are not billed.{" "}
            <Link href="/contact" className="underline underline-offset-2 hover:text-white transition-colors">
              Annual billing available.
            </Link>
          </p>

        </div>
      </div>

      {/* ── FAQ ─────────────────────────────────────────────────── */}
      <FaqSection
        questions={PRICING_FAQS}
        heading="Pricing questions."
        subtitle="Anything else, reach us at team@interlock.xyz."
      />

      <Footer />
    </div>
  );
}
