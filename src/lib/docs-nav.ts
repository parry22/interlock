export type NavItem = { label: string; href: string };
export type NavSection = { section: string; items: NavItem[] };

export const DOCS_NAV: NavSection[] = [
  {
    section: "Getting Started",
    items: [
      { label: "Introduction",    href: "/docs" },
      { label: "Quickstart",      href: "/docs/quickstart" },
      { label: "Authentication",  href: "/docs/authentication" },
    ],
  },
  {
    section: "Core Concepts",
    items: [
      { label: "Workflows",           href: "/docs/workflows" },
      { label: "Quotes & Pricing",    href: "/docs/quotes" },
      { label: "Success Criteria",    href: "/docs/success-criteria" },
      { label: "Settlement",          href: "/docs/settlement" },
    ],
  },
  {
    section: "Developer",
    items: [
      { label: "SDKs",       href: "/docs/sdks" },
      { label: "Webhooks",   href: "/docs/webhooks" },
    ],
  },
];
