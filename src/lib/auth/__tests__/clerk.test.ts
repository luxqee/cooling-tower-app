import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { getSessionUser, requireRole } from "@/lib/auth/clerk";

const mockAuth = vi.mocked(auth);
const mockCurrentUser = vi.mocked(currentUser);
const mockFindUnique = vi.mocked(db.user.findUnique);
const mockCreate = vi.mocked(db.user.create);
const mockUpdate = vi.mocked(db.user.update);

const mockDbUser = {
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

  it("returns null when user not in DB and not found in Clerk either", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk-abc" } as Awaited<ReturnType<typeof auth>>);
    mockFindUnique.mockResolvedValue(null);
    mockCurrentUser.mockResolvedValue(null);
    const result = await getSessionUser();
    expect(result).toBeNull();
  });

  it("provisions user from Clerk when not yet in DB", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk-abc" } as Awaited<ReturnType<typeof auth>>);
    // First findUnique (by clerkId) → not found; second (by email) → not found
    mockFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mockCurrentUser.mockResolvedValue({
      id: "clerk-abc",
      firstName: "Jake",
      lastName: "Torres",
      emailAddresses: [{ emailAddress: "jake@ctss.com.au" }],
      phoneNumbers: [],
      publicMetadata: { role: "director" },
    } as unknown as Awaited<ReturnType<typeof currentUser>>);
    mockCreate.mockResolvedValue({ ...mockDbUser, role: "director" });
    const result = await getSessionUser();
    expect(result).toMatchObject({ clerkId: "clerk-abc", role: "director" });
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("links GitHub login to existing email/password account instead of throwing", async () => {
    const existingUser = { ...mockDbUser, clerkId: "clerk-old", role: "admin" as const };
    mockAuth.mockResolvedValue({ userId: "clerk-github" } as Awaited<ReturnType<typeof auth>>);
    // findUnique by clerkId → not found (GitHub = new clerkId)
    // findUnique by email → found (same email as existing account)
    mockFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingUser);
    mockCurrentUser.mockResolvedValue({
      id: "clerk-github",
      firstName: "Jake",
      lastName: "Torres",
      emailAddresses: [{ emailAddress: "jake@ctss.com.au" }],
      phoneNumbers: [],
      publicMetadata: {},
    } as unknown as Awaited<ReturnType<typeof currentUser>>);
    mockUpdate.mockResolvedValue({ ...existingUser, clerkId: "clerk-github" });
    const result = await getSessionUser();
    expect(result).toMatchObject({ clerkId: "clerk-github", role: "admin" });
    expect(mockUpdate).toHaveBeenCalledOnce();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns null instead of throwing when a DB error occurs", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk-abc" } as Awaited<ReturnType<typeof auth>>);
    mockFindUnique.mockRejectedValue(new Error("DB connection lost"));
    const result = await getSessionUser();
    expect(result).toBeNull();
  });

  it("returns null when user is inactive", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk-abc" } as Awaited<ReturnType<typeof auth>>);
    mockFindUnique.mockResolvedValue({ ...mockDbUser, isActive: false });
    const result = await getSessionUser();
    expect(result).toBeNull();
  });

  it("returns session user when signed in and active", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk-abc" } as Awaited<ReturnType<typeof auth>>);
    mockFindUnique.mockResolvedValue(mockDbUser);
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
    mockFindUnique.mockResolvedValue(mockDbUser);
    await expect(requireRole(["director", "admin"])).rejects.toThrow("Forbidden");
  });

  it("returns the session user when role is allowed", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk-abc" } as Awaited<ReturnType<typeof auth>>);
    mockFindUnique.mockResolvedValue(mockDbUser);
    const result = await requireRole(["technician", "director"]);
    expect(result.id).toBe("user-123");
  });
});
