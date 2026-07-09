import { getSessionUser } from "@/lib/auth/clerk";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const blobUrl = searchParams.get("url");
  if (!blobUrl) return new Response("Missing url", { status: 400 });

  // Parse URL and validate hostname — prevents SSRF via substring bypass
  let parsed: URL;
  try {
    parsed = new URL(blobUrl);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }
  if (!parsed.hostname.endsWith(".blob.vercel-storage.com")) {
    return new Response("Invalid url", { status: 400 });
  }

  // Forward the browser's Range header so <video>/<audio> elements can seek —
  // without this, playback fails for larger recordings that need partial fetches.
  const range = req.headers.get("range");

  const res = await fetch(blobUrl, {
    headers: {
      Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
      ...(range ? { Range: range } : {}),
    },
  });

  if (!res.ok && res.status !== 206) return new Response("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream",
    "Cache-Control": "private, max-age=3600",
    "Accept-Ranges": "bytes",
  };
  const contentRange = res.headers.get("Content-Range");
  const contentLength = res.headers.get("Content-Length");
  if (contentRange) headers["Content-Range"] = contentRange;
  if (contentLength) headers["Content-Length"] = contentLength;

  return new Response(res.body, { status: res.status, headers });
}
