import { auth, currentUser } from "@clerk/nextjs/server";
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

  let user = await db.user.findUnique({ where: { clerkId: userId } });

  if (!user) {
    // JIT provision: user authenticated in Clerk but not yet in DB
    // (webhook may have missed the creation event)
    const clerkUser = await currentUser();
    if (!clerkUser) return null;

    const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";
    const name =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
      email;
    const role = (clerkUser.publicMetadata?.role as UserRole) ?? "technician";
    const phone = clerkUser.phoneNumbers[0]?.phoneNumber ?? "";

    user = await db.user.upsert({
      where: { clerkId: userId },
      update: { name, email, role, phone },
      create: { clerkId: userId, name, email, role, phone, isActive: true },
    });
  }

  if (!user.isActive) return null;

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
