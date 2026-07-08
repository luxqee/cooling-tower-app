import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    $transaction: vi.fn(),
    invoice: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    businessProfile: { findFirst: vi.fn() },
    job: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/invoicing/generateInvoicePdf", () => ({
  generateInvoicePdf: vi.fn().mockResolvedValue(Buffer.from("pdf")),
}));
vi.mock("@/lib/invoicing/sendInvoiceEmail", () => ({
  sendInvoiceEmail: vi.fn().mockResolvedValue(undefined),
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { generateInvoicePdf } from "@/lib/invoicing/generateInvoicePdf";
import { sendInvoiceEmail } from "@/lib/invoicing/sendInvoiceEmail";
import { GET as GET_LIST } from "../route";
import { GET as GET_DETAIL, PATCH } from "../[id]/route";
import { POST as POST_SEND } from "../[id]/send/route";
import { GET as GET_PDF } from "../[id]/pdf/route";

const ADMIN    = { id: "a1", role: "admin"     as const, name: "Admin", clerkId: "ca1", email: "a@c.com", isActive: true };
const DIRECTOR = { id: "d1", role: "director"  as const, name: "Boss",  clerkId: "cd1", email: "d@c.com", isActive: true };
const TECH     = { id: "t1", role: "technician" as const, name: "Jake", clerkId: "ct1", email: "t@c.com", isActive: true };

const INV_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const baseInvoice = {
  id: INV_ID,
  jobId: "j1",
  invoiceNumber: null,
  status: "draft",
  baseAmount: { toNumber: () => 0 },
  variationsTotal: { toNumber: () => 450 },
  totalAmount: { toNumber: () => 450 },
  notes: null,
  sentAt: null,
  sentToEmail: null,
  paidAt: null,
  createdAt: new Date("2026-07-08T00:00:00Z"),
  updatedAt: new Date("2026-07-08T00:00:00Z"),
  job: { id: "j1", customerName: "Rio Tinto", siteName: "Weipa", jobType: "Annual Service", siteAddress: "1 Mine Rd" },
};

const baseJob = {
  id: "j1", customerName: "Rio Tinto", siteName: "Weipa", siteAddress: "1 Mine Rd", jobType: "Annual Service",
  timeEntries: [{ durationMinutes: 480 }],
  variations: [{ id: "v1", description: "Fill packs", costEstimate: { toNumber: () => 450 }, decidedAt: new Date("2026-07-01T00:00:00Z") }],
};

const baseProfile = { name: "CT Field Ops", abn: "12 345 678 901", address: "Brisbane", email: "ct@ct.com", logoUrl: null, paymentTerms: "Net 14" };

function makeReq(url: string, init?: RequestInit) {
  return new Request(`http://localhost${url}`, init);
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/invoices", () => {
  it("returns 401 for technician", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await GET_LIST();
    expect(res.status).toBe(401);
  });

  it("returns 200 with invoice list for admin", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.invoice.findMany).mockResolvedValue([baseInvoice] as any);
    const res = await GET_LIST();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(INV_ID);
  });
});

