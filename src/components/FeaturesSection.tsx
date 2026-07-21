import Image from "next/image";

const CARDS = [
  {
    highlight: "Quoted, executed, and settled automatically.",
    rest: " No manual invoicing. The moment your agent finishes, Interlock verifies the result and pays out in a single transaction.",
    image: "/image1.png",
    alt: "Workflow moving from quote to settlement",
  },
  {
    highlight: "Every stage and every dollar, in one place.",
    rest: " Follow a job from quote to payout, and watch your margin per customer trend over time.",
    image: "/image2.png",
    alt: "Workflow lifecycle and margin trend",
  },
  {
    highlight: "No more budget-overrun support tickets.",
    rest: " The price is locked in before your agent runs, so customers are never charged more than the quote.",
    image: "/image3.png",
    alt: "Customer asking about an agent that went over budget",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="relative z-10 w-full bg-black pt-20 pb-20 px-5">
      <div className="max-w-[1200px] mx-auto flex flex-col items-start gap-10">

        {/* ── "How it works" badge ─────────────────────────────── */}
        <div className="inline-flex w-fit rounded-full p-[1px]" style={{ background: "linear-gradient(135deg, #1a1a1a, #2e2e2e)" }}>
          <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-[#111113]">
            <span className="text-[#3064FF] text-[13px] font-medium">How it works</span>
          </div>
        </div>

        {/* ── Heading — fixed 40px, grey = #808080 ─────────────── */}
        <div
          className="flex flex-col items-start text-left"
          style={{ fontSize: "clamp(28px, 3.2vw, 40px)", lineHeight: 1.18, gap: "0.08em" }}
        >
          <span className="font-semibold" style={{ color: "#808080" }}>
            Every AI workflow,
          </span>
          <span className="font-semibold text-white">
            quoted, verified, and paid automatically
          </span>
        </div>

        {/* ── Cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
          {CARDS.map((card) => (
            <div
              key={card.alt}
              className="flex flex-col overflow-hidden rounded-t-[20px]"
              style={{
                background: "#111113",
                border: "1px solid #1e1e1e",
                borderBottom: "none",
              }}
            >
              {/* Paragraph — 16px, white hook + #808080 continuation */}
              <div className="px-5 pt-5 pb-5 shrink-0">
                <p className="text-[16px] leading-relaxed">
                  <span className="text-white font-medium">{card.highlight}</span>
                  <span style={{ color: "#808080" }}>{card.rest}</span>
                </p>
              </div>

              {/* Image — fills remaining card, dissolves into black at bottom */}
              <div className="relative flex-1 min-h-[280px] sm:min-h-[220px] overflow-hidden">
                <Image
                  src={card.image}
                  alt={card.alt}
                  fill
                  className="object-cover object-top"
                  sizes="(max-width: 640px) 100vw, (max-width: 1200px) 33vw, 400px"
                  quality={90}
                />
                {/* Dissolve gradient — only bottom ~35% fades to black */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      "linear-gradient(to bottom, transparent 80%, rgba(0,0,0,0.65) 100%)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
