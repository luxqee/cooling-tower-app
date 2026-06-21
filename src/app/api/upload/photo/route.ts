import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";

export async function POST(req: Request) {
  const user = await requireRole(["technician"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as HandleUploadBody;

  try {
    const response = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/heic",
          "image/heif",
        ],
        maximumSizeInBytes: 10 * 1024 * 1024,
      }),
      onUploadCompleted: async () => {
        // no-op — URL is stored on the variation record
      },
    });
    return NextResponse.json(response);
  } catch (err) {
    console.error("Blob upload error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
