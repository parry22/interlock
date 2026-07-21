import Link from "next/link";
import { LandingNav } from "@/components/LandingNav";
import { Footer } from "@/components/Footer";

export const metadata = {
  title: "Blog — Interlock",
  description: "Thinking on AI pricing, agent economics, and the infrastructure behind outcome-based billing.",
};

/* ── Cover art components ─────────────────────────────────────────────── */

/* Cover 1 — Cost breakdown bar chart with gradient bars + quoted-price ceiling */
function CoverCost() {
  const bars = [
    { x: 32,  h: 52,  highlight: false },
    { x: 74,  h: 78,  highlight: false },
    { x: 116, h: 64,  highlight: false },
    { x: 158, h: 100, highlight: false },
    { x: 200, h: 82,  highlight: false },
    { x: 242, h: 118, highlight: false },
    { x: 284, h: 96,  highlight: false },
    { x: 326, h: 148, highlight: true  },
  ];
  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: "#05050f" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 90% 70% at 50% 120%, rgba(48,100,255,0.22) 0%, transparent 60%)" }} />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 40% 40% at 90% 10%, rgba(80,60,220,0.12) 0%, transparent 55%)" }} />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bar-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4d7fff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#1a3a8a" stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id="bar-hot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7ba8ff" stopOpacity="1" />
            <stop offset="50%" stopColor="#3064FF" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#1a3a8a" stopOpacity="0.3" />
          </linearGradient>
          <filter id="glow-bar" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <pattern id="grid-c" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(48,100,255,0.06)" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="400" height="240" fill="url(#grid-c)" />
        {/* Horizontal guide lines */}
        {[60, 100, 140, 180].map((y, i) => (
          <line key={i} x1="20" y1={y} x2="380" y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="4 6" />
        ))}
        {/* Quoted price ceiling */}
        <line x1="20" y1="80" x2="380" y2="80" stroke="rgba(48,100,255,0.45)" strokeWidth="1.5" strokeDasharray="6 5" />
        <text x="26" y="75" fontSize="9" fill="rgba(48,100,255,0.7)" fontFamily="ui-monospace,monospace" letterSpacing="0.05em">QUOTED</text>
        {/* Bars */}
        {bars.map((b, i) => (
          <g key={i} filter={b.highlight ? "url(#glow-bar)" : undefined}>
            <rect x={b.x} y={240 - b.h - 10} width="28" height={b.h} rx="3"
              fill={b.highlight ? "url(#bar-hot)" : "url(#bar-grad)"} />
            {b.highlight && (
              <rect x={b.x} y={240 - b.h - 10} width="28" height="3" rx="1.5" fill="#7ba8ff" opacity="0.9" />
            )}
          </g>
        ))}
        {/* Spike label */}
        <text x="340" y={240 - 148 - 18} fontSize="9" fill="rgba(120,168,255,0.8)" fontFamily="ui-monospace,monospace">↑ spike</text>
      </svg>
    </div>
  );
}

/* Cover 2 — Live monitoring line chart with floor threshold & alert */
function CoverGuardrails() {
  const linePath = "M 30 190 C 70 186 100 178 130 165 C 160 150 175 138 195 120 C 215 102 225 90 245 78 C 260 70 270 68 285 66";
  const areaPath = `${linePath} L 285 210 L 30 210 Z`;
  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: "#05050f" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 60% at 30% 60%, rgba(48,100,255,0.18) 0%, transparent 55%)" }} />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 40% 50% at 80% 20%, rgba(200,100,30,0.07) 0%, transparent 55%)" }} />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 360 220" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3064FF" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#3064FF" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="warn-zone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e0900a" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#e0900a" stopOpacity="0.02" />
          </linearGradient>
          <filter id="glow-line" x="-20%" y="-60%" width="140%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="glow-dot" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <pattern id="grid-g" x="0" y="0" width="36" height="36" patternUnits="userSpaceOnUse">
            <path d="M 36 0 L 0 0 0 36" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="360" height="220" fill="url(#grid-g)" />
        {/* Warning zone above floor */}
        <rect x="0" y="20" width="360" height="68" fill="url(#warn-zone)" />
        {/* Floor line */}
        <line x1="20" y1="88" x2="340" y2="88" stroke="rgba(224,144,10,0.55)" strokeWidth="1.5" strokeDasharray="7 5" />
        <text x="24" y="83" fontSize="9" fill="rgba(224,144,10,0.75)" fontFamily="ui-monospace,monospace" letterSpacing="0.05em">MARGIN FLOOR</text>
        {/* Area fill */}
        <path d={areaPath} fill="url(#area-grad)" />
        {/* Line */}
        <path d={linePath} fill="none" stroke="#3d7fff" strokeWidth="2.5" strokeLinecap="round" filter="url(#glow-line)" />
        {/* Breach dot */}
        <circle cx="285" cy="66" r="10" fill="rgba(224,144,10,0.12)" filter="url(#glow-dot)" />
        <circle cx="285" cy="66" r="5"  fill="rgba(224,144,10,0.3)" />
        <circle cx="285" cy="66" r="3"  fill="#e0900a" />
        {/* Alert label */}
        <text x="296" y="62" fontSize="9" fill="rgba(224,144,10,0.85)" fontFamily="ui-monospace,monospace">⚠ breach</text>
        {/* Y-axis ticks */}
        {[88, 130, 170].map((y, i) => (
          <text key={i} x="4" y={y + 3} fontSize="8" fill="rgba(255,255,255,0.18)" fontFamily="ui-monospace,monospace">
            {["0.9","0.6","0.3"][i]}
          </text>
        ))}
      </svg>
    </div>
  );
}

