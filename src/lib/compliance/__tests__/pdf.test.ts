import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-pdf-content")),
  Document: ({ children }: any) => children,
  Page: ({ children }: any) => children,
  View: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Image: () => null,
  StyleSheet: { create: (s: any) => s },
}));

import { generatePdf } from "../generatePdf";

const baseTemplate = {
  id: "tmpl-1",
  name: "Standard SWMS",
  type: "swms",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  sections: [
    {
      id: "sec-1",
      title: "Project Details",
      fields: [
        { id: "f-text",      label: "Contractor",      type: "text",      required: true  },
        { id: "f-textarea",  label: "Description",     type: "textarea",  required: false },
        { id: "f-date",      label: "Start Date",      type: "date",      required: false },
        { id: "f-checkbox",  label: "PPE Required",    type: "checkbox",  required: false },
        { id: "f-checklist", label: "Safety Checks",   type: "checklist", required: false, options: ["Harness", "Helmet"] },
        { id: "f-sig",       label: "Signature",       type: "signature", required: true  },
      ],
    },
  ],
};

const baseDocument = {
  id: "doc-1",
  jobId: "job-1",
  templateId: "tmpl-1",
  createdById: "user-1",
  pdfUrl: null,
  submittedAt: new Date("2026-07-04T10:00:00Z"),
  createdAt: new Date("2026-07-04T10:00:00Z"),
  values: {
    "f-text":      "Cooling Tower Services",
    "f-textarea":  "Replace fill media on unit 3",
    "f-date":      "2026-07-04",
    "f-checkbox":  true,
    "f-checklist": ["Harness", "Helmet"],
    "f-sig":       "data:image/png;base64,iVBORw0KGgo=",
  },
};

const baseJob  = { id: "job-1", customerName: "Rio Tinto", siteName: "Weipa Site A", siteAddress: "Weipa QLD", status: "active", quotedHours: 8, createdAt: new Date() };
const baseUser = { id: "user-1", name: "Jake Torres", clerkId: "c1", email: "j@t.com", phone: "", role: "technician", isActive: true, createdAt: new Date() };

beforeEach(() => vi.clearAllMocks());

describe("generatePdf", () => {
  it("returns a Buffer for a complete document", async () => {
    const result = await generatePdf({ document: baseDocument as any, template: baseTemplate as any, job: baseJob as any, createdBy: baseUser as any });
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it("does not throw when all field values are missing", async () => {
    const emptyDoc = { ...baseDocument, values: {} };
    await expect(
      generatePdf({ document: emptyDoc as any, template: baseTemplate as any, job: baseJob as any, createdBy: baseUser as any })
    ).resolves.not.toThrow();
  });

  it("calls renderToBuffer once", async () => {
    const { renderToBuffer } = await import("@react-pdf/renderer");
    await generatePdf({ document: baseDocument as any, template: baseTemplate as any, job: baseJob as any, createdBy: baseUser as any });
    expect(renderToBuffer).toHaveBeenCalledOnce();
  });
});
