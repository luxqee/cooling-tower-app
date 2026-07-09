import { db } from "@/lib/db/client";

interface NotificationPayload {
  title: string;
  body: string;
  url: string;
}

export async function notifyUsers(userIds: string[], payload: NotificationPayload): Promise<void> {
  if (userIds.length === 0) return;
  await db.notification.createMany({
    data: userIds.map((userId) => ({ userId, ...payload })),
  });
}