/* Cover 3 — Usage-based pricing tiers with S-curve adoption */
function CoverUsageBased() {
  const curve = "M 20 208 C 60 205 90 200 120 190 C 150 178 165 160 185 135 C 205 108 220 80 248 55 C 268 38 290 28 340 18";
  const area  = `${curve} L 340 215 L 20 215 Z`;
  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: "#05050f" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 60% at 70% 100%, rgba(48,100,255,0.2) 0%, transparent 55%)" }} />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 380 230" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="tier1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3064FF" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#3064FF" stopOpacity="0.04" />
          </linearGradient>
          <linearGradient id="tier2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3064FF" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#3064FF" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="curve-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5590ff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#3064FF" stopOpacity="0.02" />
          </linearGradient>
          <filter id="glow-curve" x="-10%" y="-60%" width="120%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="glow-pt" x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <pattern id="grid-u" x="0" y="0" width="38" height="38" patternUnits="userSpaceOnUse">
            <path d="M 38 0 L 0 0 0 38" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="380" height="230" fill="url(#grid-u)" />
        {/* Pricing tier bands */}
        <rect x="0" y="145" width="380" height="70" fill="url(#tier1)" />
        <rect x="0" y="80"  width="380" height="65" fill="url(#tier2)" />
        <line x1="18" y1="145" x2="362" y2="145" stroke="rgba(48,100,255,0.18)" strokeWidth="1" strokeDasharray="5 6"/>
        <line x1="18" y1="80"  x2="362" y2="80"  stroke="rgba(48,100,255,0.18)" strokeWidth="1" strokeDasharray="5 6"/>
        <text x="22" y="158" fontSize="8" fill="rgba(100,140,255,0.55)" fontFamily="ui-monospace,monospace" letterSpacing="0.04em">STARTER</text>
        <text x="22" y="94"  fontSize="8" fill="rgba(100,140,255,0.55)" fontFamily="ui-monospace,monospace" letterSpacing="0.04em">GROWTH</text>
        <text x="22" y="40"  fontSize="8" fill="rgba(100,140,255,0.55)" fontFamily="ui-monospace,monospace" letterSpacing="0.04em">SCALE</text>
        {/* Area fill */}
        <path d={area} fill="url(#curve-fill)" />
        {/* Curve */}
        <path d={curve} fill="none" stroke="#5590ff" strokeWidth="2.5" strokeLinecap="round" filter="url(#glow-curve)" />
        {/* Data points */}
        {([[120,190],[185,135],[248,55],[310,26]] as [number,number][]).map(([x, y], i) => (
          <g key={i} filter="url(#glow-pt)">
            <circle cx={x} cy={y} r="7"  fill="rgba(48,100,255,0.15)" />
            <circle cx={x} cy={y} r="3.5" fill="#5590ff" opacity="0.9" />
          </g>
        ))}
      </svg>
    </div>
  );
}

