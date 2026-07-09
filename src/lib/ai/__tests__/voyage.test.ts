import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { embedText } from "../voyage";

const originalFetch = global.fetch;
const originalKey = process.env.VOYAGE_API_KEY;

beforeEach(() => {
  process.env.VOYAGE_API_KEY = "test-key-123";
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.VOYAGE_API_KEY = originalKey;
  vi.restoreAllMocks();
});

describe("embedText", () => {
  it("posts the text with the correct auth header and model, returns the embedding array", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: Array(1024).fill(0.1) }] }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const result = await embedText("Replaced fan belt on Tower 3");

    expect(result).toHaveLength(1024);
    expect(result[0]).toBe(0.1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.voyageai.com/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key-123" }),
      })
    );
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toEqual({ input: ["Replaced fan belt on Tower 3"], model: "voyage-3.5" });
  });

  it("throws when the request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    await expect(embedText("x")).rejects.toThrow("500");
  });
});
