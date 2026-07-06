import { getSessionUser } from "@/lib/auth/clerk";
import { navItems } from "@/lib/nav-config";
import { BottomTabBarClient } from "./BottomTabBarClient";

// Bottom tab bar shown only for technician role on mobile.
// Admin/director/service_manager have more nav items and use the hamburger drawer.
const TECHNICIAN_HREFS = ["/time-tracking", "/compliance", "/variations/submit"];

export async function BottomTabBar() {
  const user = await getSessionUser();
  if (!user || user.role !== "technician") return null;

  const tabs = TECHNICIAN_HREFS.flatMap((href) => {
    const item = navItems.find((n) => n.href === href);
    if (!item) return [];
    return [{ href: item.href, label: item.label, Icon: item.icon }];
  });

  return <BottomTabBarClient tabs={tabs} />;
}