describe("PATCH /api/invoices/[id]", () => {
  it("returns 401 for service_manager", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await PATCH(makeReq(`/api/invoices/${INV_ID}`, { method: "PATCH", body: JSON.stringify({ baseAmount: 1800 }) }), { params: { id: INV_ID } });
    expect(res.status).toBe(401);
  });

  it("recalculates totalAmount = baseAmount + variationsTotal", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.invoice.findUnique).mockResolvedValue(baseInvoice as any);
    const updatedInvoice = { ...baseInvoice, invoiceNumber: "INV-2026-0001", baseAmount: { toNumber: () => 1800 }, totalAmount: { toNumber: () => 2250 } };
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) => fn({
      invoice: { count: vi.fn().mockResolvedValue(0), update: vi.fn().mockResolvedValue(updatedInvoice) },
    }));
    const res = await PATCH(makeReq(`/api/invoices/${INV_ID}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseAmount: 1800 }) }), { params: { id: INV_ID } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totalAmount).toBe(2250);
  });

  it("generates invoiceNumber INV-YYYY-NNNN when null", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.invoice.findUnique).mockResolvedValue(baseInvoice as any);
    let capturedNumber = "";
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) => {
      const result = await fn({
        invoice: {
          count: vi.fn().mockResolvedValue(0),
          update: vi.fn().mockImplementation(async ({ data }: any) => {
            capturedNumber = data.invoiceNumber;
            return { ...baseInvoice, ...data };
          }),
        },
      });
      return result;
    });
    await PATCH(makeReq(`/api/invoices/${INV_ID}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseAmount: 0 }) }), { params: { id: INV_ID } });
    expect(capturedNumber).toMatch(/^INV-\d{4}-\d{4}$/);
  });

  it("returns 403 when admin tries to mark as paid", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.invoice.findUnique).mockResolvedValue(baseInvoice as any);
    const res = await PATCH(makeReq(`/api/invoices/${INV_ID}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "paid" }) }), { params: { id: INV_ID } });
    expect(res.status).toBe(403);
  });

  it("sets paidAt when director marks as paid", async () => {
    vi.mocked(requireRole).mockResolvedValue(DIRECTOR as any);
    const sentInvoice = { ...baseInvoice, invoiceNumber: "INV-2026-0001", status: "sent" };
    vi.mocked(db.invoice.findUnique).mockResolvedValue(sentInvoice as any);
    let capturedData: any = null;
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) => {
      return fn({
        invoice: {
          count: vi.fn().mockResolvedValue(1),
          update: vi.fn().mockImplementation(async ({ data }: any) => { capturedData = data; return { ...sentInvoice, ...data }; }),
        },
      });
    });
    const res = await PATCH(makeReq(`/api/invoices/${INV_ID}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "paid" }) }), { params: { id: INV_ID } });
    expect(res.status).toBe(200);
    expect(capturedData.paidAt).toBeInstanceOf(Date);
    expect(capturedData.status).toBe("paid");
  });
});

describe("POST /api/invoices/[id]/send", () => {
  it("returns 422 for invalid email", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    const res = await POST_SEND(makeReq(`/api/invoices/${INV_ID}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "not-an-email" }) }), { params: { id: INV_ID } });
    expect(res.status).toBe(422);
  });

  it("calls sendInvoiceEmail and returns sentAt for valid request", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    const invWithNumber = { ...baseInvoice, invoiceNumber: "INV-2026-0001" };
    const sentInvoice = { ...invWithNumber, status: "sent", sentAt: new Date("2026-07-08T00:00:00Z"), sentToEmail: "client@example.com" };
    vi.mocked(db.invoice.findUnique).mockResolvedValue(invWithNumber as any);
    vi.mocked(db.job.findUnique).mockResolvedValue(baseJob as any);
    vi.mocked(db.businessProfile.findFirst).mockResolvedValue(baseProfile as any);
    // Transaction only assigns the invoice number; invoice already has one so fn returns it immediately.
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) => {
      return fn({ invoice: { count: vi.fn().mockResolvedValue(1), update: vi.fn() } });
    });
    // The final status/sentAt write happens outside the transaction.
    vi.mocked(db.invoice.update).mockResolvedValue(sentInvoice as any);
    const res = await POST_SEND(makeReq(`/api/invoices/${INV_ID}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "client@example.com" }) }), { params: { id: INV_ID } });
    expect(res.status).toBe(200);
    expect(sendInvoiceEmail).toHaveBeenCalledOnce();
    const data = await res.json();
    expect(data).toHaveProperty("sentAt");
    expect(data.sentToEmail).toBe("client@example.com");
  });
});

describe("GET /api/invoices/[id]/pdf", () => {
  it("returns application/pdf content type", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.invoice.findUnique).mockResolvedValue({ ...baseInvoice, invoiceNumber: "INV-2026-0001" } as any);
    vi.mocked(db.job.findUnique).mockResolvedValue(baseJob as any);
    vi.mocked(db.businessProfile.findFirst).mockResolvedValue(baseProfile as any);
    const res = await GET_PDF(makeReq(`/api/invoices/${INV_ID}/pdf`), { params: { id: INV_ID } });
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });
});
