import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";

export async function POST(req: Request) {
  const user = await requireRole(["technician"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large after compression. Maximum 5 MB." }, { status: 413 });
  }

  const filename = `variations/${user.id}/${Date.now()}.jpg`;

  try {
    const blob = await put(filename, file, { access: "public" });
    return NextResponse.json({ url: blob.url }, { status: 201 });
  } catch (err) {
    console.error("Blob upload error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
