import { getSessionUser } from "@/lib/auth/clerk";
import { BottomTabBarClient } from "./BottomTabBarClient";

// Bottom tab bar shown only for technician role on mobile.
// Admin/director/service_manager have more nav items and use the hamburger drawer.
const TECHNICIAN_HREFS = ["/time-tracking", "/compliance", "/variations/submit"];

export async function BottomTabBar() {
  const user = await getSessionUser();
  if (!user || user.role !== "technician") return null;

  // Pass only serialisable strings across the Server→Client boundary.
  // BottomTabBarClient looks up labels and icons from navItems on the client side.
  return <BottomTabBarClient hrefs={TECHNICIAN_HREFS} />;
}
