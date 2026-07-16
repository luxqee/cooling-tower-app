import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const limitMock = vi.fn();

vi.mock("@upstash/redis", () => ({ Redis: vi.fn() }));
vi.mock("@upstash/ratelimit", () => {
  function Ratelimit(this: { limit: typeof limitMock }) {
    this.limit = limitMock;
  }
  Ratelimit.slidingWindow = vi.fn();
  return { Ratelimit };
});

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("checkRateLimit", () => {
  it("always returns true with no Upstash env vars set (inert by default)", async () => {
    const { checkRateLimit } = await import("../rateLimit");
    expect(await checkRateLimit("some-key")).toBe(true);
    expect(await checkRateLimit("some-key")).toBe(true);
    expect(limitMock).not.toHaveBeenCalled();
  });

  it("stays inert if only one of the two env vars is set", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    const { checkRateLimit } = await import("../rateLimit");
    expect(await checkRateLimit("some-key")).toBe(true);
    expect(limitMock).not.toHaveBeenCalled();
  });

  it("delegates to the Upstash limiter once both env vars are set", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    limitMock.mockResolvedValue({ success: false });

    const { checkRateLimit } = await import("../rateLimit");
    expect(await checkRateLimit("some-key")).toBe(false);
    expect(limitMock).toHaveBeenCalledWith("some-key");
  });
});
