import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { CalendarEvent } from "../api/calendar";
import {
  addCalendarDays,
  calculateMonthDays,
  getMinutesFromDayStart,
  getTemporalBoundsForView,
  getTodayDateString,
  utcIsoToLocalTime,
} from "../features/calendar/calendarDateUtils";
import { calculateTimedEventPositions } from "../features/calendar/calendarOverlap";
import { EventModal } from "../features/calendar/EventModal";
import { AgendaView } from "../features/calendar/AgendaView";

describe("Milestone C06: Calendar Production Hardening & Security Audit Test Suite", () => {
  const todayStr = getTodayDateString();

  describe("1. XSS & Content Safety Audit", () => {
    it("renders malicious script and HTML tags safely as plain text in views without executing", () => {
      const maliciousEvent: CalendarEvent = {
        id: "evt-xss-1",
        userId: "user-1",
        title: "<script>alert('xss-title')</script><img src=x onerror=alert('xss')>",
        description: "<b onmouseover=alert('xss-desc')>Exploit Description</b>",
        location: "<iframe src='javascript:alert(1)'></iframe>",
        color: "indigo",
        isAllDay: false,
        startDate: null,
        endDate: null,
        startTime: `${todayStr}T10:00:00.000Z`,
        endTime: `${todayStr}T11:00:00.000Z`,
        timeZone: "UTC",
        createdAt: "2026-10-08T00:00:00.000Z",
        updatedAt: "2026-10-08T00:00:00.000Z",
      };

      render(
        <AgendaView
          events={[maliciousEvent]}
          timeZone="UTC"
          onSelectEvent={vi.fn()}
          onCreateEvent={vi.fn()}
        />
      );

      // Verify title is rendered safely as pure text content
      expect(
        screen.getByText("<script>alert('xss-title')</script><img src=x onerror=alert('xss')>")
      ).toBeInTheDocument();

      // Verify location is rendered safely as pure text content
      expect(
        screen.getByText("<iframe src='javascript:alert(1)'></iframe>")
      ).toBeInTheDocument();

      // Verify no executable HTML or iframe was injected into the DOM
      expect(document.querySelector("script[src='x']")).toBeNull();
      expect(document.querySelector("iframe")).toBeNull();
    });
  });

  describe("2. Concurrency & Double-Submission Guards", () => {
    it("prevents double-clicking save button from issuing duplicate save requests", async () => {
      let saveCount = 0;
      let resolveSave: () => void;
      const savePromise = new Promise<void>((resolve) => {
        resolveSave = resolve;
      });

      const mockSave = vi.fn().mockImplementation(async () => {
        saveCount++;
        await savePromise;
      });

      render(
        <EventModal
          isOpen={true}
          eventToEdit={null}
          initialDate={todayStr}
          initialTime="09:00"
          timeZone="UTC"
          onClose={vi.fn()}
          onSave={mockSave}
        />
      );

      const titleInput = screen.getByLabelText(/Event Title/i);
      fireEvent.change(titleInput, { target: { value: "Rapid Save Event" } });

      const submitBtn = screen.getByRole("button", { name: "Save Event" });

      // Rapidly click Save multiple times
      fireEvent.click(submitBtn);
      fireEvent.click(submitBtn);
      fireEvent.click(submitBtn);

      // Guard strictly prevents duplicate calls while save is in-flight
      expect(saveCount).toBe(1);

      // Resolve the in-flight promise
      resolveSave!();
      await waitFor(() => {
        expect(mockSave).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("3. Temporal & Timezone Audit (UTC, Asia/Kolkata, America/New_York, Europe/London)", () => {
    it("handles Europe/London across DST transition (October GMT shift)", () => {
      const londonTz = "Europe/London";
      const preDstDate = "2026-10-24";
      const boundsPre = getTemporalBoundsForView("day", preDstDate, londonTz);

      // British Summer Time (BST) is UTC+1 in October
      expect(boundsPre.startIso).toBe("2026-10-23T23:00:00.000Z"); // 00:00 BST = 23:00 UTC previous day
      expect(boundsPre.endIso).toBe("2026-10-24T23:00:00.000Z");

      // GMT shift in late October
      const postDstDate = "2026-10-26";
      const boundsPost = getTemporalBoundsForView("day", postDstDate, londonTz);
      // GMT is UTC+0
      expect(boundsPost.startIso).toBe("2026-10-26T00:00:00.000Z");
      expect(boundsPost.endIso).toBe("2026-10-27T00:00:00.000Z");
    });

    it("correctly calculates leap day (2024-02-29) in month grid and day calculations", () => {
      const feb2024Grid = calculateMonthDays("2024-02-15", "UTC");
      const feb29Cell = feb2024Grid.find((cell) => cell.dateStr === "2024-02-29");
      expect(feb29Cell).toBeDefined();
      expect(feb29Cell?.dayNumber).toBe(29);
      expect(feb29Cell?.isCurrentMonth).toBe(true);

      const nextDay = addCalendarDays("2024-02-29", 1);
      expect(nextDay).toBe("2024-03-01");
    });

    it("correctly handles year boundaries (2024-12-31 to 2025-01-01)", () => {
      const nextDay = addCalendarDays("2024-12-31", 1);
      expect(nextDay).toBe("2025-01-01");

      const prevDay = addCalendarDays("2025-01-01", -1);
      expect(prevDay).toBe("2024-12-31");
    });

    it("formats midnight and late-night timestamps correctly across timezones", () => {
      // Midnight in UTC: 2026-10-08T00:00:00.000Z
      const midnightUtc = "2026-10-08T00:00:00.000Z";
      expect(utcIsoToLocalTime(midnightUtc, "UTC")).toBe("00:00");
      expect(getMinutesFromDayStart(midnightUtc, "UTC")).toBe(0);

      // In Asia/Kolkata (UTC+5:30), 00:00 UTC is 05:30 local time
      expect(utcIsoToLocalTime(midnightUtc, "Asia/Kolkata")).toBe("05:30");
      expect(getMinutesFromDayStart(midnightUtc, "Asia/Kolkata")).toBe(330);

      // In America/New_York (EDT UTC-4), 00:00 UTC is 20:00 previous day
      expect(utcIsoToLocalTime(midnightUtc, "America/New_York")).toBe("20:00");
    });
  });

  describe("4. Overlapping Events Layout Geometry Audit", () => {
    it("correctly clusters overlapping intervals into deterministic columns", () => {
      const events: CalendarEvent[] = [
        {
          id: "evt-1",
          userId: "user-1",
          title: "Event 1",
          color: "indigo",
          isAllDay: false,
          startTime: "2026-10-08T09:00:00.000Z",
          endTime: "2026-10-08T10:30:00.000Z",
          timeZone: "UTC",
          startDate: null,
          endDate: null,
          description: null,
          location: null,
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "evt-2",
          userId: "user-1",
          title: "Event 2",
          color: "emerald",
          isAllDay: false,
          startTime: "2026-10-08T09:30:00.000Z",
          endTime: "2026-10-08T11:00:00.000Z",
          timeZone: "UTC",
          startDate: null,
          endDate: null,
          description: null,
          location: null,
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "evt-3",
          userId: "user-1",
          title: "Event 3",
          color: "rose",
          isAllDay: false,
          startTime: "2026-10-08T10:00:00.000Z",
          endTime: "2026-10-08T11:30:00.000Z",
          timeZone: "UTC",
          startDate: null,
          endDate: null,
          description: null,
          location: null,
          createdAt: "",
          updatedAt: "",
        },
      ];

      const positioned = calculateTimedEventPositions(events, "UTC");
      expect(positioned.length).toBe(3);

      // All 3 overlap simultaneously around 10:00–10:30, so cluster allocates 3 columns
      const totalColumns = positioned[0].totalColumns;
      expect(totalColumns).toBe(3);

      // Each event gets a distinct column (0, 1, 2)
      const columnIndices = positioned.map((p) => p.column).sort();
      expect(columnIndices).toEqual([0, 1, 2]);

      // Each event receives fractional width (33.33%) and non-overlapping horizontal offset
      expect(positioned[0].widthPercent).toBeCloseTo(100 / 3, 1);
    });
  });
});
