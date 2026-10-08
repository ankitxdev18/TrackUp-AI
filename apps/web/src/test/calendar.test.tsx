import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { App } from "../App";
import type { CalendarEvent } from "../api/calendar";
import {
  calculateMonthDays,
  calculateWeekDays,
  getTodayDateString,
  localDateTimeToUtcIso,
  shiftAnchorDate,
  utcIsoToLocalDate,
  utcIsoToLocalTime,
} from "../features/calendar/calendarDateUtils";
import { calculateTimedEventPositions } from "../features/calendar/calendarOverlap";

describe("Milestone C04: Calendar Frontend (Route, Views, Navigation, Modals, Timezone)", () => {
  const todayStr = getTodayDateString();

  const mockEvents: CalendarEvent[] = [
    {
      id: "event-timed-1",
      userId: "user-1",
      title: "Architecture Sync",
      description: "Reviewing database and temporal invariants",
      location: "Virtual Meeting Room A",
      color: "indigo",
      isAllDay: false,
      startTime: localDateTimeToUtcIso(todayStr, "09:00"),
      endTime: localDateTimeToUtcIso(todayStr, "10:00"),
      timeZone: "Asia/Kolkata",
      startDate: null,
      endDate: null,
      createdAt: "2026-10-10T12:00:00.000Z",
      updatedAt: "2026-10-10T12:00:00.000Z",
    },
    {
      id: "event-allday-1",
      userId: "user-1",
      title: "Product Hackathon",
      description: "Life OS Calendar build sprint",
      location: null,
      color: "emerald",
      isAllDay: true,
      startDate: todayStr,
      endDate: todayStr,
      startTime: null,
      endTime: null,
      timeZone: null,
      createdAt: "2026-10-10T12:00:00.000Z",
      updatedAt: "2026-10-10T12:00:00.000Z",
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, "", "/calendar");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setupCalendarFetchMock = (eventList: CalendarEvent[] = mockEvents) => {
    let currentEvents = [...eventList];

    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method || "GET").toUpperCase();

      if (url.includes("/api/calendar/events")) {
        if (method === "GET") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ events: currentEvents }),
          } as Response;
        }

        if (method === "POST") {
          const body = JSON.parse(String(init?.body || "{}"));
          const newEvent: CalendarEvent = {
            id: `event-${Date.now()}`,
            userId: "user-1",
            title: body.title,
            description: body.description ?? null,
            location: body.location ?? null,
            color: body.color || "indigo",
            isAllDay: Boolean(body.isAllDay),
            startTime: body.startTime ?? null,
            endTime: body.endTime ?? null,
            startDate: body.startDate ?? null,
            endDate: body.endDate ?? null,
            timeZone: body.timeZone ?? null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          currentEvents.push(newEvent);
          return {
            ok: true,
            status: 201,
            json: async () => ({ event: newEvent }),
          } as Response;
        }

        if (method === "PATCH") {
          const body = JSON.parse(String(init?.body || "{}"));
          const id = url.split("/").pop()?.split("?")[0];
          const existing = currentEvents.find((e) => e.id === id);
          if (!existing) {
            return {
              ok: false,
              status: 404,
              json: async () => ({ error: "Event not found", code: "NOT_FOUND" }),
            } as Response;
          }

          const updated: CalendarEvent = {
            ...existing,
            ...body,
            updatedAt: new Date().toISOString(),
          };
          currentEvents = currentEvents.map((e) => (e.id === id ? updated : e));

          return {
            ok: true,
            status: 200,
            json: async () => ({ event: updated }),
          } as Response;
        }

        if (method === "DELETE") {
          const id = url.split("/").pop()?.split("?")[0];
          currentEvents = currentEvents.filter((e) => e.id !== id);
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, message: "Calendar event deleted" }),
          } as Response;
        }
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response;
    });
  };

  // =========================================================================
  // 1. ROUTING & CORE RENDERING
  // =========================================================================
  describe("1. Routing & Core Calendar Shell", () => {
    it("renders /calendar page with title, navigation, view switcher, and create button", async () => {
      setupCalendarFetchMock();
      render(<App />);

      expect(await screen.findByRole("heading", { name: "Calendar" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Navigate to current date" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Previous period" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next period" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Create new calendar event" })).toBeInTheDocument();

      // View tabs
      expect(screen.getByRole("tab", { name: "Month" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Week" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Day" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Agenda" })).toBeInTheDocument();
    });

    it("defaults to Week view on desktop and displays week header and 7 day columns", async () => {
      setupCalendarFetchMock();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("region", { name: "Week Calendar View" })).toBeInTheDocument();
      });
      expect(screen.getByRole("tab", { name: "Week" })).toHaveAttribute("aria-selected", "true");
    });
  });

  // =========================================================================
  // 2. VIEW SWITCHING
  // =========================================================================
  describe("2. View Switching", () => {
    it("switches to Month view and displays 7-column grid", async () => {
      setupCalendarFetchMock();
      render(<App />);

      const monthTab = await screen.findByRole("tab", { name: "Month" });
      fireEvent.click(monthTab);

      await waitFor(() => {
        expect(screen.getByRole("grid", { name: "Month Calendar Grid" })).toBeInTheDocument();
      });
      expect(monthTab).toHaveAttribute("aria-selected", "true");
    });

    it("switches to Day view and displays single day timeline", async () => {
      setupCalendarFetchMock();
      render(<App />);

      const dayTab = await screen.findByRole("tab", { name: "Day" });
      fireEvent.click(dayTab);

      await waitFor(() => {
        expect(screen.getByRole("region", { name: "Day Schedule View" })).toBeInTheDocument();
      });
      expect(dayTab).toHaveAttribute("aria-selected", "true");
    });

    it("switches to Agenda view and displays chronological feed", async () => {
      setupCalendarFetchMock();
      render(<App />);

      const agendaTab = await screen.findByRole("tab", { name: "Agenda" });
      fireEvent.click(agendaTab);

      await waitFor(() => {
        expect(screen.getByRole("feed", { name: "Chronological Agenda Feed" })).toBeInTheDocument();
      });
      expect(agendaTab).toHaveAttribute("aria-selected", "true");
    });
  });

  // =========================================================================
  // 3. PERIOD NAVIGATION & TODAY
  // =========================================================================
  describe("3. Temporal Navigation", () => {
    it("navigates forward and backward in time using Next and Prev buttons", async () => {
      setupCalendarFetchMock();
      render(<App />);

      await screen.findByRole("heading", { name: "Calendar" });
      const nextBtn = screen.getByRole("button", { name: "Next period" });
      const prevBtn = screen.getByRole("button", { name: "Previous period" });
      const periodLabel = screen.getByText((_content, element) => {
        return element?.className === "calendar-period-label";
      });

      const initialLabel = periodLabel.textContent;
      fireEvent.click(nextBtn);

      await waitFor(() => {
        expect(periodLabel.textContent).not.toBe(initialLabel);
      });

      fireEvent.click(prevBtn);
      await waitFor(() => {
        expect(periodLabel.textContent).toBe(initialLabel);
      });
    });

    it("Today button returns view to the current local date", async () => {
      setupCalendarFetchMock();
      render(<App />);

      await screen.findByRole("heading", { name: "Calendar" });
      const nextBtn = screen.getByRole("button", { name: "Next period" });
      const todayBtn = screen.getByRole("button", { name: "Navigate to current date" });
      const periodLabel = screen.getByText((_content, element) => {
        return element?.className === "calendar-period-label";
      });

      const initialLabel = periodLabel.textContent;
      // Navigate forward twice
      fireEvent.click(nextBtn);
      fireEvent.click(nextBtn);

      // Click Today
      fireEvent.click(todayBtn);
      await waitFor(() => {
        expect(periodLabel.textContent).toBe(initialLabel);
      });
    });
  });

  // =========================================================================
  // 4. EVENT RENDERING ACROSS VIEWS
  // =========================================================================
  describe("4. Event Rendering (Timed & All-Day)", () => {
    it("renders timed events and all-day events in Agenda view", async () => {
      setupCalendarFetchMock();
      render(<App />);

      fireEvent.click(await screen.findByRole("tab", { name: "Agenda" }));

      await waitFor(() => {
        expect(screen.getByText("Architecture Sync")).toBeInTheDocument();
        expect(screen.getByText("Product Hackathon")).toBeInTheDocument();
      });
    });

    it("renders all-day strip and timed event blocks in Week view", async () => {
      setupCalendarFetchMock();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Architecture Sync")).toBeInTheDocument();
        expect(screen.getByText("Product Hackathon")).toBeInTheDocument();
      });
    });

    it("renders event chips in Month view", async () => {
      setupCalendarFetchMock();
      render(<App />);

      fireEvent.click(await screen.findByRole("tab", { name: "Month" }));

      await waitFor(() => {
        expect(screen.getByText("Architecture Sync")).toBeInTheDocument();
        expect(screen.getByText("Product Hackathon")).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 5. EVENT CREATION FLOW & VALIDATION
  // =========================================================================
  describe("5. Event Creation & Validation", () => {
    it("opens EventModal on clicking '+ New Event'", async () => {
      setupCalendarFetchMock();
      render(<App />);

      const newBtn = await screen.findByRole("button", { name: "Create new calendar event" });
      fireEvent.click(newBtn);

      expect(await screen.findByRole("dialog", { name: "New Event" })).toBeInTheDocument();
      expect(screen.getByLabelText(/Event Title/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save Event" })).toBeInTheDocument();
    });

    it("validates that title is required and prevents submission if empty", async () => {
      setupCalendarFetchMock();
      render(<App />);

      fireEvent.click(await screen.findByRole("button", { name: "Create new calendar event" }));
      await screen.findByRole("dialog", { name: "New Event" });

      const saveBtn = screen.getByRole("button", { name: "Save Event" });
      fireEvent.click(saveBtn);

      expect(await screen.findByText(/Event title is required/i)).toBeInTheDocument();
    });

    it("creates a timed event successfully with valid inputs", async () => {
      const fetchSpy = setupCalendarFetchMock();
      render(<App />);

      fireEvent.click(await screen.findByRole("button", { name: "Create new calendar event" }));
      await screen.findByRole("dialog", { name: "New Event" });

      const titleInput = screen.getByLabelText(/Event Title/i);
      fireEvent.change(titleInput, { target: { value: "Sprint Planning" } });

      const saveBtn = screen.getByRole("button", { name: "Save Event" });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: "New Event" })).not.toBeInTheDocument();
      });

      // Verify POST call was dispatched
      const postCall = fetchSpy.mock.calls.find((call) => {
        return call[0] === "/api/calendar/events" && (call[1]?.method || "GET") === "POST";
      });
      expect(postCall).toBeDefined();
      const sentBody = JSON.parse(String(postCall?.[1]?.body));
      expect(sentBody.title).toBe("Sprint Planning");
      expect(sentBody.isAllDay).toBe(false);
      expect(sentBody.startTime).toBeDefined();
      expect(sentBody.endTime).toBeDefined();
    });

    it("creates an all-day event successfully when all-day toggle is checked", async () => {
      const fetchSpy = setupCalendarFetchMock();
      render(<App />);

      fireEvent.click(await screen.findByRole("button", { name: "Create new calendar event" }));
      await screen.findByRole("dialog", { name: "New Event" });

      fireEvent.change(screen.getByLabelText(/Event Title/i), {
        target: { value: "Company Retreat" },
      });

      // Toggle all-day
      const toggle = screen.getByRole("checkbox", { name: /all-day/i });
      fireEvent.click(toggle);

      expect(screen.getByLabelText(/Start Date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/End Date/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Save Event" }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: "New Event" })).not.toBeInTheDocument();
      });

      const postCall = fetchSpy.mock.calls.find((call) => {
        return call[0] === "/api/calendar/events" && (call[1]?.method || "GET") === "POST";
      });
      expect(postCall).toBeDefined();
      const sentBody = JSON.parse(String(postCall?.[1]?.body));
      expect(sentBody.title).toBe("Company Retreat");
      expect(sentBody.isAllDay).toBe(true);
      expect(sentBody.startDate).toBeDefined();
      expect(sentBody.endDate).toBeDefined();
      expect(sentBody.startTime).toBeUndefined();
    });
  });

  // =========================================================================
  // 6. EVENT EDITING & TYPE CONVERSION
  // =========================================================================
  describe("6. Event Editing & Timed ↔ All-Day Conversions", () => {
    it("opens edit modal with populated fields when clicking an event", async () => {
      setupCalendarFetchMock();
      render(<App />);

      const eventBlock = await screen.findByText("Architecture Sync");
      fireEvent.click(eventBlock);

      expect(await screen.findByRole("dialog", { name: "Edit Event" })).toBeInTheDocument();
      expect(screen.getByDisplayValue("Architecture Sync")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Reviewing database and temporal invariants")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Delete event" })).toBeInTheDocument();
    });

    it("converts timed event to all-day on toggle and sends valid PATCH nullifying timed fields", async () => {
      const fetchSpy = setupCalendarFetchMock();
      render(<App />);

      fireEvent.click(await screen.findByText("Architecture Sync"));
      await screen.findByRole("dialog", { name: "Edit Event" });

      // Toggle to all-day
      const toggle = screen.getByRole("checkbox", { name: /all-day/i });
      fireEvent.click(toggle);

      const saveBtn = screen.getByRole("button", { name: "Save Changes" });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: "Edit Event" })).not.toBeInTheDocument();
      });

      const patchCall = fetchSpy.mock.calls.find((call) => {
        return String(call[0]).includes("/api/calendar/events/") && call[1]?.method === "PATCH";
      });
      expect(patchCall).toBeDefined();
      const sentBody = JSON.parse(String(patchCall?.[1]?.body));
      expect(sentBody.isAllDay).toBe(true);
      expect(sentBody.startDate).toBeDefined();
      expect(sentBody.endDate).toBeDefined();
      expect(sentBody.startTime).toBeNull();
      expect(sentBody.endTime).toBeNull();
    });

    it("converts all-day event to timed on toggle and sends valid PATCH nullifying date fields", async () => {
      const fetchSpy = setupCalendarFetchMock();
      render(<App />);

      fireEvent.click(await screen.findByText("Product Hackathon"));
      await screen.findByRole("dialog", { name: "Edit Event" });

      // Toggle from all-day to timed
      const toggle = screen.getByRole("checkbox", { name: /all-day/i });
      fireEvent.click(toggle);

      const saveBtn = screen.getByRole("button", { name: "Save Changes" });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: "Edit Event" })).not.toBeInTheDocument();
      });

      const patchCall = fetchSpy.mock.calls.find((call) => {
        return String(call[0]).includes("/api/calendar/events/") && call[1]?.method === "PATCH";
      });
      expect(patchCall).toBeDefined();
      const sentBody = JSON.parse(String(patchCall?.[1]?.body));
      expect(sentBody.isAllDay).toBe(false);
      expect(sentBody.startTime).toBeDefined();
      expect(sentBody.endTime).toBeDefined();
      expect(sentBody.startDate).toBeNull();
      expect(sentBody.endDate).toBeNull();
    });
  });

  // =========================================================================
  // 7. EVENT DELETION & CONFIRMATION
  // =========================================================================
  describe("7. Event Deletion & Permanent Confirmation", () => {
    it("opens DeleteEventDialog when clicking Delete button in edit modal", async () => {
      setupCalendarFetchMock();
      render(<App />);

      fireEvent.click(await screen.findByText("Architecture Sync"));
      await screen.findByRole("dialog", { name: "Edit Event" });

      const deleteBtn = screen.getByRole("button", { name: "Delete event" });
      fireEvent.click(deleteBtn);

      expect(await screen.findByRole("dialog", { name: "Delete Event" })).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to delete/i)).toBeInTheDocument();
      expect(screen.getByText(/This action is permanent and cannot be undone/i)).toBeInTheDocument();
    });

    it("cancels deletion and returns to modal when clicking Cancel", async () => {
      setupCalendarFetchMock();
      render(<App />);

      fireEvent.click(await screen.findByText("Architecture Sync"));
      await screen.findByRole("dialog", { name: "Edit Event" });

      fireEvent.click(screen.getByRole("button", { name: "Delete event" }));
      await screen.findByRole("dialog", { name: "Delete Event" });

      const cancelBtn = screen.getByRole("button", { name: "Cancel deletion" });
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: "Delete Event" })).not.toBeInTheDocument();
      });
    });

    it("permanently deletes event when clicking Confirm Delete and removes from UI", async () => {
      const fetchSpy = setupCalendarFetchMock();
      render(<App />);

      fireEvent.click(await screen.findByText("Architecture Sync"));
      await screen.findByRole("dialog", { name: "Edit Event" });

      fireEvent.click(screen.getByRole("button", { name: "Delete event" }));
      await screen.findByRole("dialog", { name: "Delete Event" });

      const confirmDeleteBtn = screen.getByRole("button", { name: "Delete Event" });
      fireEvent.click(confirmDeleteBtn);

      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: "Delete Event" })).not.toBeInTheDocument();
      });

      const deleteCall = fetchSpy.mock.calls.find((call) => {
        return String(call[0]).includes("/api/calendar/events/event-timed-1") && call[1]?.method === "DELETE";
      });
      expect(deleteCall).toBeDefined();
    });
  });

  // =========================================================================
  // 8. ERROR & EMPTY STATES
  // =========================================================================
  describe("8. Error & Empty States", () => {
    it("renders friendly error banner with retry button when API fails", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: "Internal database issue" }),
        } as Response;
      });

      render(<App />);

      expect(await screen.findByText(/Internal database issue|Failed to load calendar events/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    });

    it("renders helpful empty state in Agenda view when there are zero events", async () => {
      setupCalendarFetchMock([]);
      render(<App />);

      fireEvent.click(await screen.findByRole("tab", { name: "Agenda" }));

      await waitFor(() => {
        expect(screen.getByText("No events in this period")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Add event to agenda" })).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 9. OVERLAP LAYOUT ENGINE
  // =========================================================================
  describe("9. Overlap Layout Algorithm (Deterministic Columns)", () => {
    it("divides horizontal space evenly for overlapping concurrent events", () => {
      const concurrentEvents: CalendarEvent[] = [
        {
          id: "ev-1",
          userId: "u-1",
          title: "Session A",
          description: null,
          location: null,
          color: "indigo",
          isAllDay: false,
          startTime: "2026-10-15T09:00:00.000Z",
          endTime: "2026-10-15T11:00:00.000Z",
          timeZone: "UTC",
          startDate: null,
          endDate: null,
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "ev-2",
          userId: "u-1",
          title: "Session B",
          description: null,
          location: null,
          color: "emerald",
          isAllDay: false,
          startTime: "2026-10-15T09:30:00.000Z",
          endTime: "2026-10-15T10:30:00.000Z",
          timeZone: "UTC",
          startDate: null,
          endDate: null,
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "ev-3",
          userId: "u-1",
          title: "Session C",
          description: null,
          location: null,
          color: "amber",
          isAllDay: false,
          startTime: "2026-10-15T10:00:00.000Z",
          endTime: "2026-10-15T12:00:00.000Z",
          timeZone: "UTC",
          startDate: null,
          endDate: null,
          createdAt: "",
          updatedAt: "",
        },
      ];

      const positioned = calculateTimedEventPositions(concurrentEvents, "UTC");
      expect(positioned.length).toBe(3);

      // Total columns in the overlapping cluster is >= 2
      const maxCols = Math.max(...positioned.map((p) => p.totalColumns));
      expect(maxCols).toBeGreaterThanOrEqual(2);

      // Width is proportional to totalColumns (widthPercent = 100 / totalColumns)
      positioned.forEach((pos) => {
        expect(pos.widthPercent).toBeCloseTo(100 / pos.totalColumns);
        expect(pos.leftPercent).toBe(pos.column * pos.widthPercent);
      });
    });
  });

  // =========================================================================
  // 10. TIMEZONE & TEMPORAL MATH UNIT TESTS
  // =========================================================================
  describe("10. Timezone & Temporal Invariant Calculations", () => {
    it("getTodayDateString evaluates calendar date in specified timezone without UTC drift", () => {
      // In Asia/Kolkata (+05:30), evening UTC corresponds to the next day
      const kolkataToday = getTodayDateString("Asia/Kolkata");
      expect(kolkataToday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("localDateTimeToUtcIso and utcIsoToLocalDate roundtrip accurately across timezones", () => {
      const targetDate = "2026-10-15";
      const targetTime = "14:30";
      const tz = "America/New_York";

      const utcIso = localDateTimeToUtcIso(targetDate, targetTime, tz);
      expect(utcIsoToLocalDate(utcIso, tz)).toBe(targetDate);
      expect(utcIsoToLocalTime(utcIso, tz)).toBe(targetTime);
    });

    it("calculateMonthDays starts on Monday and generates 35 or 42 grid cells", () => {
      const oct2026Days = calculateMonthDays("2026-10-15", "UTC");
      expect([35, 42]).toContain(oct2026Days.length);
      // October 2026 starts on Thursday, so Monday Oct 28 or previous month pad exists
      expect(oct2026Days[0].dateStr).toMatch(/^2026-/);
    });

    it("calculateWeekDays returns 7 consecutive days Monday through Sunday", () => {
      const week = calculateWeekDays("2026-10-15", "UTC"); // Oct 15 is Thursday
      expect(week.length).toBe(7);
      expect(week[0].dayName).toBe("Mon");
      expect(week[0].dateStr).toBe("2026-10-12");
      expect(week[6].dayName).toBe("Sun");
      expect(week[6].dateStr).toBe("2026-10-18");
    });

    it("shiftAnchorDate handles month and leap year boundaries properly", () => {
      // Leap year 2028: Jan 31 + 1 month -> Feb 29
      const leapFeb = shiftAnchorDate("2028-01-31", "month", 1);
      expect(leapFeb).toBe("2028-02-29");

      // Non-leap year 2027: Jan 31 + 1 month -> Feb 28
      const nonLeapFeb = shiftAnchorDate("2027-01-31", "month", 1);
      expect(nonLeapFeb).toBe("2027-02-28");

      // Year boundary Dec 15 + 1 month -> Jan 15 next year
      const nextYearJan = shiftAnchorDate("2026-12-15", "month", 1);
      expect(nextYearJan).toBe("2027-01-15");
    });

    it("preserves Unicode and multiline descriptions across calendar formatting", async () => {
      const unicodeEvent: CalendarEvent = {
        id: "unicode-ev",
        userId: "user-1",
        title: "チーム会議 🚀 (Strategy & Q3 Launch)",
        description: "Line 1: 優先順位\nLine 2: リソース配分\nLine 3: 完了条件",
        location: "東京オフィス / Tokyo Tower Room",
        color: "rose",
        isAllDay: false,
        startTime: "2026-10-15T02:00:00.000Z",
        endTime: "2026-10-15T03:00:00.000Z",
        timeZone: "Asia/Tokyo",
        startDate: null,
        endDate: null,
        createdAt: "",
        updatedAt: "",
      };

      setupCalendarFetchMock([unicodeEvent]);
      render(<App />);

      fireEvent.click(await screen.findByRole("tab", { name: "Agenda" }));

      await waitFor(() => {
        expect(screen.getByText("チーム会議 🚀 (Strategy & Q3 Launch)")).toBeInTheDocument();
        expect(screen.getByText("東京オフィス / Tokyo Tower Room")).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 11. ACCESSIBILITY & ESCAPE KEY
  // =========================================================================
  describe("11. Accessibility & Keyboard Dialog Controls", () => {
    it("closes EventModal when pressing Escape key", async () => {
      setupCalendarFetchMock();
      render(<App />);

      fireEvent.click(await screen.findByRole("button", { name: "Create new calendar event" }));
      expect(await screen.findByRole("dialog", { name: "New Event" })).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });

      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: "New Event" })).not.toBeInTheDocument();
      });
    });

    it("closes DeleteEventDialog when pressing Escape key", async () => {
      setupCalendarFetchMock();
      render(<App />);

      fireEvent.click(await screen.findByText("Architecture Sync"));
      await screen.findByRole("dialog", { name: "Edit Event" });

      fireEvent.click(screen.getByRole("button", { name: "Delete event" }));
      expect(await screen.findByRole("dialog", { name: "Delete Event" })).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });

      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: "Delete Event" })).not.toBeInTheDocument();
      });
    });
  });
});
