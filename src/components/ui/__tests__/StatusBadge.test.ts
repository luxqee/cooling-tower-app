import { describe, it, expect } from "vitest";
import { STATUS_STYLES, STATUS_LABELS, type Status } from "../StatusBadge";

const ALL_STATUSES: Status[] = [
  "scheduled", "active", "complete", "cancelled",
  "pending", "approved", "rejected", "queried",
  "draft", "sent", "paid",
  "received", "reconciled",
  "accepted", "declined",
  "lapsed",
  "transcribed", "failed", "awaiting_review",
];

describe("StatusBadge status maps", () => {
  it("has a style and label for every status value", () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_STYLES[status]).toBeTruthy();
      expect(STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("groups the amber family (in-progress/needs attention) consistently", () => {
    for (const status of ["active", "sent", "queried", "received", "awaiting_review"] as Status[]) {
      expect(STATUS_STYLES[status]).toContain("amber");
    }
  });

  it("groups the emerald family (done/success) consistently", () => {
    for (const status of ["complete", "approved", "paid", "accepted", "reconciled", "transcribed"] as Status[]) {
      expect(STATUS_STYLES[status]).toContain("emerald");
    }
  });

  it("groups the red family (negative/terminal) consistently", () => {
    for (const status of ["cancelled", "rejected", "declined", "failed", "lapsed"] as Status[]) {
      expect(STATUS_STYLES[status]).toContain("red");
    }
  });

  it("groups the slate family (not started/neutral) consistently", () => {
    for (const status of ["scheduled", "pending", "draft"] as Status[]) {
      expect(STATUS_STYLES[status]).toContain("slate");
    }
  });

  it("renders a readable label for awaiting_review", () => {
    expect(STATUS_LABELS.awaiting_review).toBe("Awaiting Review");
  });
});
