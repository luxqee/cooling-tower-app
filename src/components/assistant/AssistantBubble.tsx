"use client";

import { usePathname } from "next/navigation";
import { ChatWidget } from "@/components/assistant/ChatWidget";

// The /dashboard page renders its own inline ChatWidget for admin/director/
// service_manager roles, so the floating bubble would duplicate it. Suppress
// the bubble there; show it everywhere else for assistant-enabled roles.
export function AssistantBubble() {
  const pathname = usePathname();
  if (pathname === "/dashboard") return null;
  return <ChatWidget />;
}
