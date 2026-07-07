import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({
  getSessionUser: vi.fn(),
  requireRole: vi.fn(),
}));
vi.mock("@/lib/push/vapid", () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/db/client", () => ({
  db: {
    assignment: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    job:  { findUnique: vi.fn() },
  },
}));

import { getSessionUser, requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET, POST } from "../assignments/route";

const MANAGER = { id: "m1", clerkId: "cm1", name: "Boss", email: "b@b.com", role: "service_manager" as const, isActive: true };
const TECH    = { id: "t1", clerkId: "ct1", name: "Jake", email: "j@j.com", role: "technician" as const, isActive: true };
const TECH2   = { id: "t2", clerkId: "ct2", name: "Sam",  email: "s@s.com", role: "technician" as const, isActive: true };
const JOB_ID  = "11111111-1111-4111-8111-111111111111";
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const mockAssignment = {
  id: "a1",
  assignedDate: new Date("2026-07-07T00:00:00.000Z"),
  endDate: null,
  user: { id: USER_ID, name: "Jake", role: "technician" },
  job: { id: JOB_ID, customerName: "Rio Tinto", siteName: "Weipa", siteAddress: "123 Mine Rd", status: "active" },
};

function makeGET(week?: string) {
  const url = week
    ? `http://localhost/api/schedule/assignments?week=${week}`
    : "http://localhost/api/schedule/assignments";
  return new Request(url);
}

function makePOST(body: unknown) {
  return new Request("http://localhost/api/schedule/assignments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/schedule/assignments", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await GET(makeGET());
    expect(res.status).toBe(401);
  });

  it("returns assignments for the requested week for a manager", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MANAGER);
    vi.mocked(db.assignment.findMany).mockResolvedValue([mockAssignment] as any);

    const res = await GET(makeGET("2026-07-07"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].endDate).toBeNull();
    expect(data[0].job.siteAddress).toBe("123 Mine Rd");
  });

  it("technician query includes userId filter", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(TECH);
    vi.mocked(db.assignment.findMany).mockResolvedValue([]);

    await GET(makeGET("2026-07-07"));
    const callArg = vi.mocked(db.assignment.findMany).mock.calls[0][0] as any;
    expect(callArg.where.userId).toBe(TECH.id);
  });

  it("manager query does NOT include userId filter", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(MANAGER);
    vi.mocked(db.assignment.findMany).mockResolvedValue([]);

    await GET(makeGET("2026-07-07"));
    const callArg = vi.mocked(db.assignment.findMany).mock.calls[0][0] as any;
    expect(callArg.where.userId).toBeUndefined();
  });
});

describe("POST /api/schedule/assignments", () => {
  const validBody = {
    userId: USER_ID,
    jobId: JOB_ID,
    assignedDate: "2026-07-07T00:00:00.000Z",
  };

  it("returns 401 when not a manager/admin/director", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await POST(makePOST(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body (missing userId)", async () => {
    vi.mocked(requireRole).mockResolvedValue(MANAGER as any);
    const res = await POST(makePOST({ jobId: JOB_ID, assignedDate: "2026-07-07T00:00:00.000Z" }));
    expect(res.status).toBe(400);
  });

  it("creates assignment and returns 201", async () => {
    vi.mocked(requireRole).mockResolvedValue(MANAGER as any);
    vi.mocked(db.assignment.findMany).mockResolvedValue([]); // no conflicts
    vi.mocked(db.assignment.create).mockResolvedValue({
      ...mockAssignment,
      job: { ...mockAssignment.job, siteAddress: "123 Mine Rd" },
    } as any);
    vi.mocked(db.user.findUnique).mockResolvedValue({ pushSubscriptions: [] } as any);

    const res = await POST(makePOST(validBody));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe("a1");
    expect(data.warning).toBeUndefined();
  });

  it("returns 201 with warning when overlap detected", async () => {
    vi.mocked(requireRole).mockResolvedValue(MANAGER as any);
    vi.mocked(db.assignment.findMany).mockResolvedValue([
      {
        id: "existing1",
        assignedDate: new Date("2026-07-07T00:00:00.000Z"),
        endDate: null,
        job: { customerName: "BHP", siteName: "Site A" },
      },
    ] as any);
    vi.mocked(db.assignment.create).mockResolvedValue({
      ...mockAssignment,
      job: { ...mockAssignment.job, siteAddress: "123 Mine Rd" },
    } as any);
    vi.mocked(db.user.findUnique).mockResolvedValue({ pushSubscriptions: [] } as any);

    const res = await POST(makePOST(validBody));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.warning).toMatch(/overlapping/i);
    expect(data.conflicts).toHaveLength(1);
  });

  it("sends push notification to technician", async () => {
    const { sendPushToUser } = await import("@/lib/push/vapid");
    vi.mocked(requireRole).mockResolvedValue(MANAGER as any);
    vi.mocked(db.assignment.findMany).mockResolvedValue([]);
    vi.mocked(db.assignment.create).mockResolvedValue({
      ...mockAssignment,
      job: { ...mockAssignment.job, siteAddress: "123 Mine Rd" },
    } as any);
    vi.mocked(db.user.findUnique).mockResolvedValue({
      pushSubscriptions: [{ endpoint: "https://fcm.example", p256dh: "key", auth: "auth" }],
    } as any);

    await POST(makePOST(validBody));
    expect(sendPushToUser).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://fcm.example" }),
      expect.objectContaining({ title: "New job assignment", url: "/schedule" })
    );
  });
});

