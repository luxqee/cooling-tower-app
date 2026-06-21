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

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large. Maximum 10 MB." }, { status: 413 });
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", ""];
  if (file.type && !allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Use JPEG, PNG, WebP or HEIC." },
      { status: 415 }
    );
  }

  const ext = file.type ? file.type.split("/")[1] : "jpg";
  const filename = `variations/${user.id}/${Date.now()}.${ext}`;

  try {
    const blob = await put(filename, file, { access: "public" });
    return NextResponse.json({ url: blob.url }, { status: 201 });
  } catch (err) {
    console.error("Blob upload error:", err);
    return NextResponse.json({ error: "Upload failed. Check BLOB_READ_WRITE_TOKEN is set." }, { status: 500 });
  }
}
