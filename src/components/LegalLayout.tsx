import { LandingNav } from "./LandingNav";
import { Footer } from "./Footer";

/* ── Shared prose helpers ─────────────────────────────────────────────── */

export function LSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-6" style={{ borderTop: "1px solid #1e1e1e" }} />
      <h2 className="text-[17px] font-semibold text-white mb-4">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function LP({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[14px] leading-[1.8]" style={{ color: "#808080" }}>
      {children}
    </p>
  );
}

export function LList({ children }: { children: React.ReactNode }) {
  return <ul className="space-y-2 mt-1">{children}</ul>;
}

export function LItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="shrink-0 mt-[10px] w-[3px] h-[3px] rounded-full"
        style={{ background: "#5a5a5a" }}
      />
      <span className="text-[14px] leading-[1.8]" style={{ color: "#808080" }}>
        {children}
      </span>
    </li>
  );
}

export function LSub({ title }: { title: string }) {
  return (
    <p className="text-[14px] font-semibold text-white mt-6 mb-2">{title}</p>
  );
}

export function LNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[14px] px-5 py-4 mt-2"
      style={{ background: "#111112", border: "1px solid #1e1e1e" }}
    >
      <p className="text-[13px] leading-[1.7]" style={{ color: "#5a5a5a" }}>
        {children}
      </p>
    </div>
  );
}

/* ── Layout ───────────────────────────────────────────────────────────── */

export function LegalLayout({
  badge,
  title,
  lastUpdated,
  children,
}: {
  badge: string;
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full flex flex-col bg-black text-white">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(30,60,180,0.07) 0%, transparent 70%)",
        }}
      />

      <LandingNav />

      <div className="relative z-10 w-full flex-1 pt-32 pb-24 px-5">
        <div className="max-w-[760px] mx-auto">

          {/* Header */}
          <div className="mb-12">
            <div
              className="inline-flex w-fit rounded-full p-[1px] mb-5"
              style={{ background: "linear-gradient(135deg, #1a1a1a, #2e2e2e)" }}
            >
              <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-[#111113]">
                <span className="text-[#3064FF] text-[13px] font-medium">{badge}</span>
              </div>
            </div>

            <h1
              className="font-bold text-white tracking-tight mb-3"
              style={{ fontSize: "clamp(28px, 4vw, 44px)", lineHeight: 1.1 }}
            >
              {title}
            </h1>

            <p className="text-[13px]" style={{ color: "#3a3a3a" }}>
              Last updated: {lastUpdated}
            </p>
          </div>

          {/* Body */}
          <div>{children}</div>

        </div>
      </div>

      <Footer />
    </div>
  );
}
