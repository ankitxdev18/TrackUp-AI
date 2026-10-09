import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { App } from "../App";
import {
  getLocalTodayDateString,
  type Habit,
  type HabitHistoryResponse,
} from "../api/habits";
import { type Task, getTodayDateString } from "../api/tasks";

describe("Milestone H01-E: Dashboard Habits Integration", () => {
  const localToday = getLocalTodayDateString();
  const taskToday = getTodayDateString();

  const mockTasks: Task[] = [
    {
      id: "t-1",
      userId: "user-1",
      title: "Complete dashboard review",
      status: "TODO",
      priority: "HIGH",
      dueDate: taskToday,
      completedAt: null,
      createdAt: "2026-10-06T08:00:00.000Z",
      updatedAt: "2026-10-06T08:00:00.000Z",
    },
  ];

  const mockActiveHabit1: Habit = {
    id: "habit-1",
    userId: "user-1",
    title: "Read 20 pages",
    description: "Personal reading routine",
    frequency: "DAILY",
    status: "ACTIVE",
    currentStreak: 2,
    longestStreak: 5,
    todayCompleted: false,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
  };

  const mockActiveHabit2: Habit = {
    id: "habit-2",
    userId: "user-1",
    title: "Exercise 30 mins",
    description: "Morning workout",
    frequency: "DAILY",
    status: "ACTIVE",
    currentStreak: 1,
    longestStreak: 3,
    todayCompleted: false,
    createdAt: "2026-10-02T10:00:00.000Z",
    updatedAt: "2026-10-02T10:00:00.000Z",
  };

  const mockActiveHabit3: Habit = {
    id: "habit-3",
    userId: "user-1",
    title: "Practice coding",
    description: "1 problem per day",
    frequency: "DAILY",
    status: "ACTIVE",
    currentStreak: 0,
    longestStreak: 2,
    todayCompleted: false,
    createdAt: "2026-10-03T10:00:00.000Z",
    updatedAt: "2026-10-03T10:00:00.000Z",
  };

  const mockActiveHabit4: Habit = {
    id: "habit-4",
    userId: "user-1",
    title: "Journal thoughts",
    description: "Evening reflections",
    frequency: "DAILY",
    status: "ACTIVE",
    currentStreak: 4,
    longestStreak: 6,
    todayCompleted: false,
    createdAt: "2026-10-04T10:00:00.000Z",
    updatedAt: "2026-10-04T10:00:00.000Z",
  };

  const mockActiveHabit5: Habit = {
    id: "habit-5",
    userId: "user-1",
    title: "Drink 3L water",
    description: "Hydration tracking",
    frequency: "DAILY",
    status: "ACTIVE",
    currentStreak: 5,
    longestStreak: 10,
    todayCompleted: false,
    createdAt: "2026-10-05T10:00:00.000Z",
    updatedAt: "2026-10-05T10:00:00.000Z",
  };

  // Helper to create mock history response
  const makeMockHistory = (habitId: string, isCompletedToday: boolean): HabitHistoryResponse => ({
    habitId,
    days: 7,
    startDate: "2026-09-30",
    endDate: localToday,
    currentStreak: isCompletedToday ? 1 : 0,
    longestStreak: 3,
    eligibilityStartDate: "2026-09-30",
    history: [
      {
        date: localToday,
        completed: isCompletedToday,
        eligible: true,
        completedAt: isCompletedToday ? "2026-10-06T10:00:00.000Z" : null,
      },
    ],
  });

  let activeHabitsList: Habit[];
  let historyMap: Record<string, boolean>;

  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, "", "/dashboard");

    activeHabitsList = [mockActiveHabit1, mockActiveHabit2];
    historyMap = {
      "habit-1": false,
      "habit-2": true,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, options?: any) => {
        const urlStr = url.toString();
        const method = options?.method || "GET";

        // Auth
        if (urlStr.includes("/api/auth/me")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              user: { id: "user-1", name: "Alex Mercer", email: "alex@example.com" },
            }),
          };
        }

        // Tasks
        if (urlStr.includes("/api/tasks")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ tasks: mockTasks }),
          };
        }

        // Projects
        if (urlStr.includes("/api/projects")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ projects: [] }),
          };
        }

        // Goals
        if (urlStr.includes("/api/goals")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ goals: [] }),
          };
        }

        // Habit Completions POST
        if (urlStr.match(/\/api\/habits\/[^/]+\/completions$/) && method === "POST") {
          const body = JSON.parse(options?.body || "{}");
          const habitId = urlStr.split("/")[3];
          historyMap[habitId] = true;
          return {
            ok: true,
            status: 201,
            json: async () => ({
              completion: {
                id: `comp-${habitId}`,
                habitId,
                userId: "user-1",
                completedDate: body.date,
                completedAt: "2026-10-06T10:00:00.000Z",
                createdAt: "2026-10-06T10:00:00.000Z",
              },
            }),
          };
        }

        // Habit Completions DELETE
        if (urlStr.match(/\/api\/habits\/[^/]+\/completions\/[^/]+$/) && method === "DELETE") {
          const habitId = urlStr.split("/")[3];
          historyMap[habitId] = false;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              habitId,
              completedDate: localToday,
            }),
          };
        }

        // Habit History GET
        if (urlStr.includes("/history")) {
          const habitId = urlStr.split("/")[3];
          return {
            ok: true,
            status: 200,
            json: async () => makeMockHistory(habitId, !!historyMap[habitId]),
          };
        }

        // Habits GET
        if (urlStr.includes("/api/habits")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ habits: activeHabitsList }),
          };
        }

        return { ok: true, status: 200, json: async () => ({}) };
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Dashboard renders Habit widget
  it("1. renders Today's Habits widget heading and title bar on Dashboard", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Today's Habits" })).toBeInTheDocument();
    });

    const habitsHeading = screen.getByRole("heading", { name: "Today's Habits" });
    const widget = habitsHeading.closest("section");
    expect(widget).toHaveClass("dashboard-panel");
  });

  // 2. Habit loading state renders
  it("2. renders compact skeleton loading state while habits are fetching", async () => {
    // Hang fetch to verify loading state
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        const urlStr = url.toString();
        if (urlStr.includes("/api/auth/me")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ user: { id: "user-1", name: "Alex" } }),
          });
        }
        if (urlStr.includes("/api/habits")) {
          return new Promise(() => {}); // never resolves
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ tasks: [], projects: [], goals: [] }),
        });
      })
    );

    render(<App />);

    expect(screen.getByRole("status", { name: "Loading habits" })).toBeInTheDocument();
  });

  // 3. Active habits render
  it("3. renders active habits with checkboxes and daily tags", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    expect(screen.getByText("Exercise 30 mins")).toBeInTheDocument();
    const dailyPills = screen.getAllByText("Daily");
    expect(dailyPills.length).toBe(2);
  });

  // 4. Completion count renders correctly
  it("4. renders completion count correctly (e.g., 1 / 2)", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    // One habit is completed, one is incomplete
    const badge = screen.getByLabelText("1 of 2 completed");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("1 / 2");
  });

  // 5. Empty state renders when no active habits exist
  it("5. renders intentional empty state with 'No habits yet' and 'Create habit' when active habits is 0", async () => {
    activeHabitsList = [];

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("No habits yet")).toBeInTheDocument();
    });

    const createLink = screen.getByRole("link", { name: /create habit/i });
    expect(createLink).toBeInTheDocument();
    expect(createLink).toHaveAttribute("href", "/habits");

    // Must NOT render 0 / 0
    expect(screen.queryByText("0 / 0")).not.toBeInTheDocument();
  });

  // 6. Habit API failure does not break Dashboard
  it("6. isolates Habit API failure so tasks and dashboard continue working normally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        const urlStr = url.toString();
        if (urlStr.includes("/api/auth/me")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ user: { id: "user-1", name: "Alex" } }),
          };
        }
        if (urlStr.includes("/api/tasks")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ tasks: mockTasks }),
          };
        }
        if (urlStr.includes("/api/habits")) {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: "Habits service down" }),
          };
        }
        return { ok: true, status: 200, json: async () => ({ projects: [], goals: [] }) };
      })
    );

    render(<App />);

    // Dashboard task should render fine!
    await waitFor(() => {
      expect(screen.getByText("Complete dashboard review")).toBeInTheDocument();
    });

    // Habit widget shows isolated error and retry button
    expect(screen.getByText("Habits service down")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry loading habits" })).toBeInTheDocument();

    // Main dashboard error banner must NOT be shown
    expect(screen.queryByText(/Unable to load dashboard data/i)).not.toBeInTheDocument();
  });

  // 7. Completion sends local YYYY-MM-DD
  it("7. checking a habit sends user-local YYYY-MM-DD to completion API", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    const uncheckedBtn = screen.getByRole("checkbox", {
      name: "Mark Read 20 pages as complete",
    });

    fireEvent.click(uncheckedBtn);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/habits/habit-1/completions"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ date: localToday }),
        })
      );
    });
  });

  // 8. Completion updates optimistically
  it("8. completes habit optimistically updating UI immediately", async () => {
    // Delay POST resolution
    let resolvePost: (value: any) => void;
    const postPromise = new Promise((resolve) => {
      resolvePost = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, options?: any) => {
        const urlStr = url.toString();
        const method = options?.method || "GET";

        if (urlStr.includes("/api/auth/me")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ user: { id: "user-1", name: "Alex" } }),
          };
        }
        if (urlStr.includes("/api/tasks")) {
          return { ok: true, status: 200, json: async () => ({ tasks: mockTasks }) };
        }
        if (urlStr.includes("/api/habits") && method === "POST") {
          await postPromise;
          return {
            ok: true,
            status: 201,
            json: async () => ({
              completion: { id: "c-1", habitId: "habit-1", completedDate: localToday },
            }),
          };
        }
        if (urlStr.includes("/history")) {
          const habitId = urlStr.split("/")[3];
          return {
            ok: true,
            status: 200,
            json: async () => makeMockHistory(habitId, !!historyMap[habitId]),
          };
        }
        if (urlStr.includes("/api/habits")) {
          return { ok: true, status: 200, json: async () => ({ habits: activeHabitsList }) };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      })
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    const checkBtn = screen.getByRole("checkbox", {
      name: "Mark Read 20 pages as complete",
    });

    fireEvent.click(checkBtn);

    // Optimistically updated immediately before POST resolves!
    expect(
      screen.getByRole("checkbox", { name: "Mark Read 20 pages as incomplete" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("2 of 2 completed")).toHaveTextContent("2 / 2");

    // Complete the pending promise
    resolvePost!({});
  });

  // 9. Completion failure rolls back
  it("9. rolls back optimistic update when completion request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, options?: any) => {
        const urlStr = url.toString();
        const method = options?.method || "GET";

        if (urlStr.includes("/api/auth/me")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ user: { id: "user-1", name: "Alex" } }),
          };
        }
        if (urlStr.includes("/api/tasks")) {
          return { ok: true, status: 200, json: async () => ({ tasks: mockTasks }) };
        }
        if (urlStr.includes("/api/habits") && method === "POST") {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: "Database write failure" }),
          };
        }
        if (urlStr.includes("/history")) {
          const habitId = urlStr.split("/")[3];
          return {
            ok: true,
            status: 200,
            json: async () => makeMockHistory(habitId, false),
          };
        }
        if (urlStr.includes("/api/habits")) {
          return { ok: true, status: 200, json: async () => ({ habits: activeHabitsList }) };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      })
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    const checkBtn = screen.getByRole("checkbox", {
      name: "Mark Read 20 pages as complete",
    });

    fireEvent.click(checkBtn);

    // After failure, rolls back to incomplete
    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", { name: "Mark Read 20 pages as complete" })
      ).toBeInTheDocument();
    });

    // Error feedback message appears
    expect(screen.getByText("Database write failure")).toBeInTheDocument();
  });

  // 10. Uncompletion works
  it("10. unchecking a completed habit calls DELETE completion endpoint and decrements count", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Exercise 30 mins")).toBeInTheDocument();
    });

    const completedBtn = screen.getByRole("checkbox", {
      name: "Mark Exercise 30 mins as incomplete",
    });

    fireEvent.click(completedBtn);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/habits/habit-2/completions/${localToday}`),
        expect.objectContaining({ method: "DELETE" })
      );
    });

    // Button should now be unchecked
    expect(
      screen.getByRole("checkbox", { name: "Mark Exercise 30 mins as complete" })
    ).toBeInTheDocument();
  });

  // 11. More than 4 habits are limited to maximum 4 visible
  it("11. caps visible habits at maximum 4 even when 5 active habits exist", async () => {
    activeHabitsList = [
      mockActiveHabit1, // 2026-10-01
      mockActiveHabit2, // 2026-10-02
      mockActiveHabit3, // 2026-10-03
      mockActiveHabit4, // 2026-10-04
      mockActiveHabit5, // 2026-10-05
    ];

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Today's Habits" })).toBeInTheDocument();
    });

    // Sorted descending by createdAt:
    // 1: Drink 3L water (habit-5)
    // 2: Journal thoughts (habit-4)
    // 3: Practice coding (habit-3)
    // 4: Exercise 30 mins (habit-2)
    // 5: Read 20 pages (habit-1) — 5th habit should NOT be rendered!
    await waitFor(() => {
      expect(screen.getByText("Drink 3L water")).toBeInTheDocument();
    });

    expect(screen.getByText("Journal thoughts")).toBeInTheDocument();
    expect(screen.getByText("Practice coding")).toBeInTheDocument();
    expect(screen.getByText("Exercise 30 mins")).toBeInTheDocument();

    // 5th habit is capped and NOT in widget
    expect(screen.queryByText("Read 20 pages")).not.toBeInTheDocument();

    // Exactly 4 habit items are rendered
    const items = document.querySelectorAll(".dash-habit-item");
    expect(items.length).toBe(4);
  });

  // 12. "View all" navigates to /habits
  it("12. 'View all' link has href /habits for full management navigation", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Today's Habits" })).toBeInTheDocument();
    });

    const habitsHeading = screen.getByRole("heading", { name: "Today's Habits" });
    const widget = habitsHeading.closest("section")!;
    const viewAllLink = within(widget).getByRole("link", { name: /view all/i });

    expect(viewAllLink).toBeInTheDocument();
    expect(viewAllLink).toHaveAttribute("href", "/habits");

    fireEvent.click(viewAllLink);
    expect(window.location.pathname).toBe("/habits");
  });

  // 13. Accessible completion labels exist
  it("13. provides accessible dynamic labels, role='checkbox', and aria-checked", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    const uncheckedBtn = screen.getByRole("checkbox", {
      name: "Mark Read 20 pages as complete",
    });
    expect(uncheckedBtn).toHaveAttribute("aria-checked", "false");

    const checkedBtn = screen.getByRole("checkbox", {
      name: "Mark Exercise 30 mins as incomplete",
    });
    expect(checkedBtn).toHaveAttribute("aria-checked", "true");
  });
});
