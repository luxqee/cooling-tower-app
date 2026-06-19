import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { getSessionUser, requireRole } from "@/lib/auth/clerk";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(db.user.findUnique);

const mockUser = {
  id: "user-123",
  clerkId: "clerk-abc",
  name: "Jake Torres",
  email: "jake@ctss.com.au",
  phone: "0400000000",
  role: "technician" as const,
  isActive: true,
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSessionUser", () => {
  it("returns null when not signed in", async () => {
    mockAuth.mockResolvedValue({ userId: null } as Awaited<ReturnType<typeof auth>>);
    const result = await getSessionUser();
    expect(result).toBeNull();
  });

  it("returns null when user not found in DB", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk-abc" } as Awaited<ReturnType<typeof auth>>);
    mockFindUnique.mockResolvedValue(null);
    const result = await getSessionUser();
    expect(result).toBeNull();
  });

  it("returns null when user is inactive", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk-abc" } as Awaited<ReturnType<typeof auth>>);
    mockFindUnique.mockResolvedValue({ ...mockUser, isActive: false });
    const result = await getSessionUser();
    expect(result).toBeNull();
  });

  it("returns session user when signed in and active", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk-abc" } as Awaited<ReturnType<typeof auth>>);
    mockFindUnique.mockResolvedValue(mockUser);
    const result = await getSessionUser();
    expect(result).toMatchObject({ id: "user-123", role: "technician" });
  });
});

describe("requireRole", () => {
  it("throws Unauthorized when not signed in", async () => {
    mockAuth.mockResolvedValue({ userId: null } as Awaited<ReturnType<typeof auth>>);
    await expect(requireRole(["director"])).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when role is not in the allowed list", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk-abc" } as Awaited<ReturnType<typeof auth>>);
    mockFindUnique.mockResolvedValue(mockUser);
    await expect(requireRole(["director", "admin"])).rejects.toThrow("Forbidden");
  });

  it("returns the session user when role is allowed", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk-abc" } as Awaited<ReturnType<typeof auth>>);
    mockFindUnique.mockResolvedValue(mockUser);
    const result = await requireRole(["technician", "director"]);
    expect(result.id).toBe("user-123");
  });
});
