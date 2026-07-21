// Landing-page CTA — goes straight to the dashboard.
//
// Google auth is disabled for now (see proxy.ts): every marketing CTA
// (hero, mid-section, bottom CTA) uses this component, and now just links
// to /dashboard directly instead of kicking off the OAuth round-trip.

import Link from "next/link";

type Size = "sm" | "md";

export function RequestAccessButton({ size = "md" }: { size?: Size }) {
  const padding =
    size === "sm"
      ? "pt-[6px] pb-[6px] pl-[14px] pr-[3px] sm:pt-[9px] sm:pb-[9px] sm:pl-5 sm:pr-[3px]"
      : "pt-[6px] pb-[6px] pl-4 pr-[2px] sm:pt-[9px] sm:pb-[9px] sm:pl-5 sm:pr-[3px]";

  return (
    <Link
      href="/dashboard"
      className={`group relative inline-flex items-center gap-2 sm:gap-3 rounded-full overflow-hidden ${padding}`}
      style={{ background: "#3064FF", border: "2px solid #3064FF" }}
    >
      <span
        className="absolute right-[2px] sm:right-[3px] top-1/2 -translate-y-1/2
                   w-[26px] h-[26px] sm:w-[32px] sm:h-[32px]
                   rounded-full bg-black scale-0 group-hover:scale-[14]
                   transition-transform duration-500 ease-in-out"
        aria-hidden="true"
      />
      <span className="relative z-10 text-white font-semibold text-[13px] sm:text-[14px]">
        Open Dashboard
      </span>
      <span className="relative z-10 w-[26px] h-[26px] sm:w-[32px] sm:h-[32px] rounded-full flex items-center justify-center shrink-0 bg-black">
        <svg
          className="transition-transform duration-500 group-hover:-rotate-45"
          width="9"
          height="9"
          viewBox="0 0 11 11"
          fill="none"
        >
          <path
            d="M2 5.5h7M5.5 2 9 5.5 5.5 9"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </Link>
  );
}
