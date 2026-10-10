import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NotificationBell } from "../components/notifications/NotificationBell";
import { NotificationProvider } from "../context/NotificationContext";
import { AuthProvider } from "../context/AuthContext";
import { RouterProvider } from "../router/Router";
import type { NotificationItem } from "../api/notifications";

const mockNotifications: NotificationItem[] = [
  {
    id: "notif-1",
    type: "GOAL_COMPLETED",
    title: "Goal Achieved: Launch TrackUp",
    body: "Congratulations! You completed this goal.",
    isRead: false,
    readAt: null,
    resourceType: "goal",
    resourceId: "goal-101",
    createdAt: new Date().toISOString(),
  },
  {
    id: "notif-2",
    type: "TASK_OVERDUE",
    title: "Task Overdue: Fix Security Audit",
    body: "Due on 2026-10-10. Review or reschedule this task.",
    isRead: false,
    readAt: null,
    resourceType: "task",
    resourceId: "task-202",
    createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
  },
  {
    id: "notif-3",
    type: "HABIT_STREAK_MILESTONE",
    title: "7-Day Streak: Morning Run",
    body: "You've maintained your streak for 7 consecutive days!",
    isRead: true,
    readAt: new Date(Date.now() - 86400000).toISOString(),
    resourceType: "habit",
    resourceId: "habit-303",
    createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
  },
];

function renderWithProviders(ui: React.ReactNode) {
  return render(
    <AuthProvider>
      <NotificationProvider>
        <RouterProvider>{ui}</RouterProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}

describe("Notification Frontend Experience (Phase 2.7)", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method?.toUpperCase() || "GET";

      // Mock auth user
      if (url.includes("/api/auth/me")) {
        return {
          ok: true,
          json: async () => ({
            user: { id: "user-1", email: "test@example.com", name: "Test User" },
          }),
        } as Response;
      }

      // Mock unread count
      if (url.includes("/api/notifications/unread-count")) {
        return {
          ok: true,
          json: async () => ({ count: 2 }),
        } as Response;
      }

      // Mock notifications list
      if (url.includes("/api/notifications") && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            notifications: mockNotifications,
            total: 3,
          }),
        } as Response;
      }

      // Mock mark single read
      if (url.includes("/read") && method === "PATCH") {
        const id = url.split("/")[3];
        return {
          ok: true,
          json: async () => ({
            notification: {
              ...mockNotifications[0],
              id,
              isRead: true,
              readAt: new Date().toISOString(),
            },
          }),
        } as Response;
      }

      // Mock mark all read
      if (url.includes("/mark-all-read") && method === "POST") {
        return {
          ok: true,
          json: async () => ({
            success: true,
            markedCount: 2,
          }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({}),
      } as Response;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1. renders NotificationBell with unread badge counter", async () => {
    renderWithProviders(<NotificationBell />);

    const bellButton = await screen.findByRole("button", {
      name: /Notifications, 2 unread/i,
    });
    expect(bellButton).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("2. toggles NotificationPanel open and closed on bell click", async () => {
    renderWithProviders(<NotificationBell />);

    const bellButton = await screen.findByRole("button", {
      name: /Notifications, 2 unread/i,
    });
    expect(screen.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument();

    // Click to open
    fireEvent.click(bellButton);

    const dialog = await screen.findByRole("dialog", { name: "Notifications" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Notifications")).toBeInTheDocument();
    expect(screen.getByText("2 new")).toBeInTheDocument();

    // Click to close
    fireEvent.click(bellButton);
    expect(screen.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument();
  });

  it("3. closes panel when pressing Escape key", async () => {
    renderWithProviders(<NotificationBell />);

    const bellButton = await screen.findByRole("button", {
      name: /Notifications, 2 unread/i,
    });
    fireEvent.click(bellButton);

    const dialog = await screen.findByRole("dialog", { name: "Notifications" });
    expect(dialog).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument();
  });

  it("4. renders notification items with proper titles, bodies, and read states", async () => {
    renderWithProviders(<NotificationBell />);

    const bellButton = await screen.findByRole("button", {
      name: /Notifications, 2 unread/i,
    });
    fireEvent.click(bellButton);

    expect(await screen.findByText("Goal Achieved: Launch TrackUp")).toBeInTheDocument();
    expect(screen.getByText("Task Overdue: Fix Security Audit")).toBeInTheDocument();
    expect(screen.getByText("7-Day Streak: Morning Run")).toBeInTheDocument();

    // Verify mark as read buttons exist for unread items
    const markButtons = screen.getAllByRole("button", { name: /Mark notification as read/i });
    expect(markButtons.length).toBe(2);
  });

  it("5. clicking 'Mark all read' triggers bulk update and disables button", async () => {
    renderWithProviders(<NotificationBell />);

    const bellButton = await screen.findByRole("button", {
      name: /Notifications, 2 unread/i,
    });
    fireEvent.click(bellButton);

    const markAllButton = await screen.findByRole("button", { name: "Mark all notifications as read" });
    expect(markAllButton).not.toBeDisabled();

    fireEvent.click(markAllButton);

    await waitFor(() => {
      // Unread count decremented to 0
      expect(screen.queryByText("2 new")).not.toBeInTheDocument();
      expect(markAllButton).toBeDisabled();
    });
  });

  it("6. renders empty state when notifications feed is empty", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) {
        return {
          ok: true,
          json: async () => ({
            user: { id: "user-1", email: "test@example.com", name: "Test User" },
          }),
        } as Response;
      }
      if (url.includes("/api/notifications/unread-count")) {
        return {
          ok: true,
          json: async () => ({ count: 0 }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          notifications: [],
          total: 0,
        }),
      } as Response;
    });

    renderWithProviders(<NotificationBell />);

    const bellButton = await screen.findByRole("button", {
      name: /Notifications, none unread/i,
    });
    fireEvent.click(bellButton);

    expect(await screen.findByText("No notifications")).toBeInTheDocument();
    expect(screen.getByText(/You're all caught up!/i)).toBeInTheDocument();
  });
});
