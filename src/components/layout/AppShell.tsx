import { Sidebar } from "@/components/nav/Sidebar";
import { MobileNav } from "@/components/nav/MobileNav";
import { BottomTabBar } from "@/components/nav/BottomTabBar";
import { TopBar } from "@/components/nav/TopBar";
import { getSessionUser } from "@/lib/auth/clerk";
import { ChatWidget } from "@/components/assistant/ChatWidget";

const ASSISTANT_ROLES = ["director", "service_manager", "admin", "sales_engineer"];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const hasTabs = user?.role === "technician";
  const showAssistant = !!user && ASSISTANT_ROLES.includes(user.role);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <MobileNav />
      <BottomTabBar />
      <div className="lg:pl-64">
        <TopBar />
        {/* Extra bottom padding on mobile so content clears the bottom tab bar */}
        <main className={`px-4 py-6 lg:px-8 lg:py-8 ${hasTabs ? "pb-20 lg:pb-8" : ""}`}>
          {children}
        </main>
      </div>
      {showAssistant && <ChatWidget />}
    </div>
  );
}
