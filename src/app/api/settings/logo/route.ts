import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export async function POST(req: Request) {
  try { await requireRole(["director", "admin"]); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try { formData = await req.formData(); } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported format. Use PNG, JPG, or WebP." }, { status: 422 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 2 MB)" }, { status: 422 });
  }

  const existing = await db.businessProfile.findFirst();
  if (existing?.logoUrl) {
    try { await del(existing.logoUrl); } catch { /* already gone */ }
  }

  const ext = file.type.split("/")[1];
  const blob = await put(`business/logo-${Date.now()}.${ext}`, file, {
    access: "public",
    contentType: file.type,
  });

  const profile = existing
    ? await db.businessProfile.update({ where: { id: existing.id }, data: { logoUrl: blob.url } })
    : await db.businessProfile.create({ data: { name: "Your Business", abn: "", phone: "", email: "", address: "", logoUrl: blob.url } });

  return NextResponse.json({ logoUrl: profile.logoUrl });
}

export async function DELETE() {
  try { await requireRole(["director", "admin"]); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await db.businessProfile.findFirst();
  if (existing?.logoUrl) {
    try { await del(existing.logoUrl); } catch { /* already gone */ }
    await db.businessProfile.update({ where: { id: existing.id }, data: { logoUrl: null } });
  }

  return NextResponse.json({ success: true });
}
