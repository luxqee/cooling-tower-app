/**
 * AUTHENTICATION MODULE — PLACEHOLDER
 *
 * This file defines the shape of the auth layer that will be built in Phase 1a.
 * Nothing is implemented yet. See docs for the recommended approach.
 *
 * Planned approach: Auth.js (NextAuth) with credentials provider + database sessions
 * Roles: technician, director, service_manager, admin, sales_engineer, draftsman
 */

import type { UserRole } from "@/lib/nav-config";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}

export interface Session {
  user: SessionUser;
  expires: string;
}

// Placeholder — to be implemented in Phase 1a
export async function getSession(): Promise<Session | null> {
  return null;
}

// Placeholder — to be implemented in Phase 1a
export async function requireRole(_allowedRoles: UserRole[]): Promise<SessionUser> {
  throw new Error("Auth not yet implemented");
}
