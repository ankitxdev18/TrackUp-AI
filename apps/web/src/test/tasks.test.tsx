import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { App } from "../App";
import { getTodayDateString, type Task } from "../api/tasks";

describe("Milestone 2 & 3: Tasks & Dashboard Integration", () => {
  const todayStr = getTodayDateString();

  const mockTasks: Task[] = [
    {
      id: "t-1",
      userId: "user-1",
      title: "Complete quarterly review",
      status: "TODO",
      priority: "HIGH",
      dueDate: todayStr,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "t-2",
      userId: "user-1",
      title: "Daily morning workout",
      status: "COMPLETED",
      priority: "MEDIUM",
      dueDate: todayStr,
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "t-3",
      userId: "user-1",
      title: "Plan road trip itinerary",
      status: "TODO",
      priority: "LOW",
      dueDate: "2099-12-31", // Upcoming
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Tasks Page (/tasks)", () => {
    it("renders loading state then tasks list with real tasks", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }
        return { ok: true, json: async () => ({ tasks: mockTasks }) } as Response;
      });

      window.history.pushState({}, "", "/tasks");
      render(<App />);

      // Shows heading and action CTA
      expect(screen.getByRole("heading", { name: "Tasks & Planning" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add Task" })).toBeInTheDocument();

      // Filter tabs exist
      expect(screen.getByRole("tab", { name: /All Tasks/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Today/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Upcoming/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Completed/i })).toBeInTheDocument();

      // Tasks appear after load
      await waitFor(() => {
        expect(screen.getByText("Complete quarterly review")).toBeInTheDocument();
        expect(screen.getByText("Daily morning workout")).toBeInTheDocument();
        expect(screen.getByText("Plan road trip itinerary")).toBeInTheDocument();
      });

      // Priority badges
      expect(screen.getAllByText("High").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Medium").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Low").length).toBeGreaterThan(0);
    });

    it("displays deliberate empty state when no tasks exist", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }
        return { ok: true, json: async () => ({ tasks: [] }) } as Response;
      });

      window.history.pushState({}, "", "/tasks");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("No tasks found.")).toBeInTheDocument();
        expect(screen.getByText(/Start by adding your first action item/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Create Task" })).toBeInTheDocument();
      });
    });

    it("displays error banner when fetch fails and allows retry", async () => {
      let callCount = 0;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }
        callCount++;
        if (callCount === 1) {
          throw new Error("Network connection error");
        }
        return { ok: true, json: async () => ({ tasks: mockTasks }) } as Response;
      });

      window.history.pushState({}, "", "/tasks");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(screen.getByText(/Network connection error/i)).toBeInTheDocument();
      });

      // Click retry button
      const retryBtn = screen.getByRole("button", { name: "Retry" });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByText("Complete quarterly review")).toBeInTheDocument();
      });
    });

    it("opens task creation modal and adds newly created task to list", async () => {
      let taskList: Task[] = [];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method || "GET";

        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }

        if (method === "POST") {
          const body = JSON.parse(String(init?.body || "{}"));
          const created: Task = {
            id: "t-new",
            userId: "user-1",
            title: body.title,
            status: "TODO",
            priority: body.priority || "HIGH",
            dueDate: null,
            completedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          return { ok: true, json: async () => ({ task: created }) } as Response;
        }

        return { ok: true, json: async () => ({ tasks: taskList }) } as Response;
      });

      window.history.pushState({}, "", "/tasks");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("No tasks found.")).toBeInTheDocument();
      });

      // Open creation modal
      const addBtn = screen.getByRole("button", { name: "Add Task" });
      fireEvent.click(addBtn);

      expect(screen.getByRole("heading", { name: "Create New Task" })).toBeInTheDocument();

      // Fill in title
      const input = screen.getByLabelText(/Task Title/i);
      fireEvent.change(input, { target: { value: "Write integration tests" } });

      // Select high priority
      const highPill = screen.getByRole("radio", { name: /High/i });
      fireEvent.click(highPill);

      // Submit form
      const modal = screen.getByRole("dialog");
      const submitBtn = within(modal).getByRole("button", { name: "Create Task" });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText("Write integration tests")).toBeInTheDocument();
      });
    });

    it("toggles task completion state with optimistic update", async () => {
      const taskToToggle = { ...mockTasks[0] };
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method || "GET";

        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }

        if (method === "PATCH") {
          const body = JSON.parse(String(init?.body || "{}"));
          return {
            ok: true,
            json: async () => ({
              task: {
                ...taskToToggle,
                status: body.status,
                completedAt: body.status === "COMPLETED" ? new Date().toISOString() : null,
              },
            }),
          } as Response;
        }

        return { ok: true, json: async () => ({ tasks: [taskToToggle] }) } as Response;
      });

      window.history.pushState({}, "", "/tasks");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(taskToToggle.title)).toBeInTheDocument();
      });

      const checkbox = screen.getByRole("checkbox", {
        name: `Mark ${taskToToggle.title} as complete`,
      });
      expect(checkbox).toHaveAttribute("aria-checked", "false");

      fireEvent.click(checkbox);

      await waitFor(() => {
        const updatedCheckbox = screen.getByRole("checkbox", {
          name: `Mark ${taskToToggle.title} as incomplete`,
        });
        expect(updatedCheckbox).toHaveAttribute("aria-checked", "true");
      });
    });

    it("filters tasks by tab selection", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }
        return { ok: true, json: async () => ({ tasks: mockTasks }) } as Response;
      });

      window.history.pushState({}, "", "/tasks");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Complete quarterly review")).toBeInTheDocument();
      });

      // Click "Completed" tab
      const completedTab = screen.getByRole("tab", { name: /Completed/i });
      fireEvent.click(completedTab);

      // Daily morning workout is COMPLETED
      expect(screen.getByText("Daily morning workout")).toBeInTheDocument();
      // Complete quarterly review is TODO so should not be in Completed tab
      expect(screen.queryByText("Complete quarterly review")).not.toBeInTheDocument();
    });
  });

  describe("Dashboard Integration (/dashboard)", () => {
    it("loads real task data and computes live summary metrics", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }
        return { ok: true, json: async () => ({ tasks: mockTasks }) } as Response;
      });

      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      await waitFor(() => {
        // Today total = 2 (t-1 and t-2 are today)
        expect(screen.getByText("1 of 2 completed")).toBeInTheDocument();
        // Progress = 1 of 2 = 50%
        expect(screen.getByText("50%")).toBeInTheDocument();
        // Remaining = 2 - 1 = 1
        expect(screen.getByText("1")).toBeInTheDocument();
      });

      // Today's tasks list contains real items
      expect(screen.getByText("Complete quarterly review")).toBeInTheDocument();

      // Upcoming section contains upcoming items
      expect(screen.getByText("Plan road trip itinerary")).toBeInTheDocument();
    });

    it("allows creating a task directly from Dashboard quick-add", async () => {
      let taskList: Task[] = [];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method || "GET";

        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }

        if (method === "POST") {
          const body = JSON.parse(String(init?.body || "{}"));
          const created: Task = {
            id: "dash-created",
            userId: "user-1",
            title: body.title,
            status: "TODO",
            priority: "MEDIUM",
            dueDate: todayStr,
            completedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          return { ok: true, json: async () => ({ task: created }) } as Response;
        }

        return { ok: true, json: async () => ({ tasks: taskList }) } as Response;
      });

      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("You're clear for today.")).toBeInTheDocument();
      });

      // Click "Add Task" button in panel title bar
      const addBtns = screen.getAllByRole("button", { name: /Add.*task/i });
      fireEvent.click(addBtns[0]);

      const modal = screen.getByRole("dialog");
      expect(within(modal).getByRole("heading", { name: "Create New Task" })).toBeInTheDocument();

      const input = within(modal).getByLabelText(/Task Title/i);
      fireEvent.change(input, { target: { value: "Dashboard quick action" } });

      const submitBtn = within(modal).getByRole("button", { name: "Create Task" });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText("Dashboard quick action")).toBeInTheDocument();
      });
    });

    it("loads real tasks and metrics successfully even when /api/projects returns 404 (M2.6.1 regression test)", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/projects")) {
          return {
            ok: false,
            status: 404,
            json: async () => ({
              message: "Route GET:/api/projects not found",
              error: "Not Found",
              statusCode: 404,
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({ tasks: mockTasks }) } as Response;
      });

      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      // Dashboard should NOT show the error banner
      await waitFor(() => {
        expect(screen.queryByText(/Unable to load dashboard data/i)).not.toBeInTheDocument();
      });

      // Real tasks and metrics must still be rendered
      expect(screen.getByText("1 of 2 completed")).toBeInTheDocument();
      expect(screen.getByText("50%")).toBeInTheDocument();
      expect(screen.getByText("Complete quarterly review")).toBeInTheDocument();
      expect(screen.getByText("No active projects yet.")).toBeInTheDocument();
    });

    it("displays error banner when /api/tasks genuinely fails and allows retry", async () => {
      let fail = true;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }
        if (fail) {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: "Internal Server Error" }),
          } as Response;
        }
        return { ok: true, json: async () => ({ tasks: mockTasks }) } as Response;
      });

      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      // Error banner should be displayed
      await waitFor(() => {
        expect(screen.getByText(/Unable to load dashboard data:/i)).toBeInTheDocument();
      });
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();

      // Click Retry after server recovers
      fail = false;
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));

      // Tasks should successfully load after retry
      await waitFor(() => {
        expect(screen.queryByText(/Unable to load dashboard data/i)).not.toBeInTheDocument();
        expect(screen.getByText("Complete quarterly review")).toBeInTheDocument();
      });
    });
  });
});
