type LinkItem = { label: string; href: string };

const COLUMNS: { heading: string; links: LinkItem[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Features",  href: "#features"  },
      { label: "Use Cases", href: "#use-cases" },
      { label: "Pricing",   href: "/pricing"    },
      { label: "Docs",      href: "/docs"       },
      { label: "Changelog", href: "/changelog"  },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About",   href: "/about" },
      { label: "Blog",    href: "/blog" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "AI Task Pricing",     href: "/resources/ai-task-pricing" },
      { label: "Margin Guardrails",   href: "/resources/margin-guardrails" },
      { label: "Usage-Based Pricing", href: "/resources/usage-based-pricing" },
      { label: "Agent Economics",     href: "/resources/agent-economics" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy",    href: "/privacy"  },
      { label: "Terms of Service",  href: "/terms"    },
      { label: "Security",          href: "/security" },
    ],
  },
  {
    heading: "Social",
    links: [
      { label: "X / Twitter", href: "#" },
      { label: "LinkedIn",    href: "#" },
      { label: "GitHub",      href: "#" },
    ],
  },
];

export function Footer() {
  return (
    <footer
      className="relative z-10 w-full bg-black"
      style={{ borderTop: "1px solid #1a1a1a" }}
    >
      <div className="max-w-[1200px] mx-auto px-5 pt-16 pb-10">

        {/* ── Main grid ────────────────────────────────────────────
            Brand (left) + 5 link columns (right)               */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-12 lg:gap-16">

          {/* Brand */}
          <div className="flex flex-col gap-5">
            <img src="/logo.svg" alt="Interlock" width={120} height={24} />
            <p className="text-[15px] leading-relaxed max-w-[300px]">
              <span className="text-white">
                Real-time cost intelligence for AI-native teams.
              </span>
              <span style={{ color: "#808080" }}>
                {" "}Know what every agent task costs before it runs.
              </span>
            </p>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8">
            {COLUMNS.map((col) => (
              <div key={col.heading} className="flex flex-col gap-3">
                <p className="text-white text-[13px] font-semibold">
                  {col.heading}
                </p>
                {col.links.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    className="text-[13px] transition-colors hover:text-white"
                    style={{ color: "#808080" }}
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ── Bottom bar ─────────────────────────────────────────── */}
        <div
          className="flex items-center gap-2 mt-14 pt-6"
          style={{ borderTop: "1px solid #1a1a1a" }}
        >
          <span className="text-[13px]" style={{ color: "#808080" }}>
            All Rights Reserved
          </span>
          <span style={{ color: "#3064FF", fontSize: 6 }}>●</span>
          <span className="text-[13px]" style={{ color: "#808080" }}>
            2026
          </span>
        </div>

      </div>
    </footer>
  );
}
