import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: { notification: { createMany: vi.fn() } },
}));

import { db } from "@/lib/db/client";
import { notifyUsers } from "../create";

beforeEach(() => vi.clearAllMocks());

describe("notifyUsers", () => {
  it("creates one notification row per user with the same payload", async () => {
    await notifyUsers(["u1", "u2"], { title: "New job assignment", body: "Rio Tinto — Weipa", url: "/schedule" });

    expect(db.notification.createMany).toHaveBeenCalledWith({
      data: [
        { userId: "u1", title: "New job assignment", body: "Rio Tinto — Weipa", url: "/schedule" },
        { userId: "u2", title: "New job assignment", body: "Rio Tinto — Weipa", url: "/schedule" },
      ],
    });
  });

  it("does nothing when given an empty list of users", async () => {
    await notifyUsers([], { title: "x", body: "y", url: "/z" });
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });
});
