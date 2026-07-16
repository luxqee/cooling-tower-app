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

import { generatePdf, FieldValue, TableFieldPdf, SignatureListPdf } from "../generatePdf";
import { Text, Image, View } from "@react-pdf/renderer";

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

  it("does not throw when submittedAt is null", async () => {
    const nullDateDoc = { ...baseDocument, submittedAt: null };
    await expect(
      generatePdf({ document: nullDateDoc as any, template: baseTemplate as any, job: baseJob as any, createdBy: baseUser as any })
    ).resolves.not.toThrow();
  });
});

describe("FieldValue component", () => {
  it("renders em-dash Text for null value", () => {
    const el = FieldValue({ type: "text", value: null }) as any;
    expect(el.type).toBe(Text);
    expect(el.props.children).toBe("—");
  });

  it("renders em-dash Text for empty-string value", () => {
    const el = FieldValue({ type: "text", value: "" }) as any;
    expect(el.type).toBe(Text);
    expect(el.props.children).toBe("—");
  });

  it("renders Image for signature with data URL", () => {
    const el = FieldValue({ type: "signature", value: "data:image/png;base64,abc123" }) as any;
    expect(el.type).toBe(Image);
    expect(el.props.src).toBe("data:image/png;base64,abc123");
  });

  it("falls through to Text string for signature without data URL", () => {
    const el = FieldValue({ type: "signature", value: "not-a-data-url" }) as any;
    expect(el.type).toBe(Text);
    expect(el.props.children).toBe("not-a-data-url");
  });

  it("renders '☑ Yes' Text for checkbox true", () => {
    const el = FieldValue({ type: "checkbox", value: true }) as any;
    expect(el.type).toBe(Text);
    expect(el.props.children).toBe("☑ Yes");
  });

  it("renders '☐ No' Text for checkbox false", () => {
    const el = FieldValue({ type: "checkbox", value: false }) as any;
    expect(el.type).toBe(Text);
    expect(el.props.children).toBe("☐ No");
  });

  it("renders joined items Text for non-empty checklist", () => {
    const el = FieldValue({ type: "checklist", value: ["Harness", "Helmet"] }) as any;
    expect(el.type).toBe(Text);
    expect(el.props.children).toBe("Harness, Helmet");
  });

  it("renders 'None selected' Text for empty checklist", () => {
    const el = FieldValue({ type: "checklist", value: [] }) as any;
    expect(el.type).toBe(Text);
    expect(el.props.children).toBe("None selected");
  });

  it("renders formatted date string Text for date type", () => {
    const el = FieldValue({ type: "date", value: "2026-07-04" }) as any;
    expect(el.type).toBe(Text);
    expect(typeof el.props.children).toBe("string");
    expect(el.props.children).not.toBe("—");
  });

  it("renders string Text for plain text type", () => {
    const el = FieldValue({ type: "text", value: "Cooling Tower Services" }) as any;
    expect(el.type).toBe(Text);
    expect(el.props.children).toBe("Cooling Tower Services");
  });

  it("renders string Text for textarea type", () => {
    const el = FieldValue({ type: "textarea", value: "Replace fill media on unit 3" }) as any;
    expect(el.type).toBe(Text);
    expect(el.props.children).toBe("Replace fill media on unit 3");
  });
});

describe("TableFieldPdf component", () => {
  const field = {
    id: "f-table",
    label: "Tasks",
    type: "table" as const,
    required: false,
    columns: [{ id: "task", label: "Task" }, { id: "hazard", label: "Hazard" }],
  };

  it("renders em-dash for an empty table", () => {
    const el = TableFieldPdf({ field, value: [] }) as any;
    expect(el.type).toBe(Text);
    expect(el.props.children).toBe("—");
  });

  it("renders one header row and one row per entry", () => {
    const rows = [{ task: "Isolate power", hazard: "Electrical" }, { task: "Remove fill", hazard: "Manual handling" }];
    const el = TableFieldPdf({ field, value: rows }) as any;
    expect(el.type).toBe(View);
    // first child is the header row, remaining children are one per data row
    expect(el.props.children.length).toBe(1 + rows.length);
  });
});

describe("SignatureListPdf component", () => {
  it("renders em-dash for an empty list", () => {
    const el = SignatureListPdf({ value: [] }) as any;
    expect(el.type).toBe(Text);
    expect(el.props.children).toBe("—");
  });

  it("renders one entry per signature, with an image when present", () => {
    const entries = [
      { name: "Jake Morrison", signature: "data:image/png;base64,abc" },
      { name: "Sarah Chen", signature: "" },
    ];
    const el = SignatureListPdf({ value: entries }) as any;
    expect(el.props.children.length).toBe(2);
    const [first, second] = el.props.children;
    expect(first.props.children[1].type).toBe(Image);
    expect(second.props.children[1].type).toBe(Text);
    expect(second.props.children[1].props.children).toBe("No signature");
  });
});

describe("generatePdf statutory content", () => {
  const swmsTemplate = { ...baseTemplate, type: "swms", sections: [] };
  const jsaTemplate = { ...baseTemplate, type: "jsa" };

  it("does not throw for a SWMS template with an empty custom sections array (statutory content still merges in)", async () => {
    await expect(
      generatePdf({ document: baseDocument as any, template: swmsTemplate as any, job: baseJob as any, createdBy: baseUser as any })
    ).resolves.not.toThrow();
  });

  it("includes the WHS disclaimer text for a SWMS document", async () => {
    const businessName = "Test Co";
    // Render without the react-pdf mock's flattening masking the disclaimer — inspect via the
    // mocked renderToBuffer call argument tree instead of the returned Buffer.
    const { renderToBuffer } = await import("@react-pdf/renderer");
    await generatePdf({ document: baseDocument as any, template: swmsTemplate as any, job: baseJob as any, createdBy: baseUser as any, businessName });
    const docElement = vi.mocked(renderToBuffer).mock.calls[0][0] as any;
    const pageChildren = docElement.props.children.props.children as any[];
    const disclaimerText = pageChildren.find((c) => typeof c?.props?.children === "string" && c.props.children.includes("WorkSafe Queensland"));
    expect(disclaimerText).toBeTruthy();
  });

  it("omits the WHS disclaimer for a JSA document", async () => {
    const { renderToBuffer } = await import("@react-pdf/renderer");
    await generatePdf({ document: baseDocument as any, template: jsaTemplate as any, job: baseJob as any, createdBy: baseUser as any });
    const docElement = vi.mocked(renderToBuffer).mock.calls[0][0] as any;
    const pageChildren = docElement.props.children.props.children as any[];
    const disclaimerText = pageChildren.find((c) => typeof c?.props?.children === "string" && c.props.children.includes("WorkSafe Queensland"));
    expect(disclaimerText).toBeFalsy();
  });
});
