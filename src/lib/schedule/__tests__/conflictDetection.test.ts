import { describe, it, expect } from "vitest";
import { detectConflict } from "../conflictDetection";

function range(start: string, end: string) {
  return { startDate: new Date(start), endDate: new Date(end) };
}

describe("detectConflict", () => {
  it("returns false when existing ends before incoming starts", () => {
    expect(detectConflict(range("2026-07-06", "2026-07-07"), range("2026-07-08", "2026-07-09"))).toBe(false);
  });

  it("returns false when existing starts after incoming ends", () => {
    expect(detectConflict(range("2026-07-10", "2026-07-11"), range("2026-07-06", "2026-07-08"))).toBe(false);
  });

  it("returns true when ranges overlap partially", () => {
    expect(detectConflict(range("2026-07-06", "2026-07-08"), range("2026-07-07", "2026-07-09"))).toBe(true);
  });

  it("returns true when one range is contained in the other", () => {
    expect(detectConflict(range("2026-07-06", "2026-07-10"), range("2026-07-07", "2026-07-08"))).toBe(true);
  });

  it("returns true for same single-day assignment", () => {
    expect(detectConflict(range("2026-07-06", "2026-07-06"), range("2026-07-06", "2026-07-06"))).toBe(true);
  });

  it("returns false when end of existing equals start of incoming (adjacent, non-overlapping)", () => {
    // A ends July 7, B starts July 8 — no overlap
    expect(detectConflict(range("2026-07-06", "2026-07-07"), range("2026-07-08", "2026-07-08"))).toBe(false);
  });
});
