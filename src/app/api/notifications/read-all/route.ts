import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await db.notification.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true },
  });

  return NextResponse.json({ ok: true });
}
