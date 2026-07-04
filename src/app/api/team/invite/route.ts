import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";

const ROLES = ["technician", "director", "service_manager", "admin", "sales_engineer", "draftsman"] as const;

const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(ROLES),
});

export async function POST(req: Request) {
  const user = await requireRole(["director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { email, role } = parsed.data;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://cooling-tower-app-alpha.vercel.app";

  const res = await fetch("https://api.clerk.com/v1/invitations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email_address: email,
      public_metadata: { role },
      redirect_url: `${appUrl}/dashboard`,
    }),
  });

  if (res.ok) return NextResponse.json({ ok: true }, { status: 201 });

  const data = await res.json().catch(() => ({}));
  const clerkError = data?.errors?.[0]?.code ?? "";

  if (clerkError === "duplicate_record" || clerkError === "invitation_already_pending") {
    return NextResponse.json({ error: "An invite has already been sent to this address" }, { status: 409 });
  }
  if (clerkError === "form_identifier_exists") {
    return NextResponse.json({ error: "This person already has an account — ask them to sign in" }, { status: 409 });
  }

  return NextResponse.json({ error: "Could not send invite. Please try again." }, { status: 500 });
}
