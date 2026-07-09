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
    visibleTo: ["director", "service_manager", "admin", "sales_engineer"],
  },
  {
    label: "Time tracking",
    href: "/time-tracking",
    icon: Clock,
    description: "Clock-in records and live crew status",
    visibleTo: ["director", "service_manager", "admin", "technician"],
  },
  {
    label: "Variations",
    href: "/variations",
    icon: FileEdit,
    description: "Pending approvals and approved variation history",
    visibleTo: ["director", "admin"],
  },
  {
    label: "Log Variation",
    href: "/variations/submit",
    icon: FileEdit,
    description: "Submit extra work found on site",
    visibleTo: ["technician"],
  },
  {
    label: "Schedule",
    href: "/schedule",
    icon: Calendar,
    description: "Crew assignments and breakdown response",
    visibleTo: ["service_manager", "director", "admin", "technician"],
  },
  {
    label: "Team",
    href: "/team",
    icon: Users,
    description: "Technicians, roles, and assignments",
    visibleTo: ["director", "service_manager"],
  },
  {
    label: "Compliance",
    href: "/compliance",
    icon: ShieldCheck,
    description: "SWMS, JSA, and WHS compliance documents",
    visibleTo: ["technician", "director", "service_manager", "admin", "sales_engineer", "draftsman"],
  },
  {
    label: "Templates",
    href: "/compliance/templates",
    icon: FileText,
    description: "Manage compliance document templates",
    visibleTo: ["admin"],
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    description: "Business profile and system settings",
    visibleTo: ["director", "admin"],
  },
  {
    label: "Quotes",
    href: "/quotes",
    icon: BarChart2,
    description: "Historical job data for quoting",
    visibleTo: ["sales_engineer", "director", "admin"],
  },
  {
    label: "Invoices",
    href: "/invoices",
    icon: Receipt,
    description: "Invoice management and sending",
    visibleTo: ["admin", "director"],
  },
  {
    label: "Customers",
    href: "/customers",
    icon: Building2,
    description: "Customer contacts and linked jobs",
    visibleTo: ["admin", "director", "sales_engineer"],
  },
];