/* Cover 4 — Multi-party agent settlement network */
function CoverAgentEcon() {
  const center: [number, number] = [190, 118];
  const nodes: { pos: [number,number]; label: string; color: string }[] = [
    { pos: [190,  36], label: "Model",    color: "#3064FF" },
    { pos: [300,  78], label: "Tool API", color: "#7c55f5" },
    { pos: [316, 172], label: "Platform", color: "#3064FF" },
    { pos: [190, 204], label: "Escrow",   color: "#22c55e" },
    { pos: [ 64, 172], label: "Human",    color: "#7c55f5" },
    { pos: [ 78,  78], label: "Operator", color: "#3064FF" },
  ];
  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: "#05050f" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 60% at 50% 50%, rgba(48,100,255,0.15) 0%, transparent 65%)" }} />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 35% 35% at 80% 80%, rgba(124,85,245,0.1) 0%, transparent 55%)" }} />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 380 240" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="glow-hub" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="glow-node" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <pattern id="grid-a" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth="0.5"/>
          </pattern>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="rgba(48,100,255,0.5)" />
          </marker>
        </defs>
        <rect width="380" height="240" fill="url(#grid-a)" />
        {/* Connections */}
        {nodes.map((n, i) => (
          <line key={i}
            x1={center[0]} y1={center[1]}
            x2={n.pos[0]}  y2={n.pos[1]}
            stroke={`${n.color}55`} strokeWidth="1.5"
            markerEnd="url(#arrow)" strokeDasharray="0"
          />
        ))}
        {/* Peripheral nodes */}
        {nodes.map((n, i) => (
          <g key={i} filter="url(#glow-node)">
            <circle cx={n.pos[0]} cy={n.pos[1]} r="14" fill={`${n.color}18`} stroke={`${n.color}50`} strokeWidth="1" />
            <circle cx={n.pos[0]} cy={n.pos[1]} r="5"  fill={n.color} opacity="0.85" />
          </g>
        ))}
        {/* Node labels */}
        {nodes.map((n, i) => {
          const offY = n.pos[1] < center[1] ? -20 : 22;
          return (
            <text key={i} x={n.pos[0]} y={n.pos[1] + offY}
              fontSize="8.5" fill="rgba(255,255,255,0.45)" fontFamily="ui-monospace,monospace"
              textAnchor="middle" letterSpacing="0.03em">
              {n.label}
            </text>
          );
        })}
        {/* Centre hub rings */}
        <circle cx={center[0]} cy={center[1]} r="32" fill="rgba(48,100,255,0.06)" stroke="rgba(48,100,255,0.15)" strokeWidth="1" />
        <circle cx={center[0]} cy={center[1]} r="20" fill="rgba(48,100,255,0.12)" stroke="rgba(48,100,255,0.3)"  strokeWidth="1" filter="url(#glow-hub)" />
        <circle cx={center[0]} cy={center[1]} r="10" fill="#3064FF" opacity="0.85" filter="url(#glow-hub)" />
        <text x={center[0]} y={center[1] + 46} fontSize="8.5" fill="rgba(100,160,255,0.7)" fontFamily="ui-monospace,monospace" textAnchor="middle" letterSpacing="0.04em">Interlock</text>
      </svg>
    </div>
  );
}

/* ── Blog data ────────────────────────────────────────────────────────── */
const POSTS = [
  {
    slug: "/resources/ai-task-pricing",
    category: "AI Pricing",
    title: "The Hidden Economics of AI Tasks",
    excerpt: "Every AI workflow carries a cost that isn't fixed, isn't predictable, and in most companies isn't tracked. Here's what that costs you.",
    readTime: "8 min read",
    date: "May 2026",
    Cover: CoverCost,
  },
  {
    slug: "/resources/margin-guardrails",
    category: "Cost Control",
    title: "Margin Guardrails Are the Seatbelts of AI Products",
    excerpt: "Real-time controls that catch cost breaches as they happen — not after the revenue is already locked and the losses are sunk.",
    readTime: "7 min read",
    date: "May 2026",
    Cover: CoverGuardrails,
  },
  {
    slug: "/resources/usage-based-pricing",
    category: "Pricing Strategy",
    title: "Why Usage-Based Pricing Is the Only Model That Scales for AI",
    excerpt: "Seat-based pricing breaks the moment your customers start running agents. Here's the model that actually maps to how AI products are consumed.",
    readTime: "9 min read",
    date: "May 2026",
    Cover: CoverUsageBased,
  },
  {
    slug: "/resources/agent-economics",
    category: "Agent Economy",
    title: "The Economics of AI Agents Are Unlike Anything You Have Priced Before",
    excerpt: "Agents aren't tools. They're economic actors. The pricing models that work for SaaS and APIs fail completely for autonomous multi-step workflows.",
    readTime: "10 min read",
    date: "May 2026",
    Cover: CoverAgentEcon,
  },
];

