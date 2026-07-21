import { LandingNav } from "./LandingNav";
import { Footer } from "./Footer";

interface BlogLayoutProps {
  category: string;
  title: string;
  readTime: string;
  date: string;
  children: React.ReactNode;
}

export function BlogLayout({ category, title, readTime, date, children }: BlogLayoutProps) {
  return (
    <div className="min-h-full flex flex-col bg-black text-white">
      {/* Radial glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(30, 60, 180, 0.07) 0%, transparent 70%)",
        }}
      />

      <LandingNav />

      <article className="relative z-10 w-full flex-1 pt-32 pb-24 px-5">
        <div className="max-w-[760px] mx-auto">

          {/* Category badge */}
          <div className="inline-flex w-fit rounded-full p-[1px] mb-6"
            style={{ background: "linear-gradient(135deg, #1a1a1a, #2e2e2e)" }}>
            <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-[#111113]">
              <span className="text-[#3064FF] text-[13px] font-medium">{category}</span>
            </div>
          </div>

          {/* Title */}
          <h1
            className="font-semibold text-white tracking-tight"
            style={{ fontSize: "clamp(28px, 3.8vw, 48px)", lineHeight: 1.12 }}
          >
            {title}
          </h1>

          {/* Meta */}
          <div className="flex items-center gap-3 mt-5">
            <span className="text-[13px]" style={{ color: "#808080" }}>{readTime}</span>
            <span style={{ color: "#3064FF", fontSize: 5 }}>●</span>
            <span className="text-[13px]" style={{ color: "#808080" }}>{date}</span>
          </div>

          {/* Divider */}
          <div className="mt-8 mb-10" style={{ borderTop: "1px solid #1a1a1a" }} />

          {/* Body */}
          <div className="blog-body">
            {children}
          </div>

        </div>
      </article>

      <Footer />
    </div>
  );
}
