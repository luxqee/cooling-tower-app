import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { notification: { updateMany: vi.fn() } },
}));

import { getSessionUser } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { POST } from "../route";

const mockUser = { id: "u1", role: "technician" as const, name: "Jake", clerkId: "c1", email: "j@t.com", isActive: true };

beforeEach(() => vi.clearAllMocks());

describe("POST /api/notifications/read-all", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("marks all of the current user's unread notifications as read", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as any);
    vi.mocked(db.notification.updateMany).mockResolvedValue({ count: 3 } as any);

    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(db.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", read: false },
      data: { read: true },
    });
  });
});
