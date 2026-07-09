import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { notification: { findMany: vi.fn(), count: vi.fn() } },
}));

import { getSessionUser } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET } from "../route";

const mockUser = { id: "u1", role: "technician" as const, name: "Jake", clerkId: "c1", email: "j@t.com", isActive: true };

const mockNotification = {
  id: "n1", userId: "u1", title: "New job assignment", body: "Rio Tinto — Weipa", url: "/schedule", read: false, createdAt: new Date(),
};

beforeEach(() => vi.clearAllMocks());

describe("GET /api/notifications", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the current user's notifications and unread count", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as any);
    vi.mocked(db.notification.findMany).mockResolvedValue([mockNotification] as any);
    vi.mocked(db.notification.count).mockResolvedValue(1);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.notifications).toHaveLength(1);
    expect(data.unreadCount).toBe(1);
    expect(db.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } })
    );
    expect(db.notification.count).toHaveBeenCalledWith({ where: { userId: "u1", read: false } });
  });
});
