import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadAudioToAssemblyAI, submitTranscription, fetchTranscript } from "../assemblyai";

const originalFetch = global.fetch;
const originalKey = process.env.ASSEMBLYAI_API_KEY;

beforeEach(() => {
  process.env.ASSEMBLYAI_API_KEY = "test-key-123";
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.ASSEMBLYAI_API_KEY = originalKey;
  vi.restoreAllMocks();
});

describe("uploadAudioToAssemblyAI", () => {
  it("posts the raw buffer with the correct auth header and returns upload_url", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ upload_url: "https://cdn.assemblyai.com/upload/abc123" }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const result = await uploadAudioToAssemblyAI(Buffer.from("fake audio bytes"));

    expect(result).toBe("https://cdn.assemblyai.com/upload/abc123");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.assemblyai.com/v2/upload",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "test-key-123" }),
      })
    );
  });

  it("throws when the upload request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    await expect(uploadAudioToAssemblyAI(Buffer.from("x"))).rejects.toThrow("500");
  });
});

describe("submitTranscription", () => {
  it("submits with webhook fields and returns the transcript id", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "transcript-abc", status: "processing" }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const result = await submitTranscription(
      "https://cdn.assemblyai.com/upload/abc123",
      "https://example.com/webhook",
      "shared-secret"
    );

    expect(result).toEqual({ id: "transcript-abc" });
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      audio_url: "https://cdn.assemblyai.com/upload/abc123",
      webhook_url: "https://example.com/webhook",
      webhook_auth_header_name: "x-webhook-secret",
      webhook_auth_header_value: "shared-secret",
    });
  });

  it("throws when submission fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 422 }) as unknown as typeof fetch;
    await expect(submitTranscription("url", "webhook", "secret")).rejects.toThrow("422");
  });
});

describe("fetchTranscript", () => {
  it("returns the parsed status/text/error fields", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "completed", text: "hello world", error: null }),
    }) as unknown as typeof fetch;

    const result = await fetchTranscript("transcript-abc");

    expect(result).toEqual({ status: "completed", text: "hello world", error: null });
  });

  it("throws when the fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;
    await expect(fetchTranscript("missing-id")).rejects.toThrow("404");
  });
});
