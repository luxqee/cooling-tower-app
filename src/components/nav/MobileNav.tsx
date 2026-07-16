import { getSessionUser } from "@/lib/auth/clerk";
import { navItems } from "@/lib/nav-config";
import { db } from "@/lib/db/client";
import { MobileNavClient } from "./MobileNavClient";

export async function MobileNav() {
  const [user, businessProfile] = await Promise.all([getSessionUser(), db.businessProfile.findFirst()]);
  const visibleHrefs = user
    ? navItems
        .filter((item) => item.visibleTo.includes(user.role))
        .map((item) => item.href)
    : [];

  return (
    <MobileNavClient
      visibleHrefs={visibleHrefs}
      user={user ? { name: user.name, role: user.role } : null}
      businessName={businessProfile?.name ?? "Your Business"}
    />
  );
}
