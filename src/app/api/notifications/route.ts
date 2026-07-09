import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [notifications, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.notification.count({ where: { userId: user.id, read: false } }),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}
