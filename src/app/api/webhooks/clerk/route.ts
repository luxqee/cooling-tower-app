import { headers } from "next/headers";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { Webhook } from "svix";
import { db } from "@/lib/db/client";
import type { UserRole } from "@/lib/nav-config";

const VALID_ROLES: UserRole[] = [
  "technician", "director", "service_manager", "admin", "sales_engineer", "draftsman",
];

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return new Response("No webhook secret configured", { status: 500 });

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const payload = await req.text();
  const wh = new Webhook(secret);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch {
    return new Response("Invalid webhook signature", { status: 400 });
  }

  if (evt.type === "user.created" || evt.type === "user.updated") {
    const { id, first_name, last_name, email_addresses, public_metadata, phone_numbers } = evt.data;
    const email = email_addresses[0]?.email_address ?? "";
    const name = [first_name, last_name].filter(Boolean).join(" ") || email;
    const rawRole = public_metadata?.role as string | undefined;
    const role: UserRole = VALID_ROLES.includes(rawRole as UserRole)
      ? (rawRole as UserRole)
      : "technician";
    const phone = phone_numbers[0]?.phone_number ?? undefined;

    await db.user.upsert({
      where: { clerkId: id },
      update: { name, email, role, phone },
      create: { clerkId: id, name, email, role, phone, isActive: true },
    });
  }

  if (evt.type === "session.created") {
    const user = await db.user.findUnique({ where: { clerkId: evt.data.user_id } });
    if (user) {
      await db.authEvent.create({ data: { eventType: "login", userId: user.id } });
    }
  }

  if (evt.type === "session.ended" || evt.type === "session.removed") {
    const user = await db.user.findUnique({ where: { clerkId: evt.data.user_id } });
    if (user) {
      await db.authEvent.create({ data: { eventType: "logout", userId: user.id } });
    }
  }

  return new Response("OK", { status: 200 });
}
