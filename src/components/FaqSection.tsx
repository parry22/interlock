"use client";

import { useState } from "react";

const DEFAULT_FAQS = [
  {
    q: "What exactly does the platform do?",
    a: "It helps AI companies understand the real economics of every task their agents run, including cost, price, margin, and profitability.",
  },
  {
    q: "Who is this built for?",
    a: "It is built for AI-native companies, agent platforms, workflow automation tools, AI agencies, and teams charging per task, usage, output, or outcome.",
  },
  {
    q: "How is this different from billing or metering tools?",
    a: "Billing tools help you charge customers after usage happens. This helps you understand whether the task should run, what it should cost, and whether it will stay profitable.",
  },
  {
    q: "What costs can the platform track?",
    a: "It can track model usage, token spend, tool calls, API fees, retries, human fallback, workflow duration, and other execution-level costs.",
  },
  {
    q: "Can it stop agents from overspending during execution?",
    a: "Yes. You can set budget caps, margin floors, escalation rules, and stop-loss policies so agents do not keep running when a task becomes unprofitable.",
  },
  {
    q: "Does this replace Stripe, Orb, Metronome, or other billing systems?",
    a: "No. It works before and alongside billing systems. The platform helps decide the right quote, margin, and task economics, while your billing system handles invoicing and collection.",
  },
  {
    q: "Do we need to change our existing agent stack to use it?",
    a: "No major rebuild should be needed. The platform should plug into your existing logs, agent workflows, model usage data, billing data, or internal event streams.",
  },
];

export function FaqSection({ questions, heading, subtitle }: {
  questions?: { q: string; a: string }[];
  heading?: string;
  subtitle?: React.ReactNode;
} = {}) {
  const FAQS = questions ?? DEFAULT_FAQS;
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <section className="relative z-10 w-full bg-black py-20">
      <div className="max-w-[1200px] mx-auto px-5">

        {/* ── Header ───────────────────────────────────────────── */}
        <div className="flex flex-col items-start text-left mb-12 gap-4">

          {/* FAQ badge */}
          <div className="inline-flex w-fit rounded-full p-[1px]" style={{ background: "linear-gradient(135deg, #1a1a1a, #2e2e2e)" }}>
            <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-[#111113]">
              <span className="text-[#3064FF] text-[13px] font-medium">FAQ</span>
            </div>
          </div>

          {/* Heading */}
          <h2
            className="font-bold text-white tracking-tight"
            style={{ fontSize: "clamp(28px, 3.2vw, 40px)", lineHeight: 1.14 }}
          >
            {heading ?? "Any questions?"}
          </h2>

          {/* Subtitle */}
          <p className="text-[16px] leading-relaxed" style={{ color: "#808080" }}>
            {subtitle ?? <>See the info below or drop us a line via the{" "}<a href="/contact" className="text-white font-semibold no-underline">support</a> page.</>}
          </p>
        </div>

        {/* ── Accordion ────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 w-full">
          {FAQS.map((faq, i) => {
            const isOpen = openIdx === i;
            const num = String(i + 1).padStart(2, "0");
            return (
              <div
                key={i}
                className="rounded-[20px] overflow-hidden"
                style={{ background: "#171718", border: "1px solid #1e1e1e" }}
              >
                {/* Question row */}
                <button
                  onClick={() => setOpenIdx(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span
                      className="shrink-0 text-[13px] font-medium"
                      style={{ color: "#5a5a5a" }}
                    >
                      ({num})
                    </span>
                    <span className="text-white text-[15px] font-medium leading-snug">
                      {faq.q}
                    </span>
                  </div>

                  {/* +/× button */}
                  <div
                    className="shrink-0 w-9 h-9 rounded-full bg-white flex items-center justify-center transition-transform duration-300"
                    style={{ transform: isOpen ? "rotate(45deg)" : "rotate(0deg)" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path
                        d="M7 1v12M1 7h12"
                        stroke="#0a0a0a"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                </button>

                {/* Answer — max-height transition */}
                <div
                  style={{
                    maxHeight: isOpen ? "400px" : "0px",
                    overflow: "hidden",
                    transition: "max-height 350ms cubic-bezier(0.4,0,0.2,1)",
                  }}
                >
                  <p
                    className="px-6 pb-6 text-[15px] leading-relaxed"
                    style={{ color: "#808080" }}
                  >
                    {faq.a}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
