import { describe, it, expect } from "vitest";
import { isOwnedBlobUrl } from "../ownership";

describe("isOwnedBlobUrl", () => {
  it("accepts a URL on the blob host, under the correct folder and user id", () => {
    const result = isOwnedBlobUrl(
      "https://example.blob.vercel-storage.com/voice-notes/user1/123.webm",
      "user1",
      "voice-notes"
    );
    expect(result).toBe(true);
  });

  it("rejects a URL on a different (non-blob-storage) host", () => {
    const result = isOwnedBlobUrl("https://attacker.example/collect", "user1", "voice-notes");
    expect(result).toBe(false);
  });

  it("rejects a URL under a different user's folder", () => {
    const result = isOwnedBlobUrl(
      "https://example.blob.vercel-storage.com/voice-notes/other-user/123.webm",
      "user1",
      "voice-notes"
    );
    expect(result).toBe(false);
  });

  it("rejects a URL under the wrong top-level folder", () => {
    const result = isOwnedBlobUrl(
      "https://example.blob.vercel-storage.com/photos/user1/123.jpg",
      "user1",
      "voice-notes"
    );
    expect(result).toBe(false);
  });

  it("rejects a malformed URL instead of throwing", () => {
    const result = isOwnedBlobUrl("not-a-url", "user1", "voice-notes");
    expect(result).toBe(false);
  });

  it("accepts a URL under a different folder when that folder is what's asked for (e.g. variations)", () => {
    const result = isOwnedBlobUrl(
      "https://example.blob.vercel-storage.com/variations/user1/123.jpg",
      "user1",
      "variations"
    );
    expect(result).toBe(true);
  });
});
