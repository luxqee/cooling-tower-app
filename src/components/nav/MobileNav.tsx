import { getSessionUser } from "@/lib/auth/clerk";
import { navItems } from "@/lib/nav-config";
import { MobileNavClient } from "./MobileNavClient";

export async function MobileNav() {
  const user = await getSessionUser();
  const visibleHrefs = user
    ? navItems
        .filter((item) => item.visibleTo.includes(user.role))
        .map((item) => item.href)
    : [];

  return (
    <MobileNavClient
      visibleHrefs={visibleHrefs}
      user={user ? { name: user.name, role: user.role } : null}
    />
  );
}
