import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import type { UserRole } from "@/lib/nav-config";

export interface SessionUser {
  id: string;
  clerkId: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    clerkId: user.clerkId,
    name: user.name,
    email: user.email,
    role: user.role as UserRole,
    isActive: user.isActive,
  };
}

export async function requireRole(allowedRoles: UserRole[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Unauthorized");
  if (!allowedRoles.includes(user.role)) throw new Error("Forbidden");
  return user;
}
