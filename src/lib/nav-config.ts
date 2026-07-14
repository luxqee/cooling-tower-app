import {
  LayoutDashboard,
  Briefcase,
  Clock,
  FileEdit,
  Calendar,
  Users,
  ShieldCheck,
  FileText,
  Settings,
  BarChart2,
  Receipt,
  Building2,
  type LucideIcon,
} from "lucide-react";
import { PAGE_ACCESS, type UserRole } from "./permissions";

export type { UserRole };

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  // Which roles can see this nav item. Sourced from permissions.ts wherever
  // a page has its own single-source-of-truth requireRole() check for the
  // same access boundary — see that file for which sections aren't covered.
  visibleTo: readonly UserRole[];
  // Shown in the desktop sidebar's hover-expand panel (NavLinks.tsx) for
  // sections with a real "create" action. Omit for sections with nothing
  // to quick-create (Dashboard, Time tracking, Settings, etc.).
  quickAction?: { label: string; href: string };
}

export const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    description: "Live overview of jobs, crew, and pending approvals",
    visibleTo: ["director", "service_manager", "admin"],
  },
  {
    label: "Jobs",
    href: "/jobs",
    icon: Briefcase,
    description: "Active jobs with hours logged vs quoted",
    visibleTo: PAGE_ACCESS.jobs,
    quickAction: { label: "+ Add Job", href: "/jobs?new=1" },
  },
  {
    label: "Time tracking",
    href: "/time-tracking",
    icon: Clock,
    description: "Clock-in records and live crew status",
    visibleTo: PAGE_ACCESS.timeTracking,
  },
  {
    label: "Variations",
    href: "/variations",
    icon: FileEdit,
    description: "Pending approvals and approved variation history",
    visibleTo: PAGE_ACCESS.variations,
  },
  {
    label: "Log Variation",
    href: "/variations/submit",
    icon: FileEdit,
    description: "Submit extra work found on site",
    visibleTo: PAGE_ACCESS.variationsSubmit,
  },
  {
    label: "Schedule",
    href: "/schedule",
    icon: Calendar,
    description: "Crew assignments and breakdown response",
    visibleTo: ["service_manager", "director", "admin", "technician"],
    quickAction: { label: "+ Assign Job", href: "/schedule" },
  },
  {
    label: "Team",
    href: "/team",
    icon: Users,
    description: "Technicians, roles, and assignments",
    visibleTo: PAGE_ACCESS.team,
  },
  {
    label: "Compliance",
    href: "/compliance",
    icon: ShieldCheck,
    description: "SWMS, JSA, and WHS compliance documents",
    visibleTo: PAGE_ACCESS.compliance,
    quickAction: { label: "+ New Document", href: "/compliance/new" },
  },
  {
    label: "Templates",
    href: "/compliance/templates",
    icon: FileText,
    description: "Manage compliance document templates",
    visibleTo: PAGE_ACCESS.complianceTemplates,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    description: "Business profile and system settings",
    visibleTo: PAGE_ACCESS.settings,
  },
  {
    label: "Quotes",
    href: "/quotes",
    icon: BarChart2,
    description: "Historical job data for quoting",
    visibleTo: PAGE_ACCESS.quotes,
    quickAction: { label: "+ New Quote", href: "/quotes?new=1" },
  },
  {
    label: "Invoices",
    href: "/invoices",
    icon: Receipt,
    description: "Invoice management and sending",
    visibleTo: PAGE_ACCESS.invoices,
  },
  {
    label: "Customers",
    href: "/customers",
    icon: Building2,
    description: "Customer contacts and linked jobs",
    visibleTo: PAGE_ACCESS.customers,
    quickAction: { label: "+ New Customer", href: "/customers/new" },
  },
];
