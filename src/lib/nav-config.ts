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
  type LucideIcon,
} from "lucide-react";

export type UserRole =
  | "technician"
  | "director"
  | "service_manager"
  | "admin"
  | "sales_engineer"
  | "draftsman";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  // Which roles can see this nav item once auth is implemented
  visibleTo: UserRole[];
  // Build phase this feature is part of
  phase: "1a" | "1b" | "1c" | "2" | "2b" | "3";
}

export const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    description: "Live overview of jobs, crew, and pending approvals",
    visibleTo: ["director", "service_manager", "admin"],
    phase: "1a",
  },
  {
    label: "Jobs",
    href: "/jobs",
    icon: Briefcase,
    description: "Active jobs with hours logged vs quoted",
    visibleTo: ["director", "service_manager", "admin", "sales_engineer"],
    phase: "1b",
  },
  {
    label: "Time tracking",
    href: "/time-tracking",
    icon: Clock,
    description: "Clock-in records and live crew status",
    visibleTo: ["director", "service_manager", "admin", "technician"],
    phase: "1b",
  },
  {
    label: "Variations",
    href: "/variations",
    icon: FileEdit,
    description: "Pending approvals and approved variation history",
    visibleTo: ["director", "admin"],
    phase: "1c",
  },
  {
    label: "Log Variation",
    href: "/variations/submit",
    icon: FileEdit,
    description: "Submit extra work found on site",
    visibleTo: ["technician"],
    phase: "1c",
  },
  {
    label: "Schedule",
    href: "/schedule",
    icon: Calendar,
    description: "Crew assignments and breakdown response",
    visibleTo: ["service_manager", "director", "admin", "technician"],
    phase: "2",
  },
  {
    label: "Team",
    href: "/team",
    icon: Users,
    description: "Technicians, roles, and assignments",
    visibleTo: ["director", "service_manager"],
    phase: "1a",
  },
  {
    label: "Compliance",
    href: "/compliance",
    icon: ShieldCheck,
    description: "SWMS, JSA, and WHS compliance documents",
    visibleTo: ["technician", "director", "service_manager", "admin", "sales_engineer", "draftsman"],
    phase: "2",
  },
  {
    label: "Templates",
    href: "/compliance/templates",
    icon: FileText,
    description: "Manage compliance document templates",
    visibleTo: ["admin"],
    phase: "2",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    description: "Business profile and system settings",
    visibleTo: ["director", "admin"],
    phase: "2",
  },
  {
    label: "Quotes",
    href: "/quotes",
    icon: BarChart2,
    description: "Historical job data for quoting",
    visibleTo: ["sales_engineer", "director", "admin"],
    phase: "2b",
  },
  {
    label: "Invoices",
    href: "/invoices",
    icon: Receipt,
    description: "Invoice management and sending",
    visibleTo: ["admin", "director"],
    phase: "2",
  },
];
