"use client";

import { useState, useEffect } from "react";

const NAV_LINKS = [
  { label: "Product",  href: "/#features"  },
  { label: "Pricing",  href: "/pricing"    },
  { label: "Blog",     href: "/blog"       },
  { label: "About",    href: "/about"      },
  { label: "Contact",  href: "/contact"    },
];

const DESKTOP = { closedW: 115, closedH: 44, openW: 300, openH: 430, linkSize: 38 };
const MOBILE  = { closedW:  92, closedH: 36, openW: 260, openH: 360, linkSize: 30 };

const OPEN_R = 28;

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const { closedW, closedH, openW, openH, linkSize } = isMobile ? MOBILE : DESKTOP;
  const closedR = closedH / 2;

  // Keep button vertically centred with the logo (nav h-16 = 64px → centre at 32px)
  const buttonTop = 32 - closedH / 2;

  return (
    <>
      {/* ── Navbar — logo only ──────────────────────────────────────
          Max-width wrapper matches every other section on the page.
          pointer-events-none so backdrop clicks fall through;
          logo gets pointer-events-auto individually.               */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-black pointer-events-none">
        <div className="max-w-[1200px] mx-auto px-5 h-16 flex items-center">
          <a href="/" style={{ pointerEvents: "auto" }}>
            <img
              src="/logo.svg"
              alt="Interlock"
              width={110}
              height={22}
              style={{ display: "block" }}
            />
          </a>
        </div>
      </nav>

      {/* ── Backdrop — closes menu on outside click ─────────────── */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-[45] transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* ── Morphing pill → panel ────────────────────────────────────
          Right edge mirrors the max-w-[1200px] + px-5 container:
          - below 1200px → 20px from viewport edge (same as px-5)
          - above 1200px → (viewport−1200)/2 + 20px (aligns with content) */}
      <div
        className="fixed z-[60] overflow-hidden"
        style={{
          top: buttonTop,
          right: "max(20px, calc((100vw - 1200px) / 2 + 20px))",
          width: open ? openW : closedW,
          maxWidth: "calc(100vw - 40px)",
          height: open ? openH : closedH,
          borderRadius: open ? OPEN_R : closedR,
          background: open ? "#3064FF" : "#ffffff",
          transition: [
            "width 420ms cubic-bezier(0.4,0,0.2,1)",
            "height 420ms cubic-bezier(0.4,0,0.2,1)",
            "border-radius 420ms cubic-bezier(0.4,0,0.2,1)",
            "background-color 300ms ease",
          ].join(", "),
        }}
      >
        {/* ── Closed face: "≡ menu" ─────────────────────────────── */}
        <button
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          className="absolute inset-0 flex items-center justify-center gap-2.5
                     text-black text-sm font-medium select-none"
          style={{
            opacity: open ? 0 : 1,
            transition: "opacity 120ms ease",
            pointerEvents: open ? "none" : "auto",
          }}
        >
          <svg width="15" height="9" viewBox="0 0 15 9" fill="none" aria-hidden="true">
            <rect width="15" height="1.5" rx="0.75" fill="black" />
            <rect y="7.5" width="15" height="1.5" rx="0.75" fill="black" />
          </svg>
          <span>menu</span>
        </button>

        {/* ── Open face: nav links ──────────────────────────────── */}
        <div
          className="absolute inset-0"
          style={{
            opacity: open ? 1 : 0,
            transition: `opacity 220ms ease ${open ? "180ms" : "0ms"}`,
            pointerEvents: open ? "auto" : "none",
          }}
        >
          <div className="flex justify-end px-6 pt-5 pb-1">
            <button
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 text-white/60 text-[13px] font-medium
                         hover:text-white transition-colors"
            >
              <span className="leading-none">—</span>
              <span>menu</span>
            </button>
          </div>

          <div className="flex flex-col items-center px-6 pt-4 pb-8">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-white font-semibold py-2.5 text-center w-full
                           hover:opacity-50 transition-opacity"
                style={{ fontSize: linkSize, lineHeight: 1.2 }}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
