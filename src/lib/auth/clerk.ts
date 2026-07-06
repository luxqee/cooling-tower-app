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
  try {
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
      const phone = clerkUser.phoneNumbers[0]?.phoneNumber ?? undefined;

      // If the email already exists under a different clerkId (e.g. user linked
      // GitHub to an existing email/password account), find and update that record
      // rather than creating a duplicate, which would throw a unique-email error.
      const existing = await db.user.findUnique({ where: { email } });
      if (existing) {
        user = await db.user.update({
          where: { id: existing.id },
          data: { clerkId: userId, name, phone },
        });
      } else {
        user = await db.user.create({
          data: { clerkId: userId, name, email, role, phone, isActive: true },
        });
      }
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
  } catch {
    return null;
  }
}

export async function requireRole(allowedRoles: UserRole[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Unauthorized");
  if (!allowedRoles.includes(user.role)) throw new Error("Forbidden");
  return user;
}
