import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { App } from "../App";
import type { NotificationItem } from "../api/notifications";

const testNotifications: NotificationItem[] = [
  {
    id: "notif-goal-1",
    type: "GOAL_COMPLETED",
    title: "Goal Achieved: Launch TrackUp",
    body: "Congratulations! You completed this goal.",
    isRead: false,
    readAt: null,
    resourceType: "goal",
    resourceId: "goal-uuid-1",
    createdAt: new Date().toISOString(),
  },
  {
    id: "notif-habit-1",
    type: "HABIT_STREAK_MILESTONE",
    title: "7-Day Streak: Daily Yoga",
    body: "You've maintained your streak for 7 consecutive days!",
    isRead: false,
    readAt: null,
    resourceType: "habit",
    resourceId: "habit-uuid-1",
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "notif-task-1",
    type: "TASK_OVERDUE",
    title: "Task Overdue: Fix Security Bug",
    body: "Due yesterday. Review or reschedule this task.",
    isRead: false,
    readAt: null,
    resourceType: "task",
    resourceId: "task-uuid-1",
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
];

describe("Notification Domain Integration & Deep-Linking (Phase 2.8)", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/dashboard");

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method?.toUpperCase() || "GET";

      if (url.includes("/api/auth/me")) {
        return {
          ok: true,
          json: async () => ({
            user: { id: "user-1", email: "alice@example.com", name: "Alice Developer" },
          }),
        } as Response;
      }

      if (url.includes("/api/notifications/unread-count")) {
        return {
          ok: true,
          json: async () => ({ count: 3 }),
        } as Response;
      }

      if (url.includes("/api/notifications") && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            notifications: testNotifications,
            total: 3,
          }),
        } as Response;
      }

      if (url.includes("/read") && method === "PATCH") {
        return {
          ok: true,
          json: async () => ({
            notification: {
              ...testNotifications[0],
              isRead: true,
              readAt: new Date().toISOString(),
            },
          }),
        } as Response;
      }

      if (url.includes("/api/goals/goal-uuid-1")) {
        return {
          ok: true,
          json: async () => ({
            goal: {
              id: "goal-uuid-1",
              userId: "user-1",
              title: "Launch TrackUp",
              description: "Ship Phase 2",
              status: "COMPLETED",
              progress: 100,
              targetDate: "2026-12-01",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
        } as Response;
      }

      if (url.includes("/api/goals/deleted-goal-id")) {
        return {
          ok: false,
          status: 404,
          json: async () => ({
            error: "Goal not found",
            code: "NOT_FOUND",
          }),
        } as Response;
      }

      // Default mock responses for dashboard domains
      if (url.includes("/api/tasks")) {
        return {
          ok: true,
          json: async () => ({ tasks: [] }),
        } as Response;
      }
      if (url.includes("/api/goals")) {
        return {
          ok: true,
          json: async () => ({ goals: [] }),
        } as Response;
      }
      if (url.includes("/api/habits")) {
        return {
          ok: true,
          json: async () => ({ habits: [] }),
        } as Response;
      }
      if (url.includes("/api/projects")) {
        return {
          ok: true,
          json: async () => ({ projects: [] }),
        } as Response;
      }
      if (url.includes("/api/calendar/events")) {
        return {
          ok: true,
          json: async () => ({ events: [] }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({}),
      } as Response;
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("1. deep-links from goal notification to /goals/:id detail view", async () => {
    render(<App />);

    // Wait for Dashboard and Bell to appear
    const bellButton = await screen.findByRole("button", {
      name: /Notifications, 3 unread/i,
    });
    expect(bellButton).toBeInTheDocument();

    // Open notifications panel
    fireEvent.click(bellButton);

    const goalItem = await screen.findByRole("button", {
      name: /Goal Achieved: Launch TrackUp, unread/i,
    });
    expect(goalItem).toBeInTheDocument();

    // Click the notification item
    fireEvent.click(goalItem);

    // Verify router navigated to /goals/goal-uuid-1 and GoalDetailPage loaded
    await waitFor(() => {
      expect(window.location.pathname).toBe("/goals/goal-uuid-1");
      expect(screen.getByText("Launch TrackUp")).toBeInTheDocument();
    });
  });

  it("2. deep-links from habit notification to /habits view", async () => {
    render(<App />);

    const bellButton = await screen.findByRole("button", {
      name: /Notifications, 3 unread/i,
    });
    fireEvent.click(bellButton);

    const habitItem = await screen.findByRole("button", {
      name: /7-Day Streak: Daily Yoga, unread/i,
    });
    expect(habitItem).toBeInTheDocument();

    fireEvent.click(habitItem);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/habits");
    });
  });

  it("3. deep-links from task notification to /tasks view", async () => {
    render(<App />);

    const bellButton = await screen.findByRole("button", {
      name: /Notifications, 3 unread/i,
    });
    fireEvent.click(bellButton);

    const taskItem = await screen.findByRole("button", {
      name: /Task Overdue: Fix Security Bug, unread/i,
    });
    expect(taskItem).toBeInTheDocument();

    fireEvent.click(taskItem);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/tasks");
    });
  });

  it("4. handles deleted goal gracefully without application crash", async () => {
    window.history.pushState({}, "", "/goals/deleted-goal-id");
    render(<App />);

    // Detail page handles 404 gracefully with message and Back to Goals button
    expect(
      await screen.findByRole("heading", { name: /Goal Not Found/i })
    ).toBeInTheDocument();
    const backButton = screen.getByRole("button", { name: /Back to Goals/i });
    expect(backButton).toBeInTheDocument();

    fireEvent.click(backButton);
    await waitFor(() => {
      expect(window.location.pathname).toBe("/goals");
    });
  });
});