// --- PATCH route ---
import { PATCH, DELETE as DELETE_HANDLER } from "../assignments/[id]/route";

const ASSIGNMENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makePATCH(id: string, body: unknown) {
  return new Request(`http://localhost/api/schedule/assignments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/schedule/assignments/[id]", () => {
  const existingAssignment = {
    id: ASSIGNMENT_ID,
    assignedDate: new Date("2026-07-07T00:00:00.000Z"),
    endDate: null,
  };

  it("returns 401 when not a manager", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await PATCH(makePATCH(ASSIGNMENT_ID, { assignedDate: "2026-07-08T00:00:00.000Z" }), {
      params: { id: ASSIGNMENT_ID },
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when assignment not found", async () => {
    vi.mocked(requireRole).mockResolvedValue(MANAGER as any);
    vi.mocked(db.assignment.findUnique).mockResolvedValue(null);
    const res = await PATCH(makePATCH(ASSIGNMENT_ID, { assignedDate: "2026-07-08T00:00:00.000Z" }), {
      params: { id: ASSIGNMENT_ID },
    });
    expect(res.status).toBe(404);
  });

  it("updates assignedDate correctly", async () => {
    vi.mocked(requireRole).mockResolvedValue(MANAGER as any);
    vi.mocked(db.assignment.findUnique).mockResolvedValue(existingAssignment as any);
    vi.mocked(db.assignment.update).mockResolvedValue({
      ...mockAssignment,
      assignedDate: new Date("2026-07-08T00:00:00.000Z"),
      endDate: null,
      job: { ...mockAssignment.job, siteAddress: "123 Mine Rd" },
    } as any);

    const res = await PATCH(makePATCH(ASSIGNMENT_ID, { assignedDate: "2026-07-08T00:00:00.000Z" }), {
      params: { id: ASSIGNMENT_ID },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.assignedDate).toContain("2026-07-08");
  });

  it("preserves multi-day duration when shifting assignedDate", async () => {
    // Assignment: Mon 7 Jul → Wed 9 Jul (3 days). Move to Tue 8 Jul → Thu 10 Jul.
    vi.mocked(requireRole).mockResolvedValue(MANAGER as any);
    vi.mocked(db.assignment.findUnique).mockResolvedValue({
      ...existingAssignment,
      assignedDate: new Date("2026-07-07T00:00:00.000Z"),
      endDate: new Date("2026-07-09T00:00:00.000Z"),
    } as any);

    const expectedNewEnd = new Date("2026-07-10T00:00:00.000Z");
    vi.mocked(db.assignment.update).mockResolvedValue({
      ...mockAssignment,
      assignedDate: new Date("2026-07-08T00:00:00.000Z"),
      endDate: expectedNewEnd,
      job: { ...mockAssignment.job, siteAddress: "123 Mine Rd" },
    } as any);

    const res = await PATCH(makePATCH(ASSIGNMENT_ID, { assignedDate: "2026-07-08T00:00:00.000Z" }), {
      params: { id: ASSIGNMENT_ID },
    });
    expect(res.status).toBe(200);

    const updateCall = vi.mocked(db.assignment.update).mock.calls[0][0] as any;
    // endDate should have shifted by 1 day (same delta as assignedDate shift)
    const updatedEnd: Date = updateCall.data.endDate;
    expect(updatedEnd.toISOString().slice(0, 10)).toBe("2026-07-10");
  });
});
