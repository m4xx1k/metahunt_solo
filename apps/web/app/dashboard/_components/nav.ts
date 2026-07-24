import {
  Activity,
  FileText,
  Gauge,
  Layers,
  LineChart,
  Receipt,
  Rss,
  Tags,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type NavGroup = {
  label?: string;
  items: NavItem[];
};

// The console's whole surface, in one list: every protected screen lives under
// /dashboard and appears here exactly once.
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ href: "/dashboard", label: "Overview", icon: Gauge }],
  },
  {
    label: "Product",
    items: [{ href: "/dashboard/analytics", label: "Analytics", icon: LineChart }],
  },
  {
    label: "Pipeline",
    items: [
      { href: "/dashboard/sources", label: "Sources", icon: Rss },
      { href: "/dashboard/runs", label: "Runs", icon: Activity },
      { href: "/dashboard/costs", label: "Costs", icon: Receipt },
    ],
  },
  {
    label: "Data",
    items: [
      { href: "/dashboard/vacancies", label: "Vacancies", icon: FileText },
      { href: "/dashboard/dedupe", label: "Dedupe", icon: Layers },
      { href: "/dashboard/taxonomy", label: "Taxonomy", icon: Tags },
    ],
  },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
