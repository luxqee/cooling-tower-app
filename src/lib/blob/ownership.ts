// Prevents SSRF via substring bypass and ensures a caller can only reference
// blobs stored under their own folder — a server route that fetches a
// caller-supplied URL with BLOB_READ_WRITE_TOKEN attached would otherwise
// leak that credential (and other users' private files) to any URL a
// malicious request supplies.
export function isOwnedBlobUrl(url: string, userId: string, folder: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!parsed.hostname.endsWith(".blob.vercel-storage.com")) return false;
  if (!parsed.pathname.startsWith(`/${folder}/${userId}/`)) return false;
  return true;
}
