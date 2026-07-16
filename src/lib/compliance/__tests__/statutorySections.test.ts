import { describe, it, expect } from "vitest";
import {
  getStatutorySections,
  mergeSections,
  hasStatutoryContent,
  RESERVED_FIELD_PREFIX,
  SWMS_STATUTORY_SECTIONS,
  WHS_MANAGEMENT_PLAN_STATUTORY_SECTIONS,
} from "../statutorySections";

function allFieldIds(sections: typeof SWMS_STATUTORY_SECTIONS) {
  return sections.flatMap((s) => s.fields.map((f) => f.id));
}

describe("getStatutorySections", () => {
  it("returns non-empty statutory content for swms", () => {
    const sections = getStatutorySections("swms");
    expect(sections).not.toBeNull();
    expect(sections!.length).toBeGreaterThan(0);
  });

  it("returns non-empty statutory content for whs_management_plan", () => {
    const sections = getStatutorySections("whs_management_plan");
    expect(sections).not.toBeNull();
    expect(sections!.length).toBeGreaterThan(0);
  });

  it("returns null for jsa, induction, and unknown types", () => {
    expect(getStatutorySections("jsa")).toBeNull();
    expect(getStatutorySections("induction")).toBeNull();
    expect(getStatutorySections("something-custom")).toBeNull();
  });
});

describe("statutory field IDs", () => {
  it("every SWMS statutory field ID is prefixed with the reserved prefix", () => {
    for (const id of allFieldIds(SWMS_STATUTORY_SECTIONS)) {
      expect(id.startsWith(RESERVED_FIELD_PREFIX)).toBe(true);
    }
  });

  it("every WHS Management Plan statutory field ID is prefixed with the reserved prefix", () => {
    for (const id of allFieldIds(WHS_MANAGEMENT_PLAN_STATUTORY_SECTIONS)) {
      expect(id.startsWith(RESERVED_FIELD_PREFIX)).toBe(true);
    }
  });

  it("SWMS includes all 18 high-risk construction work categories", () => {
    const hrcwSection = SWMS_STATUTORY_SECTIONS.find((s) => s.id === "statutory_hrcw");
    expect(hrcwSection?.fields.length).toBe(18);
  });

  it("SWMS includes the task/hazard/control table with 3 columns", () => {
    const field = SWMS_STATUTORY_SECTIONS.flatMap((s) => s.fields).find((f) => f.type === "table");
    expect(field?.columns?.length).toBe(3);
  });
});

describe("mergeSections", () => {
  it("puts statutory sections before custom sections for swms", () => {
    const custom = [{ id: "custom_1", title: "Extra Notes", fields: [{ id: "custom_field", label: "Notes", type: "textarea" as const, required: false }] }];
    const merged = mergeSections("swms", custom);
    expect(merged[0].id).toBe(SWMS_STATUTORY_SECTIONS[0].id);
    expect(merged[merged.length - 1].id).toBe("custom_1");
  });

  it("returns only custom sections for jsa (no statutory core)", () => {
    const custom = [{ id: "custom_1", title: "Job Details", fields: [] }];
    const merged = mergeSections("jsa", custom);
    expect(merged).toEqual(custom);
  });
});

describe("hasStatutoryContent", () => {
  it("is true for swms and whs_management_plan, false otherwise", () => {
    expect(hasStatutoryContent("swms")).toBe(true);
    expect(hasStatutoryContent("whs_management_plan")).toBe(true);
    expect(hasStatutoryContent("jsa")).toBe(false);
    expect(hasStatutoryContent("induction")).toBe(false);
  });
});
