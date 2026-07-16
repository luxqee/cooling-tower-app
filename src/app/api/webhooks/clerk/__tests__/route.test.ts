import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const verifyMock = vi.fn();
const headersMock = vi.fn();

vi.mock("next/headers", () => ({ headers: () => headersMock() }));
vi.mock("svix", () => {
  function Webhook(this: { verify: typeof verifyMock }) {
    this.verify = verifyMock;
  }
  return { Webhook };
});
vi.mock("@/lib/db/client", () => ({
  db: {
    user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    authEvent: { create: vi.fn() },
  },
}));

import { db } from "@/lib/db/client";
import { POST } from "../route";

const VALID_HEADERS = new Map([
  ["svix-id", "msg_1"],
  ["svix-timestamp", "1720000000"],
  ["svix-signature", "v1,abc123"],
]);

function makeReq(body: unknown) {
  return new Request("http://localhost/api/webhooks/clerk", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const ORIGINAL_SECRET = process.env.CLERK_WEBHOOK_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CLERK_WEBHOOK_SECRET = "whsec_test";
  headersMock.mockReturnValue({ get: (key: string) => VALID_HEADERS.get(key) ?? null });
});

afterEach(() => {
  process.env.CLERK_WEBHOOK_SECRET = ORIGINAL_SECRET;
});

describe("POST /api/webhooks/clerk", () => {
  it("returns 500 when no webhook secret is configured", async () => {
    delete process.env.CLERK_WEBHOOK_SECRET;
    const res = await POST(makeReq({}));
    expect(res.status).toBe(500);
  });

  it("returns 400 when svix headers are missing", async () => {
    headersMock.mockReturnValue({ get: () => null });
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Missing svix headers");
  });

  it("returns 400 when the signature fails verification", async () => {
    verifyMock.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const res = await POST(makeReq({ type: "user.created", data: {} }));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Invalid webhook signature");
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("creates a new user on user.created when no existing record matches", async () => {
    verifyMock.mockReturnValue({
      type: "user.created",
      data: {
        id: "clerk_1",
        first_name: "Jane",
        last_name: "Doe",
        email_addresses: [{ email_address: "jane@example.com" }],
        phone_numbers: [],
        public_metadata: { role: "technician" },
      },
    });
    vi.mocked(db.user.findUnique).mockResolvedValue(null);

    const res = await POST(makeReq({}));

    expect(res.status).toBe(200);
    expect(db.user.create).toHaveBeenCalledWith({
      data: { clerkId: "clerk_1", name: "Jane Doe", email: "jane@example.com", role: "technician", phone: undefined, isActive: true },
    });
  });

  it("updates the existing user on user.updated when found by clerkId", async () => {
    verifyMock.mockReturnValue({
      type: "user.updated",
      data: {
        id: "clerk_1",
        first_name: "Jane",
        last_name: "Smith",
        email_addresses: [{ email_address: "jane@example.com" }],
        phone_numbers: [],
        public_metadata: { role: "admin" },
      },
    });
    vi.mocked(db.user.findUnique).mockResolvedValue({ id: "u1", clerkId: "clerk_1" } as any);

    const res = await POST(makeReq({}));

    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { name: "Jane Smith", email: "jane@example.com", role: "admin", phone: undefined },
    });
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("falls back to the technician role for an unrecognized public_metadata.role", async () => {
    verifyMock.mockReturnValue({
      type: "user.created",
      data: {
        id: "clerk_2",
        first_name: "Bob",
        last_name: null,
        email_addresses: [{ email_address: "bob@example.com" }],
        phone_numbers: [],
        public_metadata: { role: "superadmin" },
      },
    });
    vi.mocked(db.user.findUnique).mockResolvedValue(null);

    await POST(makeReq({}));

    expect(db.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: "technician" }) })
    );
  });

  it("returns 200 and does nothing for an unhandled event type", async () => {
    verifyMock.mockReturnValue({ type: "organization.created", data: {} });
    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("records a login authEvent on session.created for a known user", async () => {
    verifyMock.mockReturnValue({ type: "session.created", data: { user_id: "clerk_1" } });
    vi.mocked(db.user.findUnique).mockResolvedValue({ id: "u1", clerkId: "clerk_1" } as any);

    await POST(makeReq({}));

    expect(db.authEvent.create).toHaveBeenCalledWith({ data: { eventType: "login", userId: "u1" } });
  });

  it("does not throw on malformed payload text (still returns a Response, not a 500 crash)", async () => {
    verifyMock.mockImplementation(() => {
      throw new Error("cannot parse");
    });
    const req = new Request("http://localhost/api/webhooks/clerk", { method: "POST", body: "not json{{{" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
