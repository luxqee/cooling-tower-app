import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";

const ALLOWED_TYPES = ["audio/webm", "audio/mp4", "audio/wav", "audio/mpeg", "audio/ogg"];
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request) {
  const user = await requireRole(["technician"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Browsers report MediaRecorder's negotiated MIME type with codec
  // parameters attached (e.g. "audio/webm;codecs=opus"), not the bare
  // type — strip them before validating/deriving a file extension.
  const baseType = file.type.split(";")[0]?.trim() ?? file.type;

  if (!ALLOWED_TYPES.includes(baseType)) {
    return NextResponse.json(
      { error: "Unsupported format. Record using your device's default microphone format." },
      { status: 422 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Recording too large. Maximum 25 MB (roughly 30 minutes)." }, { status: 413 });
  }

  const extension = baseType.split("/")[1] ?? "webm";
  const filename = `voice-notes/${user.id}/${Date.now()}.${extension}`;

  try {
    const blob = await put(filename, file, { access: "private" });
    return NextResponse.json({ url: blob.url }, { status: 201 });
  } catch (err) {
    console.error("Blob upload error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
