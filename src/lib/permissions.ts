// The full set of valid roles — for validating role input (team invites,
// the Clerk webhook, role-edit forms), NOT for "who can see this section"
// (that's PAGE_ACCESS below). A literal tuple (not just `readonly
// UserRole[]`) so it can be passed directly to z.enum().
export const ALL_ROLES = [
  "technician",
  "director",
  "service_manager",
  "admin",
  "sales_engineer",
] as const;

export type UserRole = (typeof ALL_ROLES)[number];

// Single source of truth for "which roles can see this whole section of the
// app" — both the sidebar (nav-config.ts) and each section's own page-level
// requireRole() check read from here, so they can't silently drift apart
// (previously the same role list was hand-copied in multiple places, e.g.
// the compliance role array was duplicated verbatim across 4 files).
//
// Scope: page-level "can you see this section at all" access only. Individual
// API routes still have their own finer-grained checks for specific actions
// within a section (e.g. only director/admin can delete a job, even though
// more roles can view the jobs list) — those aren't 1:1 with a nav item and
// aren't centralized here.
// Typed as `Record<string, readonly UserRole[]>` (not `as const`) so every
// entry's element type stays the general UserRole union — otherwise
// TypeScript infers each array as a tuple of its literal values (e.g.
// `readonly ["admin"]`), and `.includes(user.role)` on that narrow tuple
// only accepts the literal "admin", not any UserRole, breaking every
// `PAGE_ACCESS.x.includes(...)` call site.
export const PAGE_ACCESS: Record<string, readonly UserRole[]> = {
  jobs: ["director", "service_manager", "admin", "sales_engineer"],
  timeTracking: ["director", "service_manager", "technician"],
  variations: ["director", "admin"],
  variationsSubmit: ["technician"],
  team: ["director", "service_manager"],
  compliance: ["technician", "director", "service_manager", "admin", "sales_engineer"],
  complianceTemplates: ["admin"],
  settings: ["director", "admin"],
  quotes: ["sales_engineer", "director", "admin"],
  invoices: ["admin", "director"],
  customers: ["admin", "director", "sales_engineer"],
  monitoring: ["director", "admin"],
};
