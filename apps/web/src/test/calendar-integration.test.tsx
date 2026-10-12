import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { App } from "../App";
import type { CalendarEvent } from "../api/calendar";
import { getTemporalBoundsForView, getTodayDateString } from "../features/calendar/calendarDateUtils";

describe("Milestone C05: Calendar Product Integration (Navigation, Breadcrumbs, Dashboard Widget, Fault Isolation)", () => {
  const todayStr = getTodayDateString();

  const mockAllDayEvent: CalendarEvent = {
    id: "evt-allday-1",
    userId: "user-1",
    title: "Quarterly Strategy Review",
    description: "All-day strategic retreat",
    location: "Main Boardroom",
    color: "indigo",
    isAllDay: true,
    startDate: todayStr,
    endDate: todayStr,
    startTime: null,
    endTime: null,
    timeZone: null,
    createdAt: "2026-10-08T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z",
  };

  const mockEarlyTimedEvent: CalendarEvent = {
    id: "evt-timed-early",
    userId: "user-1",
    title: "Morning Standup",
    description: null,
    location: "Google Meet",
    color: "emerald",
    isAllDay: false,
    startDate: null,
    endDate: null,
    startTime: `${todayStr}T09:00:00.000Z`,
    endTime: `${todayStr}T09:30:00.000Z`,
    timeZone: "UTC",
    createdAt: "2026-10-08T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z",
  };

  const mockLateTimedEvent: CalendarEvent = {
    id: "evt-timed-late",
    userId: "user-1",
    title: "Architecture Deep Dive",
    description: "System design review",
    location: null,
    color: "amber",
    isAllDay: false,
    startDate: null,
    endDate: null,
    startTime: `${todayStr}T14:00:00.000Z`,
    endTime: `${todayStr}T15:30:00.000Z`,
    timeZone: "UTC",
    createdAt: "2026-10-08T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z",
  };

  let calendarEventsData: CalendarEvent[] = [];
  let calendarFail = false;

  beforeEach(() => {
    vi.restoreAllMocks();
    calendarEventsData = [mockLateTimedEvent, mockAllDayEvent, mockEarlyTimedEvent];
    calendarFail = false;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (urlInput: string) => {
        const url = String(urlInput);

        // Auth
        if (url.includes("/api/auth/me")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              user: { id: "user-1", name: "Alex Mercer", email: "alex@example.com" },
            }),
          };
        }

        // Calendar Events
        if (url.includes("/api/calendar/events")) {
          if (calendarFail) {
            return {
              ok: false,
              status: 500,
              json: async () => ({ error: "Internal Server Error", code: "INTERNAL_ERROR" }),
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ events: calendarEventsData }),
          };
        }

        // Tasks
        if (url.includes("/api/tasks")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              tasks: [
                {
                  id: "t-1",
                  userId: "user-1",
                  title: "Focus Task 1",
                  status: "TODO",
                  priority: "HIGH",
                  dueDate: todayStr,
                  completedAt: null,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ],
            }),
          };
        }

        // Habits
        if (url.includes("/api/habits")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ habits: [] }),
          };
        }

        // Projects
        if (url.includes("/api/projects")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ projects: [] }),
          };
        }

        // Goals
        if (url.includes("/api/goals")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ goals: [] }),
          };
        }

        // Journal
        if (url.includes("/api/journal")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entry: null }),
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        };
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Desktop Sidebar Navigation & Breadcrumb", () => {
    it("renders Calendar in desktop sidebar in exact position immediately after Dashboard", async () => {
      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      const navItems = Array.from(
        document.querySelectorAll(".shell-sidebar .nav-item")
      );
      const navHrefs = navItems.map((el) => el.getAttribute("href"));

      expect(navHrefs[0]).toBe("/dashboard");
      expect(navHrefs[1]).toBe("/calendar");
      expect(navHrefs[2]).toBe("/tasks");
      expect(navHrefs[3]).toBe("/projects");
      expect(navHrefs[4]).toBe("/goals");
      expect(navHrefs[5]).toBe("/habits");
      expect(navHrefs[6]).toBe("/journal");
      expect(navHrefs[7]).toBe("/ideas");
    });

    it("highlights Calendar link as active when on /calendar route", async () => {
      window.history.pushState({}, "", "/calendar");
      render(<App />);

      const sidebarCalendarLink = document.querySelector(".shell-sidebar .nav-item[href='/calendar']");
      expect(sidebarCalendarLink).toBeInTheDocument();
      expect(sidebarCalendarLink).toHaveClass("active");
      expect(sidebarCalendarLink).toHaveAttribute("aria-current", "page");
    });

    it("displays correct header title on /calendar", async () => {
      window.history.pushState({}, "", "/calendar");
      render(<App />);

      expect(screen.getByText("Calendar", { selector: ".breadcrumb-current" })).toBeInTheDocument();
    });

    it("navigates to /calendar on clicking desktop sidebar Calendar link", async () => {
      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      const sidebarCalendarLink = document.querySelector(".shell-sidebar .nav-item[href='/calendar']");
      expect(sidebarCalendarLink).toBeInTheDocument();
      fireEvent.click(sidebarCalendarLink!);

      expect(window.location.pathname).toBe("/calendar");
      await screen.findByRole("heading", { name: "Calendar" });
    });
  });

  describe("2. Mobile More Drawer Navigation", () => {
    it("preserves persistent 5-item mobile bottom navigation without Calendar", async () => {
      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      const mobileNav = document.querySelector(".mobile-nav");
      expect(mobileNav).toBeInTheDocument();
      expect(mobileNav?.children.length).toBe(5);

      const bottomLinks = Array.from(mobileNav?.children || []).map((el) =>
        el.getAttribute("href") || el.getAttribute("aria-label")
      );
      expect(bottomLinks).toContain("/dashboard");
      expect(bottomLinks).toContain("/tasks");
      expect(bottomLinks).toContain("/goals");
      expect(bottomLinks).toContain("/projects");
      expect(bottomLinks).toContain("More navigation");
      expect(bottomLinks).not.toContain("/calendar");
    });

    it("provides Calendar in mobile More drawer and navigates to /calendar", async () => {
      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      const moreBtn = screen.getAllByRole("button", { name: /More navigation/i })[0];
      fireEvent.click(moreBtn);

      expect(screen.getByText("Navigation & Account")).toBeInTheDocument();
      const drawerCalendarLink = document.querySelector(".more-drawer-nav .drawer-nav-item[href='/calendar']");
      expect(drawerCalendarLink).toBeInTheDocument();
      expect(drawerCalendarLink).toHaveTextContent("Calendar");

      fireEvent.click(drawerCalendarLink!);
      expect(window.location.pathname).toBe("/calendar");
      expect(screen.queryByText("Navigation & Account")).not.toBeInTheDocument();
    });
  });

  describe("3. Dashboard Today's Schedule Widget", () => {
    it("renders Today's Schedule panel on the Dashboard with heading and counter", async () => {
      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Today's Schedule" })).toBeInTheDocument();
      });

      // Shows counter badge for 3 events
      expect(screen.getByText("3", { selector: ".panel-counter-badge" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "View calendar" })).toBeInTheDocument();
    });

    it("orders events with all-day events first, then timed events chronologically", async () => {
      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Quarterly Strategy Review")).toBeInTheDocument();
      });

      const scheduleItems = document.querySelectorAll(".dash-schedule-item");
      expect(scheduleItems.length).toBe(3);

      // Item 1: All-day event
      expect(scheduleItems[0]).toHaveTextContent("Quarterly Strategy Review");
      expect(scheduleItems[0]).toHaveTextContent("All Day");

      // Item 2: Early timed event (9:00 AM)
      expect(scheduleItems[1]).toHaveTextContent("Morning Standup");

      // Item 3: Late timed event (14:00)
      expect(scheduleItems[2]).toHaveTextContent("Architecture Deep Dive");
    });

    it("displays event location if provided", async () => {
      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Main Boardroom")).toBeInTheDocument();
        expect(screen.getByText("Google Meet")).toBeInTheDocument();
      });
    });

    it("bounds display to max 4 events and shows overflow link when more exist", async () => {
      calendarEventsData = [
        mockAllDayEvent,
        mockEarlyTimedEvent,
        mockLateTimedEvent,
        {
          ...mockEarlyTimedEvent,
          id: "evt-4",
          title: "Team Sync",
          startTime: `${todayStr}T10:00:00.000Z`,
          endTime: `${todayStr}T10:30:00.000Z`,
        },
        {
          ...mockLateTimedEvent,
          id: "evt-5",
          title: "Evening Wrap-up",
          startTime: `${todayStr}T17:00:00.000Z`,
          endTime: `${todayStr}T17:30:00.000Z`,
        },
        {
          ...mockLateTimedEvent,
          id: "evt-6",
          title: "Bonus Late Session",
          startTime: `${todayStr}T19:00:00.000Z`,
          endTime: `${todayStr}T19:30:00.000Z`,
        },
      ];

      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Quarterly Strategy Review")).toBeInTheDocument();
      });

      const scheduleItems = document.querySelectorAll(".dash-schedule-item");
      expect(scheduleItems.length).toBe(4);

      // Overflow link for the remaining 2 events
      expect(screen.getByText(/\+2 more events in calendar/i)).toBeInTheDocument();
    });

    it("renders deliberate empty state when no events are scheduled today", async () => {
      calendarEventsData = [];

      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("No events scheduled today.")).toBeInTheDocument();
      });

      expect(screen.getByRole("link", { name: "View Calendar" })).toBeInTheDocument();
    });

    it("navigates to /calendar on clicking View calendar link", async () => {
      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("link", { name: "View calendar" })).toBeInTheDocument();
      });

      const viewCalLink = screen.getByRole("link", { name: "View calendar" });
      fireEvent.click(viewCalLink);

      expect(window.location.pathname).toBe("/calendar");
    });
  });

  describe("4. Dashboard Fault Isolation", () => {
    it("isolates Calendar API failure: widget shows retry error while other Dashboard widgets work normally", async () => {
      calendarFail = true;

      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      // Calendar widget displays graceful error and retry button
      await waitFor(() => {
        expect(screen.getByText("Unable to load schedule")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Retry loading schedule" })).toBeInTheDocument();
      });

      // Tasks continue loading and working!
      expect(screen.getByText("Focus Task 1")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Today's Tasks" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Today's Habits" })).toBeInTheDocument();

      // Test Retry button recovery
      calendarFail = false;
      const retryBtn = screen.getByRole("button", { name: "Retry loading schedule" });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByText("Quarterly Strategy Review")).toBeInTheDocument();
      });
      expect(screen.queryByText("Unable to load schedule")).not.toBeInTheDocument();
    });
  });

  describe("5. Timezone & Temporal Semantics", () => {
    it("requests Calendar API using local day bounds rather than naive UTC string", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Today's Schedule" })).toBeInTheDocument();
      });

      // Inspect the fetch call parameters for /api/calendar/events
      const calendarCall = fetchSpy.mock.calls.find((call) =>
        String(call[0]).includes("/api/calendar/events")
      );
      expect(calendarCall).toBeDefined();

      const urlObj = new URL(String(calendarCall![0]), "http://localhost");
      expect(urlObj.searchParams.has("start")).toBe(true);
      expect(urlObj.searchParams.has("end")).toBe(true);
      expect(urlObj.searchParams.has("timeZone")).toBe(true);
    });

    it("calculates correct day bounds in Asia/Kolkata and America/New_York", () => {
      const kolkataToday = getTodayDateString("Asia/Kolkata");
      const nyToday = getTodayDateString("America/New_York");

      expect(kolkataToday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(nyToday).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Verify that day bounds in Asia/Kolkata start and end at local midnight without drift
      const { startIso: kolkataStart, endIso: kolkataEnd } = getTemporalBoundsForView("day", "2026-10-08", "Asia/Kolkata");
      expect(kolkataStart).toBe("2026-10-07T18:30:00.000Z"); // 00:00 IST = 18:30 UTC previous day
      expect(kolkataEnd).toBe("2026-10-08T18:30:00.000Z");

      // Verify day bounds in America/New_York (EDT UTC-4 in October)
      const { startIso: nyStart, endIso: nyEnd } = getTemporalBoundsForView("day", "2026-10-08", "America/New_York");
      expect(nyStart).toBe("2026-10-08T04:00:00.000Z"); // 00:00 EDT = 04:00 UTC
      expect(nyEnd).toBe("2026-10-09T04:00:00.000Z");
    });
  });
});
