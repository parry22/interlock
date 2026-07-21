"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DashboardSquareIcon,
  WorkflowCircleIcon,
  LegalDocumentIcon,
  BankIcon,
  TrendingUpDownIcon,
  UserGroupIcon,
  DeveloperIcon,
  SettingsIcon,
  CancelIcon,
  StoreIcon,
} from "@hugeicons/core-free-icons";

import { SidebarUserChip } from "@/components/SidebarUserChip";

type IconType = React.ComponentProps<typeof HugeiconsIcon>["icon"];

type NavItem = {
  name: string;
  icon: IconType;
  href: string;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    label: "Marketplace",
    items: [
      { name: "Hire an agent", icon: StoreIcon, href: "/marketplace" },
      { name: "Browse agents", icon: UserGroupIcon, href: "/agents" },
    ],
  },
  {
    label: "Operate",
    items: [
      { name: "Overview", icon: DashboardSquareIcon, href: "/dashboard" },
      { name: "Workflows", icon: WorkflowCircleIcon, href: "/workflows" },
      { name: "Quotes", icon: LegalDocumentIcon, href: "/quotes" },
      { name: "Payouts", icon: BankIcon, href: "/settlement" },
    ],
  },
  {
    label: "Analyse",
    items: [
      { name: "Margin", icon: TrendingUpDownIcon, href: "/margin" },
      // Pricing Intel hidden until Phase 2 — needs cross-tenant pricing
      // benchmarks that don't exist at hackathon scale. The page still works
      // at /pricing-intel and renders a Coming Soon placeholder.
      { name: "Customers", icon: UserGroupIcon, href: "/customers" },
    ],
  },
  {
    label: "Configure",
    items: [
      { name: "Developer", icon: DeveloperIcon, href: "/developer" },
      { name: "Settings", icon: SettingsIcon, href: "/settings" },
    ],
  },
];


export function Sidebar({
  mobileOpen = false,
  onMobileClose,
}: {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const pathname = usePathname();
  return (
    <aside
      className={`flex flex-col bg-[#070707] shrink-0
        fixed inset-y-0 left-0 z-60 w-65 transition-transform duration-300
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        md:static md:w-43.75 md:translate-x-0 md:min-h-screen`}
    >
      {/* Logo + mobile close */}
      <div className="flex items-center justify-between px-4 pt-5 pb-6">
        <div className="flex items-center">
          <img src="/logo.svg" alt="Interlock" width={100} height={21} style={{ display: "block" }} />
        </div>
        <button
          onClick={onMobileClose}
          className="md:hidden text-[#4d4d4d] hover:text-[#a3a3a3] transition-colors p-1 -mr-1"
        >
          <HugeiconsIcon icon={CancelIcon} size={18} color="currentColor" strokeWidth={1.5} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-5 flex-1 px-2.5">
        {navSections.map((section) => (
          <div key={section.label} className="flex flex-col gap-0.5">
            <p className="text-[#4d4d4d] text-[13px] font-medium px-2 mb-1">
              {section.label}
            </p>
            {section.items.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-2 px-2 py-3 md:py-1.75 rounded-[20px] text-[14px] w-full transition-colors ${
                  pathname === item.href
                    ? "bg-[#0d1e3d] text-[#3064FF]"
                    : "text-[#6b6b6b] hover:text-[#a3a3a3] hover:bg-[#141414]"
                }`}
              >
                <HugeiconsIcon
                  icon={item.icon}
                  size={16}
                  color="currentColor"
                  strokeWidth={1.5}
                />
                <span className="font-medium">{item.name}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {/* Bottom user section — session-driven */}
      <div className="mx-2.5 border-t border-dashed border-[#272727] mb-1" />
      <SidebarUserChip />
    </aside>
  );
}
