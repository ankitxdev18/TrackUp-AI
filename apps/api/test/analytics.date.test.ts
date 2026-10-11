import { describe, expect, it } from "vitest";
import {
  derivePeriodBounds,
  getZonedStartOfDayUtc,
} from "../src/analytics/analytics.date.js";

describe("Analytics Date & Temporal Boundary Engine", () => {
  describe("getZonedStartOfDayUtc", () => {
    it("correctly converts UTC midnight", () => {
      const utc = getZonedStartOfDayUtc("2026-10-11", "UTC");
      expect(utc.toISOString()).toBe("2026-10-11T00:00:00.000Z");
    });

    it("correctly accounts for negative timezone offsets (EDT UTC-4)", () => {
      const ny = getZonedStartOfDayUtc("2026-10-11", "America/New_York");
      // 00:00:00 EDT on 2026-10-11 is 04:00:00 UTC
      expect(ny.toISOString()).toBe("2026-10-11T04:00:00.000Z");
    });

    it("correctly accounts for positive timezone offsets (IST UTC+5:30)", () => {
      const ist = getZonedStartOfDayUtc("2026-10-11", "Asia/Kolkata");
      // 00:00:00 IST on 2026-10-11 is 18:30:00 UTC on previous day
      expect(ist.toISOString()).toBe("2026-10-10T18:30:00.000Z");
    });

    it("handles leap day correctly (Feb 29 on leap year)", () => {
      const leap = getZonedStartOfDayUtc("2028-02-29", "UTC");
      expect(leap.toISOString()).toBe("2028-02-29T00:00:00.000Z");
    });

    it("rejects invalid calendar dates", () => {
      expect(() => getZonedStartOfDayUtc("2026-02-30", "UTC")).toThrow();
      expect(() => getZonedStartOfDayUtc("invalid-date", "UTC")).toThrow();
    });
  });

  describe("derivePeriodBounds", () => {
    const fixedToday = "2026-10-11";
    const tz = "America/New_York";

    it("computes exact 7-day bounds", () => {
      const bounds = derivePeriodBounds("7d", tz, fixedToday);

      expect(bounds.periodCode).toBe("7d");
      expect(bounds.daysCount).toBe(7);
      expect(bounds.endDate).toBe("2026-10-11");
      expect(bounds.startDate).toBe("2026-10-05");

      // Prior 7-day period immediately preceding
      expect(bounds.priorEndDate).toBe("2026-10-04");
      expect(bounds.priorStartDate).toBe("2026-09-28");

      // UTC boundary instants
      expect(bounds.currentStartUtc.toISOString()).toBe("2026-10-05T04:00:00.000Z");
      expect(bounds.currentEndUtc.toISOString()).toBe("2026-10-12T04:00:00.000Z");
      expect(bounds.priorStartUtc.toISOString()).toBe("2026-09-28T04:00:00.000Z");
      expect(bounds.priorEndUtc.toISOString()).toBe("2026-10-05T04:00:00.000Z");
    });

    it("computes exact 30-day bounds", () => {
      const bounds = derivePeriodBounds("30d", tz, fixedToday);

      expect(bounds.periodCode).toBe("30d");
      expect(bounds.daysCount).toBe(30);
      expect(bounds.endDate).toBe("2026-10-11");
      expect(bounds.startDate).toBe("2026-09-12");

      expect(bounds.priorEndDate).toBe("2026-09-11");
      expect(bounds.priorStartDate).toBe("2026-08-13");
    });

    it("computes month-to-date bounds", () => {
      const bounds = derivePeriodBounds("month", tz, fixedToday);

      expect(bounds.periodCode).toBe("month");
      expect(bounds.startDate).toBe("2026-10-01");
      expect(bounds.endDate).toBe("2026-10-11");
      expect(bounds.daysCount).toBe(11);

      expect(bounds.priorStartDate).toBe("2026-09-01");
      expect(bounds.priorEndDate).toBe("2026-09-11");
    });
  });
});
