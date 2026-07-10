import { headers } from "next/headers";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { Webhook } from "svix";
import { db } from "@/lib/db/client";
import { ALL_ROLES, type UserRole } from "@/lib/permissions";

const VALID_ROLES = ALL_ROLES;

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

    // Avoid a unique-email constraint violation when a second OAuth provider
    // (e.g. GitHub) creates a new Clerk user with the same email as an existing
    // record. Find by clerkId first; fall back to email; then create.
    const byClerkId = await db.user.findUnique({ where: { clerkId: id } });
    if (byClerkId) {
      await db.user.update({ where: { id: byClerkId.id }, data: { name, email, role, phone } });
    } else {
      const byEmail = await db.user.findUnique({ where: { email } });
      if (byEmail) {
        await db.user.update({ where: { id: byEmail.id }, data: { clerkId: id, name, role, phone } });
      } else {
        await db.user.create({ data: { clerkId: id, name, email, role, phone, isActive: true } });
      }
    }
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
