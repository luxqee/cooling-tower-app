import { describe, it, expect } from "vitest";
import { calcDurationMinutes, isOverQuota, formatDuration } from "@/lib/time/utils";

describe("calcDurationMinutes", () => {
  it("returns minutes between two dates", () => {
    const clockIn = new Date("2025-01-01T08:00:00Z");
    const clockOut = new Date("2025-01-01T10:30:00Z");
    expect(calcDurationMinutes(clockIn, clockOut)).toBe(150);
  });

  it("returns 0 when clockOut is the same as clockIn", () => {
    const t = new Date("2025-01-01T09:00:00Z");
    expect(calcDurationMinutes(t, t)).toBe(0);
  });
});

describe("isOverQuota", () => {
  it("returns false when actual hours are within 10% of quoted", () => {
    expect(isOverQuota(9.9, 9)).toBe(false);
  });

  it("returns true when actual hours exceed quoted by more than 10%", () => {
    expect(isOverQuota(10.1, 9)).toBe(true);
  });

  it("returns false when actual hours equal quoted", () => {
    expect(isOverQuota(8, 8)).toBe(false);
  });
});

describe("formatDuration", () => {
  it("formats minutes as h:mm", () => {
    expect(formatDuration(90)).toBe("1h 30m");
    expect(formatDuration(60)).toBe("1h 00m");
    expect(formatDuration(5)).toBe("0h 05m");
  });
});
