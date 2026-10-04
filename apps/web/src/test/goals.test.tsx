import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { App } from "../App";
import type { Goal } from "../api/goals";
import type { Task } from "../api/tasks";

describe("Milestone 4: Goals Vertical Slice & Dashboard Integration", () => {
  const mockGoals: Goal[] = [
    {
      id: "goal-1",
      userId: "user-1",
      title: "Become internship-ready",
      description: "Master DSA, build full-stack apps, and polish portfolio",
      status: "ACTIVE",
      progress: 80,
      targetDate: "2026-12-01",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "goal-2",
      userId: "user-1",
      title: "Build TrackUp Life OS",
      description: "Complete all core milestones with production-grade quality",
      status: "ACTIVE",
      progress: 60,
      targetDate: "2026-11-15",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "goal-3",
      userId: "user-1",
      title: "Finished Milestone 1",
      description: "Foundation product shell",
      status: "COMPLETED",
      progress: 100,
      targetDate: "2026-09-01",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "goal-4",
      userId: "user-1",
      title: "Archived Exploratory Idea",
      description: "Old notes",
      status: "ARCHIVED",
      progress: 25,
      targetDate: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockTasks: Task[] = [
    {
      id: "task-1",
      userId: "user-1",
      title: "Daily DSA practice",
      status: "TODO",
      priority: "HIGH",
      dueDate: "2026-10-04",
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, options?: any) => {
        const urlStr = url.toString();

        // Auth endpoint
        if (urlStr.includes("/api/auth/me")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              user: {
                id: "user-1",
                name: "Alex Mercer",
                email: "alex@example.com",
              },
            }),
          };
        }

        // Single Goal GET
        if (urlStr.match(/\/api\/goals\/goal-1$/)) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ goal: mockGoals[0] }),
          };
        }

        // Single Goal PATCH
        if (urlStr.match(/\/api\/goals\/goal-1$/) && options?.method === "PATCH") {
          const body = JSON.parse(options.body);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              goal: { ...mockGoals[0], ...body },
            }),
          };
        }

        // Single Goal DELETE
        if (urlStr.match(/\/api\/goals\/goal-1$/) && options?.method === "DELETE") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, id: "goal-1" }),
          };
        }

        // Goals List & Creation
        if (urlStr.includes("/api/goals")) {
          if (options?.method === "POST") {
            const body = JSON.parse(options.body);
            const newGoal: Goal = {
              id: "goal-new",
              userId: "user-1",
              title: body.title,
              description: body.description ?? null,
              status: body.status ?? "ACTIVE",
              progress: body.progress ?? 0,
              targetDate: body.targetDate ?? null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            return {
              ok: true,
              status: 201,
              json: async () => ({ goal: newGoal }),
            };
          }

          if (urlStr.includes("status=ACTIVE")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                goals: mockGoals.filter((g) => g.status === "ACTIVE"),
              }),
            };
          }

          return {
            ok: true,
            status: 200,
            json: async () => ({ goals: mockGoals }),
          };
        }

        // Projects endpoint
        if (urlStr.includes("/api/projects")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ projects: [] }),
          };
        }

        // Tasks endpoint
        if (urlStr.includes("/api/tasks")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ tasks: mockTasks }),
          };
        }

        return {
          ok: false,
          status: 404,
          json: async () => ({ error: "Not Found" }),
        };
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Navigation & Goals List
  it("renders the Goals page at /goals with filters and counts", async () => {
    window.history.pushState({}, "", "/goals");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Goals" })).toBeInTheDocument();
    });

    expect(
      screen.getByText("Track high-level outcomes and meaningful life milestones.")
    ).toBeInTheDocument();

    // Verify filter buttons and counts
    expect(screen.getByRole("tab", { name: /All/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Active/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Completed/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Archived/i })).toBeInTheDocument();

    // Verify Active goals are rendered by default
    expect(screen.getByText("Become internship-ready")).toBeInTheDocument();
    expect(screen.getByText("Build TrackUp Life OS")).toBeInTheDocument();

    // Verify progress bars have proper ARIA attributes
    const progressBars = screen.getAllByRole("progressbar");
    expect(progressBars.length).toBeGreaterThan(0);
    expect(progressBars[0]).toHaveAttribute("aria-valuemin", "0");
    expect(progressBars[0]).toHaveAttribute("aria-valuemax", "100");
  });

  // 2. Filter toggling
  it("filters goals by status tabs (Completed, Archived, All)", async () => {
    window.history.pushState({}, "", "/goals");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Become internship-ready")).toBeInTheDocument();
    });

    // Click Completed filter
    fireEvent.click(screen.getByRole("tab", { name: /Completed/i }));
    expect(screen.getByText("Finished Milestone 1")).toBeInTheDocument();
    expect(screen.queryByText("Become internship-ready")).not.toBeInTheDocument();

    // Click Archived filter
    fireEvent.click(screen.getByRole("tab", { name: /Archived/i }));
    expect(screen.getByText("Archived Exploratory Idea")).toBeInTheDocument();
    expect(screen.queryByText("Finished Milestone 1")).not.toBeInTheDocument();

    // Click All filter
    fireEvent.click(screen.getByRole("tab", { name: /All/i }));
    expect(screen.getByText("Become internship-ready")).toBeInTheDocument();
    expect(screen.getByText("Finished Milestone 1")).toBeInTheDocument();
    expect(screen.getByText("Archived Exploratory Idea")).toBeInTheDocument();
  });

  // 3. Create Goal flow
  it("opens create goal modal, submits valid form, and adds new goal", async () => {
    window.history.pushState({}, "", "/goals");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Become internship-ready")).toBeInTheDocument();
    });

    // Click Create Goal button
    fireEvent.click(screen.getByRole("button", { name: /Create Goal/i }));

    // Verify modal is open with dialog role
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Create New Goal" })).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByLabelText(/Outcome Title/i), {
      target: { value: "Run a half-marathon" },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: "Train 4 days a week and track pace" },
    });

    // Submit
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Create Goal",
      })
    );

    await waitFor(() => {
      expect(screen.getByText("Run a half-marathon")).toBeInTheDocument();
    });
  });

  // 4. Empty State
  it("renders empty state when there are zero goals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (url.toString().includes("/api/auth/me")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ user: { id: "user-1", name: "Alex" } }),
          };
        }
        if (url.toString().includes("/api/goals")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ goals: [] }),
          };
        }
        return { ok: true, status: 200, json: async () => [] };
      })
    );

    window.history.pushState({}, "", "/goals");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("No goals yet.")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Create your first goal/i })).toBeInTheDocument();
  });

  // 5. Error & Retry State
  it("displays error banner when Goals API fails and allows retry", async () => {
    let shouldFail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (url.toString().includes("/api/auth/me")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ user: { id: "user-1", name: "Alex" } }),
          };
        }
        if (url.toString().includes("/api/goals")) {
          if (shouldFail) {
            return {
              ok: false,
              status: 500,
              json: async () => ({ error: "Server database connection timed out" }),
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ goals: mockGoals }),
          };
        }
        return { ok: true, status: 200, json: async () => [] };
      })
    );

    window.history.pushState({}, "", "/goals");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText("Server database connection timed out")).toBeInTheDocument();

    // Click retry
    shouldFail = false;
    fireEvent.click(screen.getByRole("button", { name: /Retry/i }));

    await waitFor(() => {
      expect(screen.getByText("Become internship-ready")).toBeInTheDocument();
    });
  });

  // 6. Goal Detail Page
  it("renders goal detail view at /goals/:id with actions", async () => {
    window.history.pushState({}, "", "/goals/goal-1");
    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: "Become internship-ready" })
      ).toBeInTheDocument();
    });

    expect(screen.getByText(/Master DSA, build full-stack apps/)).toBeInTheDocument();
    expect(screen.getByText("80% Complete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark Complete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  // 7. Dashboard Integration: Active Goals
  it("renders Active Goals section on the Dashboard with progress bars and target dates", async () => {
    window.history.pushState({}, "", "/dashboard");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Active Goals" })).toBeInTheDocument();
    });

    expect(screen.getByText("Become internship-ready")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("Build TrackUp Life OS")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
  });

  // 8. Dashboard Failure Isolation
  it("isolates Goals API failure on Dashboard so Tasks and core UI remain operational", async () => {
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
        if (urlStr.includes("/api/projects")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ projects: [] }),
          };
        }
        if (urlStr.includes("/api/goals")) {
          // Goals API fails!
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: "Goals service temporarily offline" }),
          };
        }
        return { ok: true, status: 200, json: async () => [] };
      })
    );

    window.history.pushState({}, "", "/dashboard");
    render(<App />);

    // Tasks and core dashboard should still load properly!
    await waitFor(() => {
      expect(screen.getByText("Daily DSA practice")).toBeInTheDocument();
    });

    // Goals panel displays its isolated error banner with retry button
    expect(screen.getByText("Goals service temporarily offline")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry goals/i })).toBeInTheDocument();

    // Verify core dashboard error is NOT displayed
    expect(screen.queryByText("Failed to load dashboard data")).not.toBeInTheDocument();
  });
});
