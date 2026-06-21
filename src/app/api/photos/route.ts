import { getSessionUser } from "@/lib/auth/clerk";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const blobUrl = searchParams.get("url");
  if (!blobUrl) return new Response("Missing url", { status: 400 });

  // Verify it's a Vercel Blob URL to prevent open-proxy abuse
  if (!blobUrl.includes(".blob.vercel-storage.com")) {
    return new Response("Invalid url", { status: 400 });
  }

  const res = await fetch(blobUrl, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  });

  if (!res.ok) return new Response("Not found", { status: 404 });

  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