/* ── Page ─────────────────────────────────────────────────────────────── */
const FeaturedCover = POSTS[0].Cover;

export default function BlogPage() {
  return (
    <div className="min-h-full flex flex-col bg-black text-white">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{ background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(30, 60, 180, 0.07) 0%, transparent 70%)" }}
      />

      <LandingNav />

      <div className="relative z-10 w-full flex-1 pt-32 pb-24 px-5">
        <div className="max-w-[1080px] mx-auto">

          {/* Header */}
          <div className="mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#3064FF" }}>
              Blog
            </span>
          </div>
          <h1 className="font-semibold tracking-tight" style={{ fontSize: "clamp(28px, 3.8vw, 42px)", lineHeight: 1.12 }}>
            Thinking out loud.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed max-w-[480px]" style={{ color: "#808080" }}>
            Ideas on AI pricing, agent economics, and the infrastructure that makes
            outcome-based businesses viable.
          </p>

          <div className="mt-8 mb-12" style={{ borderTop: "1px solid #1a1a1a" }} />

          {/* Featured post (first) */}
          <Link href={POSTS[0].slug} className="group block mb-6">
            <div
              className="rounded-2xl overflow-hidden transition-colors"
              style={{ border: "1px solid #1a1a1a", background: "#0a0a0b" }}
            >
              <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr]">
                {/* Cover */}
                <div className="h-[260px] md:h-[300px]">
                  <FeaturedCover />
                </div>
                {/* Content */}
                <div className="flex flex-col justify-center gap-4 p-8 md:p-10">
                  <span
                    className="inline-flex w-fit text-[10px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full"
                    style={{ background: "rgba(48,100,255,0.1)", color: "#3064FF", border: "1px solid rgba(48,100,255,0.2)" }}
                  >
                    {POSTS[0].category}
                  </span>
                  <h2
                    className="font-semibold text-white transition-colors group-hover:text-[#d4d4d4]"
                    style={{ fontSize: "clamp(18px, 2vw, 24px)", lineHeight: 1.25 }}
                  >
                    {POSTS[0].title}
                  </h2>
                  <p className="text-[14px] leading-relaxed" style={{ color: "#5a5a5a" }}>
                    {POSTS[0].excerpt}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[12px]" style={{ color: "#3a3a3a" }}>{POSTS[0].readTime}</span>
                    <span style={{ color: "#3064FF", fontSize: 4 }}>●</span>
                    <span className="text-[12px]" style={{ color: "#3a3a3a" }}>{POSTS[0].date}</span>
                  </div>
                </div>
              </div>
            </div>
          </Link>

          {/* Remaining 3 posts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {POSTS.slice(1).map((post) => {
              const CardCover = post.Cover;
              return (
              <Link key={post.slug} href={post.slug} className="group block">
                <div
                  className="rounded-2xl overflow-hidden flex flex-col h-full transition-colors"
                  style={{ border: "1px solid #1a1a1a", background: "#0a0a0b" }}
                >
                  {/* Cover */}
                  <div className="h-[180px]">
                    <CardCover />
                  </div>
                  {/* Content */}
                  <div className="flex flex-col gap-3 p-6 flex-1">
                    <span
                      className="inline-flex w-fit text-[10px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full"
                      style={{ background: "rgba(48,100,255,0.1)", color: "#3064FF", border: "1px solid rgba(48,100,255,0.2)" }}
                    >
                      {post.category}
                    </span>
                    <h2
                      className="font-semibold text-white transition-colors group-hover:text-[#d4d4d4]"
                      style={{ fontSize: "16px", lineHeight: 1.35 }}
                    >
                      {post.title}
                    </h2>
                    <p className="text-[13px] leading-relaxed flex-1" style={{ color: "#5a5a5a" }}>
                      {post.excerpt}
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[11px]" style={{ color: "#3a3a3a" }}>{post.readTime}</span>
                      <span style={{ color: "#3064FF", fontSize: 4 }}>●</span>
                      <span className="text-[11px]" style={{ color: "#3a3a3a" }}>{post.date}</span>
                    </div>
                  </div>
                </div>
              </Link>
              );
            })}
          </div>

        </div>
      </div>

      <Footer />
    </div>
  );
}
