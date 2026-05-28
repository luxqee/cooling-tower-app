import {
  LayoutDashboard,
  Briefcase,
  Clock,
  FileEdit,
  Calendar,
  Users,
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
  phase: "1a" | "1b" | "1c" | "2" | "3";
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
    visibleTo: ["director", "service_manager", "admin"],
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
    label: "Schedule",
    href: "/schedule",
    icon: Calendar,
    description: "Crew assignments and breakdown response",
    visibleTo: ["service_manager", "director"],
    phase: "1b",
  },
  {
    label: "Team",
    href: "/team",
    icon: Users,
    description: "Technicians, roles, and assignments",
    visibleTo: ["director", "service_manager"],
    phase: "1a",
  },
];
