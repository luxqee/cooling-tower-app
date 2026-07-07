import { describe, it, expect } from "vitest";
import { weekStart, weekDays, formatShortDate, toDateString, isSameDay } from "../dateUtils";

describe("weekStart", () => {
  it("returns Monday for a Monday", () => {
    // 2026-07-06 is a Monday
    const result = weekStart(new Date("2026-07-06T00:00:00"));
    expect(toDateString(result)).toBe("2026-07-06");
  });

  it("returns Monday for a Wednesday", () => {
    const result = weekStart(new Date("2026-07-08T12:00:00"));
    expect(toDateString(result)).toBe("2026-07-06");
  });

  it("returns previous Monday for a Sunday", () => {
    // 2026-07-12 is Sunday
    const result = weekStart(new Date("2026-07-12T08:00:00"));
    expect(toDateString(result)).toBe("2026-07-06");
  });

  it("returns time set to 00:00:00", () => {
    const result = weekStart(new Date("2026-07-08T15:30:00"));
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });
});

describe("weekDays", () => {
  it("returns exactly 7 days", () => {
    const monday = new Date("2026-07-06");
    expect(weekDays(monday)).toHaveLength(7);
  });

  it("starts on Monday (getDay() === 1) and ends on Sunday (getDay() === 0)", () => {
    const monday = new Date("2026-07-06");
    const days = weekDays(monday);
    expect(days[0].getDay()).toBe(1);
    expect(days[6].getDay()).toBe(0);
  });

  it("days are consecutive", () => {
    const monday = new Date("2026-07-06");
    const days = weekDays(monday);
    for (let i = 1; i < days.length; i++) {
      expect(days[i].getDate() - days[i - 1].getDate()).toBe(1);
    }
  });
});

describe("isSameDay", () => {
  it("returns true for same day same time", () => {
    expect(isSameDay(new Date("2026-07-06T09:00:00"), new Date("2026-07-06T09:00:00"))).toBe(true);
  });

  it("returns true for same day different times", () => {
    expect(isSameDay(new Date("2026-07-06T01:00:00"), new Date("2026-07-06T23:59:00"))).toBe(true);
  });

  it("returns false for adjacent days", () => {
    expect(isSameDay(new Date("2026-07-06T23:59:59"), new Date("2026-07-07T00:00:00"))).toBe(false);
  });
});

describe("toDateString", () => {
  it("returns YYYY-MM-DD", () => {
    expect(toDateString(new Date("2026-07-06T15:00:00"))).toBe("2026-07-06");
  });
});

describe("formatShortDate", () => {
  it("returns short weekday + day + month", () => {
    // 2026-07-06 is a Monday
    const result = formatShortDate(new Date("2026-07-06T12:00:00"));
    expect(result).toMatch(/Mon/i);
    expect(result).toMatch(/6/);
    expect(result).toMatch(/Jul/i);
  });
});
