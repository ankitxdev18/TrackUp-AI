import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { App } from "../App";
import {
  getTodayDateString,
  getTomorrowDateString,
  isTaskCompletedToday,
  type Task,
} from "../api/tasks";
import { setTestAuthOverride } from "../context/AuthContext";

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
    setTestAuthOverride(null);
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
      expect(screen.getByRole("tab", { name: /Overdue/i })).toBeInTheDocument();
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

    it("handles safe inline deletion of a task", async () => {
      let deletedId: string | null = null;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method || "GET";

        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }

        if (method === "DELETE") {
          deletedId = url.split("/").pop() || null;
          return { ok: true, json: async () => ({ success: true }) } as Response;
        }

        return { ok: true, json: async () => ({ tasks: [...mockTasks] }) } as Response;
      });

      window.history.pushState({}, "", "/tasks");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Complete quarterly review")).toBeInTheDocument();
      });

      // Click delete button on the first task
      const deleteBtn = screen.getByRole("button", {
        name: "Delete task: Complete quarterly review",
      });
      fireEvent.click(deleteBtn);

      // Inline confirmation box appears with Yes / No
      expect(screen.getByText("Delete?")).toBeInTheDocument();
      const confirmYesBtn = screen.getByRole("button", {
        name: "Confirm delete task: Complete quarterly review",
      });
      fireEvent.click(confirmYesBtn);

      // Task is optimistically removed and DELETE was called
      await waitFor(() => {
        expect(deletedId).toBe("t-1");
        expect(screen.queryByText("Complete quarterly review")).not.toBeInTheDocument();
      });
    });

    it("renders overdue badge with days overdue for past due tasks", async () => {
      const overdueTask: Task = {
        id: "t-overdue",
        userId: "user-1",
        title: "Overdue report submission",
        status: "TODO",
        priority: "HIGH",
        dueDate: "2020-01-01",
        completedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }
        return { ok: true, json: async () => ({ tasks: [overdueTask] }) } as Response;
      });

      window.history.pushState({}, "", "/tasks");
      render(<App />);
      expect(screen.getByRole("heading", { name: "Tasks & Planning" })).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText("Overdue report submission")).toBeInTheDocument();
        expect(screen.getByText(/Overdue \d+d/i)).toBeInTheDocument();
      });
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

  describe("Milestone 5: Task Editing and Rescheduling", () => {
    const tomorrowStr = getTomorrowDateString();

    it("renders edit button on task item and opens edit modal with prefilled values", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [{ id: "p-1", name: "Alpha Initiative", status: "ACTIVE" }] }) } as Response;
        }
        return { ok: true, json: async () => ({ tasks: [mockTasks[0]] }) } as Response;
      });

      window.history.pushState({}, "", "/tasks");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Complete quarterly review")).toBeInTheDocument();
      });

      const editBtn = screen.getByRole("button", { name: "Edit task: Complete quarterly review" });
      expect(editBtn).toBeInTheDocument();

      fireEvent.click(editBtn);

      // Verify modal header indicates edit mode and projects have loaded
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Edit Task" })).toBeInTheDocument();
        expect(within(screen.getByRole("dialog")).getByText("Alpha Initiative")).toBeInTheDocument();
      });
      expect(screen.getByText("Update task details and schedule")).toBeInTheDocument();

      // Verify prefilled inputs
      const dialog = screen.getByRole("dialog");
      const titleInput = within(dialog).getByPlaceholderText("What needs to be done?") as HTMLInputElement;
      expect(titleInput.value).toBe("Complete quarterly review");

      const highPill = within(dialog).getByRole("radio", { name: "High" });
      expect(highPill).toHaveAttribute("aria-checked", "true");

      const dateInput = within(dialog).getByLabelText(/^Due Date/i) as HTMLInputElement;
      expect(dateInput.value).toBe(todayStr);

      const submitBtn = within(dialog).getByRole("button", { name: "Save Changes" });
      expect(submitBtn).toBeInTheDocument();
    });

    it("updates task title, priority, due date, and project association", async () => {
      let patchBody: any = null;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method || "GET";

        if (url.includes("/api/projects")) {
          return {
            ok: true,
            json: async () => ({
              projects: [{ id: "p-1", name: "Alpha Initiative", status: "ACTIVE" }],
            }),
          } as Response;
        }

        if (method === "PATCH") {
          patchBody = JSON.parse(String(init?.body || "{}"));
          return {
            ok: true,
            json: async () => ({
              task: {
                ...mockTasks[0],
                ...patchBody,
                projectName: patchBody.projectId === "p-1" ? "Alpha Initiative" : null,
              },
            }),
          } as Response;
        }

        return { ok: true, json: async () => ({ tasks: [{ ...mockTasks[0] }] }) } as Response;
      });

      window.history.pushState({}, "", "/tasks");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Complete quarterly review")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Edit task: Complete quarterly review" }));

      const dialog = screen.getByRole("dialog");
      const titleInput = within(dialog).getByPlaceholderText("What needs to be done?");
      fireEvent.change(titleInput, { target: { value: "Updated review title" } });

      // Change priority to Low
      fireEvent.click(within(dialog).getByRole("radio", { name: "Low" }));

      // Select project after options load
      await waitFor(() => {
        expect(within(dialog).getByText("Alpha Initiative")).toBeInTheDocument();
      });
      const projectSelect = within(dialog).getByLabelText(/^Project/i);
      fireEvent.change(projectSelect, { target: { value: "p-1" } });

      // Change due date to tomorrow via quick button
      fireEvent.click(within(dialog).getByRole("button", { name: "Tomorrow" }));

      // Submit
      fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));

      await waitFor(() => {
        expect(patchBody).toEqual({
          title: "Updated review title",
          priority: "LOW",
          dueDate: tomorrowStr,
          projectId: "p-1",
        });
        expect(screen.getByText("Updated review title")).toBeInTheDocument();
        expect(screen.getByTitle("Project: Alpha Initiative")).toBeInTheDocument();
      });
    });

    it("supports Today, Tomorrow, and Clear quick date actions in edit modal", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/projects")) {
          return {
            ok: true,
            json: async () => ({ projects: [{ id: "p-demo", name: "Demo Project", status: "ACTIVE" }] }),
          } as Response;
        }
        return { ok: true, json: async () => ({ tasks: [mockTasks[0]] }) } as Response;
      });

      window.history.pushState({}, "", "/tasks");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Complete quarterly review")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Edit task: Complete quarterly review" }));

      const dialog = screen.getByRole("dialog");
      await waitFor(() => {
        expect(within(dialog).getByText("Demo Project")).toBeInTheDocument();
      });
      const dateInput = within(dialog).getByLabelText(/^Due Date/i) as HTMLInputElement;
      expect(dateInput.value).toBe(todayStr);

      // Click Tomorrow
      fireEvent.click(within(dialog).getByRole("button", { name: "Tomorrow" }));
      expect(dateInput.value).toBe(tomorrowStr);

      // Click Clear (aria-label="Clear due date")
      fireEvent.click(within(dialog).getByRole("button", { name: /Clear/i }));
      expect(dateInput.value).toBe("");

      // Click Today
      fireEvent.click(within(dialog).getByRole("button", { name: "Today" }));
      expect(dateInput.value).toBe(todayStr);
    });

    it("displays API failure inside modal without closing and preserves user input", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method || "GET";

        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }

        if (method === "PATCH") {
          return {
            ok: false,
            status: 400,
            json: async () => ({ code: "INVALID_PROJECT", error: "Project not found or not owned by user" }),
          } as Response;
        }

        return { ok: true, json: async () => ({ tasks: [mockTasks[0]] }) } as Response;
      });

      window.history.pushState({}, "", "/tasks");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Complete quarterly review")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Edit task: Complete quarterly review" }));

      const titleInput = screen.getByPlaceholderText("What needs to be done?") as HTMLInputElement;
      fireEvent.change(titleInput, { target: { value: "Tentative edit title" } });

      fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

      // Modal stays open and renders error alert
      await waitFor(() => {
        expect(screen.getByText("Project not found or not owned by user")).toBeInTheDocument();
      });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      // User input was preserved
      expect(titleInput.value).toBe("Tentative edit title");
    });

    it("discards unsaved edits without sending request when cancelled or Escape pressed", async () => {
      let patchCalled = false;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method || "GET";

        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }

        if (method === "PATCH") {
          patchCalled = true;
          return { ok: true, json: async () => ({}) } as Response;
        }

        return { ok: true, json: async () => ({ tasks: [mockTasks[0]] }) } as Response;
      });

      window.history.pushState({}, "", "/tasks");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Complete quarterly review")).toBeInTheDocument();
      });

      // Test Cancel button
      fireEvent.click(screen.getByRole("button", { name: "Edit task: Complete quarterly review" }));
      const titleInput = screen.getByPlaceholderText("What needs to be done?");
      fireEvent.change(titleInput, { target: { value: "Discarded title" } });
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(patchCalled).toBe(false);
      expect(screen.getByText("Complete quarterly review")).toBeInTheDocument();

      // Test Escape key
      fireEvent.click(screen.getByRole("button", { name: "Edit task: Complete quarterly review" }));
      fireEvent.change(screen.getByPlaceholderText("What needs to be done?"), { target: { value: "Discarded 2" } });
      fireEvent.keyDown(window, { key: "Escape" });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(patchCalled).toBe(false);
      expect(screen.getByText("Complete quarterly review")).toBeInTheDocument();
    });

    it("recalculates filter tab membership and counts after rescheduling in TasksPage", async () => {
      let tasksList = [...mockTasks];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method || "GET";

        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }

        if (method === "PATCH") {
          const body = JSON.parse(String(init?.body || "{}"));
          const updated = { ...tasksList[0], ...body };
          tasksList = tasksList.map((t) => (t.id === updated.id ? updated : t));
          return { ok: true, json: async () => ({ task: updated }) } as Response;
        }

        return { ok: true, json: async () => ({ tasks: tasksList }) } as Response;
      });

      window.history.pushState({}, "", "/tasks");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Complete quarterly review")).toBeInTheDocument();
      });

      // Initial counts: Today = 2 (t-1, t-2), Upcoming = 1 (t-3)
      const todayTab = screen.getByRole("tab", { name: /Today/i });
      const upcomingTab = screen.getByRole("tab", { name: /Upcoming/i });
      expect(within(todayTab).getByText("2")).toBeInTheDocument();
      expect(within(upcomingTab).getByText("1")).toBeInTheDocument();

      // Edit t-1 from Today to Tomorrow
      fireEvent.click(screen.getByRole("button", { name: "Edit task: Complete quarterly review" }));
      fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
      fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

      // Tab counts recalculate: Today = 1, Upcoming = 2
      await waitFor(() => {
        expect(within(todayTab).getByText("1")).toBeInTheDocument();
        expect(within(upcomingTab).getByText("2")).toBeInTheDocument();
      });

      // Switch to Today tab: t-1 is no longer in Today tab
      fireEvent.click(todayTab);
      expect(screen.queryByText("Complete quarterly review")).not.toBeInTheDocument();

      // Switch to Upcoming tab: t-1 is now visible in Upcoming tab
      fireEvent.click(upcomingTab);
      expect(screen.getByText("Complete quarterly review")).toBeInTheDocument();
    });

    it("reschedules an overdue task from OverdueTriage into TodayTasks on Dashboard", async () => {
      const overdueTask: Task = {
        id: "t-overdue-1",
        userId: "user-1",
        title: "Triage overdue client invoice",
        status: "TODO",
        priority: "HIGH",
        dueDate: "2020-01-01",
        completedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      let currentTasks = [overdueTask, ...mockTasks];

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method || "GET";

        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }

        if (method === "PATCH") {
          const body = JSON.parse(String(init?.body || "{}"));
          const updated = { ...overdueTask, ...body };
          currentTasks = currentTasks.map((t) => (t.id === updated.id ? updated : t));
          return { ok: true, json: async () => ({ task: updated }) } as Response;
        }

        return { ok: true, json: async () => ({ tasks: currentTasks }) } as Response;
      });

      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      // Initially OverdueTriage is visible with overdue task
      await waitFor(() => {
        expect(screen.getByText("Overdue · 1 task")).toBeInTheDocument();
        expect(screen.getByText("Triage overdue client invoice")).toBeInTheDocument();
      });

      // Header indicates 1 overdue
      expect(screen.getByText(/1 overdue/i)).toBeInTheDocument();

      // Click Edit on the overdue task in OverdueTriage
      const editOverdueBtn = screen.getByRole("button", { name: "Edit task: Triage overdue client invoice" });
      fireEvent.click(editOverdueBtn);

      // Reschedule to Today
      fireEvent.click(screen.getByRole("button", { name: "Today" }));
      fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

      // After update: OverdueTriage disappears completely
      await waitFor(() => {
        expect(screen.queryByText(/Overdue ·/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/1 overdue/i)).not.toBeInTheDocument();
      });

      // Task is now inside TodayTasks
      expect(screen.getByText("Triage overdue client invoice")).toBeInTheDocument();

      // Today's tasks count in header updated: 1 of 3 completed
      expect(screen.getByText("1 of 3 completed")).toBeInTheDocument();
    }, 25000);
  });

  describe("Milestone 7: Overdue Task Visibility", () => {
    const overdueTask1: Task = {
      id: "t-od-1",
      userId: "user-1",
      title: "File quarterly tax report",
      status: "TODO",
      priority: "HIGH",
      dueDate: "2020-01-15",
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const overdueTask2: Task = {
      id: "t-od-2",
      userId: "user-1",
      title: "Renew domain registration",
      status: "TODO",
      priority: "MEDIUM",
      dueDate: "2020-02-01",
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const completedOverdueTask: Task = {
      id: "t-od-completed",
      userId: "user-1",
      title: "Archive old audit logs",
      status: "COMPLETED",
      priority: "LOW",
      dueDate: "2020-01-01",
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const backlogTaskNoDate: Task = {
      id: "t-backlog",
      userId: "user-1",
      title: "Brainstorm marketing ideas",
      status: "TODO",
      priority: "LOW",
      dueDate: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mixedTasks: Task[] = [
      overdueTask1,
      overdueTask2,
      completedOverdueTask,
      backlogTaskNoDate,
      ...mockTasks,
    ];

    it("displays incomplete overdue tasks and excludes today, future, completed, and dateless tasks", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }
        return { ok: true, json: async () => ({ tasks: mixedTasks }) } as Response;
      });

      window.history.pushState({}, "", "/tasks");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("File quarterly tax report")).toBeInTheDocument();
      });

      // Tab count check: 2 overdue tasks (t-od-1, t-od-2)
      const overdueTab = screen.getByRole("tab", { name: /Overdue/i });
      expect(within(overdueTab).getByText("2")).toBeInTheDocument();

      // Click Overdue tab
      fireEvent.click(overdueTab);
      expect(overdueTab).toHaveAttribute("aria-selected", "true");

      // Incomplete overdue tasks are present
      expect(screen.getByText("File quarterly tax report")).toBeInTheDocument();
      expect(screen.getByText("Renew domain registration")).toBeInTheDocument();

      // Today's tasks are excluded
      expect(screen.queryByText("Complete quarterly review")).not.toBeInTheDocument();
      expect(screen.queryByText("Daily morning workout")).not.toBeInTheDocument();

      // Upcoming tasks are excluded
      expect(screen.queryByText("Plan road trip itinerary")).not.toBeInTheDocument();

      // Completed overdue tasks are excluded
      expect(screen.queryByText("Archive old audit logs")).not.toBeInTheDocument();

      // Dateless backlog tasks are excluded
      expect(screen.queryByText("Brainstorm marketing ideas")).not.toBeInTheDocument();
    });

    it("completing an overdue task removes it and updates the overdue count immediately", async () => {
      let currentTasks = [...mixedTasks];

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method || "GET";

        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }

        if (method === "PATCH") {
          const body = JSON.parse(String(init?.body || "{}"));
          const updated = {
            ...overdueTask1,
            ...body,
            completedAt: body.status === "COMPLETED" ? new Date().toISOString() : null,
          };
          currentTasks = currentTasks.map((t) => (t.id === updated.id ? updated : t));
          return { ok: true, json: async () => ({ task: updated }) } as Response;
        }

        return { ok: true, json: async () => ({ tasks: currentTasks }) } as Response;
      });

      window.history.pushState({}, "", "/tasks");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("File quarterly tax report")).toBeInTheDocument();
      });

      const overdueTab = screen.getByRole("tab", { name: /Overdue/i });
      expect(within(overdueTab).getByText("2")).toBeInTheDocument();

      fireEvent.click(overdueTab);

      // Check off the first overdue task
      const checkbox = screen.getByRole("checkbox", { name: "Mark File quarterly tax report as complete" });
      fireEvent.click(checkbox);

      // Immediately removed from Overdue list and count decrements to 1
      await waitFor(() => {
        expect(within(overdueTab).getByText("1")).toBeInTheDocument();
        expect(screen.queryByText("File quarterly tax report")).not.toBeInTheDocument();
      });

      // The second overdue task remains visible
      expect(screen.getByText("Renew domain registration")).toBeInTheDocument();

      // Switching to Completed tab shows the completed task
      const completedTab = screen.getByRole("tab", { name: /Completed/i });
      fireEvent.click(completedTab);
      expect(screen.getByText("File quarterly tax report")).toBeInTheDocument();
    });

    it("rescheduling an overdue task to today removes it from overdue and moves it to today", async () => {
      let currentTasks = [...mixedTasks];

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method || "GET";

        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }

        if (method === "PATCH") {
          const body = JSON.parse(String(init?.body || "{}"));
          const updated = { ...overdueTask1, ...body };
          currentTasks = currentTasks.map((t) => (t.id === updated.id ? updated : t));
          return { ok: true, json: async () => ({ task: updated }) } as Response;
        }

        return { ok: true, json: async () => ({ tasks: currentTasks }) } as Response;
      });

      window.history.pushState({}, "", "/tasks");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("File quarterly tax report")).toBeInTheDocument();
      });

      const overdueTab = screen.getByRole("tab", { name: /Overdue/i });
      const todayTab = screen.getByRole("tab", { name: /Today/i });

      // Initial: Overdue = 2, Today = 2
      expect(within(overdueTab).getByText("2")).toBeInTheDocument();
      expect(within(todayTab).getByText("2")).toBeInTheDocument();

      fireEvent.click(overdueTab);

      // Edit task-od-1
      const editBtn = screen.getByRole("button", { name: "Edit task: File quarterly tax report" });
      fireEvent.click(editBtn);

      // Reschedule to Today
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Today" }));
      fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));

      // Updates in place: Overdue = 1, Today = 3
      await waitFor(() => {
        expect(within(overdueTab).getByText("1")).toBeInTheDocument();
        expect(within(todayTab).getByText("3")).toBeInTheDocument();
      });

      // No longer in Overdue list
      expect(screen.queryByText("File quarterly tax report")).not.toBeInTheDocument();

      // Switch to Today tab: task is now visible
      fireEvent.click(todayTab);
      expect(screen.getByText("File quarterly tax report")).toBeInTheDocument();
    });

    it("rescheduling an overdue task to a future date removes it from overdue and moves it to upcoming", async () => {
      let currentTasks = [...mixedTasks];

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method || "GET";

        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }

        if (method === "PATCH") {
          const body = JSON.parse(String(init?.body || "{}"));
          const updated = { ...overdueTask1, ...body };
          currentTasks = currentTasks.map((t) => (t.id === updated.id ? updated : t));
          return { ok: true, json: async () => ({ task: updated }) } as Response;
        }

        return { ok: true, json: async () => ({ tasks: currentTasks }) } as Response;
      });

      window.history.pushState({}, "", "/tasks");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("File quarterly tax report")).toBeInTheDocument();
      });

      const overdueTab = screen.getByRole("tab", { name: /Overdue/i });
      const upcomingTab = screen.getByRole("tab", { name: /Upcoming/i });

      // Initial: Overdue = 2, Upcoming = 1
      expect(within(overdueTab).getByText("2")).toBeInTheDocument();
      expect(within(upcomingTab).getByText("1")).toBeInTheDocument();

      fireEvent.click(overdueTab);

      const editBtn = screen.getByRole("button", { name: "Edit task: File quarterly tax report" });
      fireEvent.click(editBtn);

      // Reschedule to Tomorrow
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Tomorrow" }));
      fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));

      // Updates in place: Overdue = 1, Upcoming = 2
      await waitFor(() => {
        expect(within(overdueTab).getByText("1")).toBeInTheDocument();
        expect(within(upcomingTab).getByText("2")).toBeInTheDocument();
      });

      // No longer in Overdue list
      expect(screen.queryByText("File quarterly tax report")).not.toBeInTheDocument();

      // Switch to Upcoming tab: task is now visible
      fireEvent.click(upcomingTab);
      expect(screen.getByText("File quarterly tax report")).toBeInTheDocument();
    });

    it("displays encouraging empty state when there are no overdue tasks", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }
        // Only return non-overdue tasks
        return { ok: true, json: async () => ({ tasks: mockTasks }) } as Response;
      });

      window.history.pushState({}, "", "/tasks");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Complete quarterly review")).toBeInTheDocument();
      });

      const overdueTab = screen.getByRole("tab", { name: /Overdue/i });
      expect(within(overdueTab).getByText("0")).toBeInTheDocument();

      fireEvent.click(overdueTab);

      expect(screen.getByText("No overdue tasks.")).toBeInTheDocument();
      expect(screen.getByText("You're all caught up on scheduled work. Keep up the great pace!")).toBeInTheDocument();
    });

    it("preserves behavior of All, Today, Upcoming, and Completed tabs", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }
        return { ok: true, json: async () => ({ tasks: mixedTasks }) } as Response;
      });

      window.history.pushState({}, "", "/tasks");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("File quarterly tax report")).toBeInTheDocument();
      });

      const allTab = screen.getByRole("tab", { name: /All Tasks/i });
      const todayTab = screen.getByRole("tab", { name: /Today/i });
      const upcomingTab = screen.getByRole("tab", { name: /Upcoming/i });
      const completedTab = screen.getByRole("tab", { name: /Completed/i });

      // All tab count = total mixed tasks (7 tasks)
      expect(within(allTab).getByText("7")).toBeInTheDocument();
      // Today tab count = 2 tasks (t-1, t-2)
      expect(within(todayTab).getByText("2")).toBeInTheDocument();
      // Upcoming tab count = 1 task (t-3)
      expect(within(upcomingTab).getByText("1")).toBeInTheDocument();
      // Completed tab count = 2 tasks (t-2, t-od-completed)
      expect(within(completedTab).getByText("2")).toBeInTheDocument();

      // Click Today tab: shows today's tasks
      fireEvent.click(todayTab);
      expect(screen.getByText("Complete quarterly review")).toBeInTheDocument();
      expect(screen.getByText("Daily morning workout")).toBeInTheDocument();
      expect(screen.queryByText("File quarterly tax report")).not.toBeInTheDocument();

      // Click Upcoming tab: shows upcoming tasks
      fireEvent.click(upcomingTab);
      expect(screen.getByText("Plan road trip itinerary")).toBeInTheDocument();
      expect(screen.queryByText("File quarterly tax report")).not.toBeInTheDocument();

      // Click Completed tab: shows completed tasks
      fireEvent.click(completedTab);
      expect(screen.getByText("Daily morning workout")).toBeInTheDocument();
      expect(screen.getByText("Archive old audit logs")).toBeInTheDocument();
      expect(screen.queryByText("File quarterly tax report")).not.toBeInTheDocument();

      // Click All tab: shows all tasks
      fireEvent.click(allTab);
      expect(screen.getByText("File quarterly tax report")).toBeInTheDocument();
      expect(screen.getByText("Brainstorm marketing ideas")).toBeInTheDocument();
    });
  });

  describe("Milestone 8: Daily Completion Metrics (Option C)", () => {
    it("completing a task due today updates both scheduled progress and Completed Today", async () => {
      const taskDueToday: Task = {
        id: "m8-today-1",
        userId: "user-1",
        title: "Submit sprint summary report",
        status: "TODO",
        priority: "HIGH",
        dueDate: todayStr,
        completedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      let taskList: Task[] = [taskDueToday];

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method || "GET";

        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }

        if (method === "PATCH") {
          const body = JSON.parse(String(init?.body || "{}"));
          const updated: Task = {
            ...taskDueToday,
            ...body,
            completedAt: body.status === "COMPLETED" ? new Date().toISOString() : null,
          };
          taskList = taskList.map((t) => (t.id === updated.id ? updated : t));
          return { ok: true, json: async () => ({ task: updated }) } as Response;
        }

        return { ok: true, json: async () => ({ tasks: taskList }) } as Response;
      });

      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Submit sprint summary report")).toBeInTheDocument();
      });

      // Initially 0 of 1 completed scheduled, 0 tasks completed today
      expect(screen.getByText("0 of 1 completed")).toBeInTheDocument();
      const completedTodayCard = screen.getByTestId("momentum-card-completed-today");
      expect(within(completedTodayCard).getByText("0 tasks")).toBeInTheDocument();

      // Check off the task due today
      const checkbox = screen.getByRole("checkbox", {
        name: "Mark Submit sprint summary report as complete",
      });
      fireEvent.click(checkbox);

      // Updates scheduled progress (1 of 1 completed, 100%) and Completed Today (1 task)
      await waitFor(() => {
        expect(screen.getByText("1 of 1 completed")).toBeInTheDocument();
        expect(screen.getByText("100%")).toBeInTheDocument();
        expect(within(completedTodayCard).getByText("1 task")).toBeInTheDocument();
      });
    });

    it("completing an overdue task increases Completed Today but does not alter today's scheduled total", async () => {
      const todayTask: Task = {
        id: "m8-sched-1",
        userId: "user-1",
        title: "Daily standup meeting",
        status: "TODO",
        priority: "MEDIUM",
        dueDate: todayStr,
        completedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const overdueTask: Task = {
        id: "m8-overdue-1",
        userId: "user-1",
        title: "Fix critical production regression",
        status: "TODO",
        priority: "HIGH",
        dueDate: "2020-01-01",
        completedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      let taskList: Task[] = [todayTask, overdueTask];

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method || "GET";

        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }

        if (method === "PATCH") {
          const body = JSON.parse(String(init?.body || "{}"));
          const target = taskList.find((t) => t.id === "m8-overdue-1") || overdueTask;
          const updated: Task = {
            ...target,
            ...body,
            completedAt: body.status === "COMPLETED" ? new Date().toISOString() : null,
          };
          taskList = taskList.map((t) => (t.id === updated.id ? updated : t));
          return { ok: true, json: async () => ({ task: updated }) } as Response;
        }

        return { ok: true, json: async () => ({ tasks: taskList }) } as Response;
      });

      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Overdue · 1 task")).toBeInTheDocument();
        expect(screen.getByText("Fix critical production regression")).toBeInTheDocument();
      });

      // Scheduled progress initially: 0 of 1 completed (only m8-sched-1 is due today)
      expect(screen.getByText("0 of 1 completed")).toBeInTheDocument();
      const completedTodayCard = screen.getByTestId("momentum-card-completed-today");
      expect(within(completedTodayCard).getByText("0 tasks")).toBeInTheDocument();

      // Complete the overdue task from OverdueTriage
      const overdueCheckbox = screen.getByRole("checkbox", {
        name: "Mark Fix critical production regression as complete",
      });
      fireEvent.click(overdueCheckbox);

      // Overdue task removed from OverdueTriage
      await waitFor(() => {
        expect(screen.queryByText("Fix critical production regression")).not.toBeInTheDocument();
      });

      // Completed Today increases to 1 task, while today's scheduled total remains 1 (0 of 1 completed)
      expect(within(completedTodayCard).getByText("1 task")).toBeInTheDocument();
      expect(screen.getByText("0 of 1 completed")).toBeInTheDocument();
      expect(screen.getByText("0%")).toBeInTheDocument();
    });

    it("completing a future-dated task early increases Completed Today but does not alter scheduled total", async () => {
      const todayTask: Task = {
        id: "m8-sched-2",
        userId: "user-1",
        title: "Review daily metrics",
        status: "TODO",
        priority: "MEDIUM",
        dueDate: todayStr,
        completedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const futureTask: Task = {
        id: "m8-future-1",
        userId: "user-1",
        title: "Prepare upcoming quarterly deck",
        status: "TODO",
        priority: "LOW",
        dueDate: "2099-12-31",
        completedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      let taskList: Task[] = [todayTask, futureTask];

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method || "GET";

        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }

        if (method === "PATCH") {
          const body = JSON.parse(String(init?.body || "{}"));
          const updated: Task = {
            ...futureTask,
            ...body,
            completedAt: body.status === "COMPLETED" ? new Date().toISOString() : null,
          };
          taskList = taskList.map((t) => (t.id === updated.id ? updated : t));
          return { ok: true, json: async () => ({ task: updated }) } as Response;
        }

        return { ok: true, json: async () => ({ tasks: taskList }) } as Response;
      });

      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Prepare upcoming quarterly deck")).toBeInTheDocument();
      });

      // Scheduled: 0 of 1 completed; Completed Today: 0 tasks
      expect(screen.getByText("0 of 1 completed")).toBeInTheDocument();
      const completedTodayCard = screen.getByTestId("momentum-card-completed-today");
      expect(within(completedTodayCard).getByText("0 tasks")).toBeInTheDocument();

      // Complete future task from Upcoming widget
      const futureCheckbox = screen.getByRole("checkbox", {
        name: "Mark Prepare upcoming quarterly deck as complete",
      });
      fireEvent.click(futureCheckbox);

      await waitFor(() => {
        expect(screen.queryByText("Prepare upcoming quarterly deck")).not.toBeInTheDocument();
      });

      // Completed Today increases to 1 task, scheduled progress strictly unaltered at 0 of 1 completed
      expect(within(completedTodayCard).getByText("1 task")).toBeInTheDocument();
      expect(screen.getByText("0 of 1 completed")).toBeInTheDocument();
    });

    it("reopening a completed task clears it from Completed Today, and completing again counts it once", async () => {
      const task: Task = {
        id: "m8-toggle-task",
        userId: "user-1",
        title: "Deploy hotfix release",
        status: "COMPLETED",
        priority: "HIGH",
        dueDate: todayStr,
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      let currentTask = { ...task };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method || "GET";

        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }

        if (method === "PATCH") {
          const body = JSON.parse(String(init?.body || "{}"));
          currentTask = {
            ...currentTask,
            ...body,
            completedAt: body.status === "COMPLETED" ? new Date().toISOString() : null,
          };
          return { ok: true, json: async () => ({ task: currentTask }) } as Response;
        }

        return { ok: true, json: async () => ({ tasks: [currentTask] }) } as Response;
      });

      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Deploy hotfix release")).toBeInTheDocument();
      });

      // Initially completed: 1 of 1 completed, 1 task completed today
      expect(screen.getByText("1 of 1 completed")).toBeInTheDocument();
      const completedTodayCard = screen.getByTestId("momentum-card-completed-today");
      expect(within(completedTodayCard).getByText("1 task")).toBeInTheDocument();

      // Step 1: Reopen task
      const checkbox = screen.getByRole("checkbox", {
        name: "Mark Deploy hotfix release as incomplete",
      });
      fireEvent.click(checkbox);

      await waitFor(() => {
        expect(screen.getByText("0 of 1 completed")).toBeInTheDocument();
        expect(within(completedTodayCard).getByText("0 tasks")).toBeInTheDocument();
      });

      // Step 2: Complete the task again
      const reopenedCheckbox = screen.getByRole("checkbox", {
        name: "Mark Deploy hotfix release as complete",
      });
      fireEvent.click(reopenedCheckbox);

      // Counts exactly once (not twice)
      await waitFor(() => {
        expect(screen.getByText("1 of 1 completed")).toBeInTheDocument();
        expect(within(completedTodayCard).getByText("1 task")).toBeInTheDocument();
      });
    });

    it("excludes tasks without valid completion timestamps or tasks currently TODO", () => {
      // Missing completedAt
      expect(
        isTaskCompletedToday({ status: "COMPLETED", completedAt: null }, todayStr)
      ).toBe(false);

      // Invalid date string
      expect(
        isTaskCompletedToday({ status: "COMPLETED", completedAt: "not-a-timestamp" }, todayStr)
      ).toBe(false);

      // Status TODO even if completedAt is populated
      expect(
        isTaskCompletedToday(
          { status: "TODO", completedAt: new Date().toISOString() },
          todayStr
        )
      ).toBe(false);

      // Valid completion today
      expect(
        isTaskCompletedToday(
          { status: "COMPLETED", completedAt: new Date().toISOString() },
          todayStr
        )
      ).toBe(true);

      // Completed on past date
      expect(
        isTaskCompletedToday(
          { status: "COMPLETED", completedAt: "2020-01-01T12:00:00.000Z" },
          todayStr
        )
      ).toBe(false);
    });

    it("attributes near-midnight UTC timestamps correctly across negative and positive UTC-offset timezones", () => {
      // 1. Negative UTC offset: America/New_York (EDT, UTC-4)
      // Timestamp: 2026-10-17T03:30:00.000Z corresponds to 2026-10-16 23:30 EDT
      const lateNightUtc = "2026-10-17T03:30:00.000Z";
      expect(
        isTaskCompletedToday(
          { status: "COMPLETED", completedAt: lateNightUtc },
          "2026-10-16",
          "America/New_York"
        )
      ).toBe(true);

      expect(
        isTaskCompletedToday(
          { status: "COMPLETED", completedAt: lateNightUtc },
          "2026-10-17",
          "America/New_York"
        )
      ).toBe(false);

      // 2. Positive UTC offset: Asia/Kolkata (IST, UTC+5:30)
      // Timestamp: 2026-10-16T19:00:00.000Z corresponds to 2026-10-17 00:30 IST
      const earlyMorningUtc = "2026-10-16T19:00:00.000Z";
      expect(
        isTaskCompletedToday(
          { status: "COMPLETED", completedAt: earlyMorningUtc },
          "2026-10-17",
          "Asia/Kolkata"
        )
      ).toBe(true);

      expect(
        isTaskCompletedToday(
          { status: "COMPLETED", completedAt: earlyMorningUtc },
          "2026-10-16",
          "Asia/Kolkata"
        )
      ).toBe(false);
    });

    it("evaluates Completed Today in the authenticated user's configured timezone on the Dashboard", async () => {
      setTestAuthOverride({
        user: {
          id: "user-ny",
          name: "New York User",
          email: "ny@example.com",
          timezone: "America/New_York",
        },
        loading: false,
      });

      const nyTodayStr = getTodayDateString("America/New_York");

      const nyTask: Task = {
        id: "ny-task-1",
        userId: "user-ny",
        title: "New York late task",
        status: "COMPLETED",
        priority: "MEDIUM",
        dueDate: nyTodayStr,
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }
        return { ok: true, json: async () => ({ tasks: [nyTask] }) } as Response;
      });

      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("New York late task")).toBeInTheDocument();
      });

      const completedTodayCard = screen.getByTestId("momentum-card-completed-today");
      expect(within(completedTodayCard).getByText("1 task")).toBeInTheDocument();
    });

    it("zero-task and zero-completion states produce clean metrics without NaN or invalid percentages", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [] }) } as Response;
        }
        return { ok: true, json: async () => ({ tasks: [] }) } as Response;
      });

      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      const momentumStrip = await screen.findByRole("region", { name: "Daily momentum summary" });

      expect(within(momentumStrip).getByText("0 of 0 completed")).toBeInTheDocument();
      expect(within(momentumStrip).getByText("No tasks today")).toBeInTheDocument();
      expect(within(momentumStrip).queryByText(/NaN/)).not.toBeInTheDocument();
      expect(within(momentumStrip).queryByText(/Infinity/)).not.toBeInTheDocument();

      const completedTodayCard = screen.getByTestId("momentum-card-completed-today");
      expect(within(completedTodayCard).getByText("0 tasks")).toBeInTheDocument();
      expect(within(completedTodayCard).getByText("No completions yet")).toBeInTheDocument();
    });
  });
});
