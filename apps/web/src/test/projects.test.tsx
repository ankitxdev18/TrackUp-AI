import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { App } from "../App";
import type { Project } from "../api/projects";
import type { Task } from "../api/tasks";

describe("Milestone 3: Projects Vertical Slice", () => {
  const mockProjects: Project[] = [
    {
      id: "proj-1",
      userId: "user-1",
      name: "Life OS Platform",
      description: "Core productivity system and vertical slices",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      taskCount: 4,
      completedTaskCount: 2,
    },
    {
      id: "proj-2",
      userId: "user-1",
      name: "Home Renovations",
      description: "Kitchen and backyard remodeling",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      taskCount: 0,
      completedTaskCount: 0,
    },
    {
      id: "proj-3",
      userId: "user-1",
      name: "Archived Initiative",
      description: "Past quarter retrospective",
      status: "ARCHIVED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      taskCount: 2,
      completedTaskCount: 2,
    },
  ];

  const mockTasks: Task[] = [
    {
      id: "t-1",
      userId: "user-1",
      projectId: "proj-1",
      projectName: "Life OS Platform",
      title: "Implement database migrations",
      status: "COMPLETED",
      priority: "HIGH",
      dueDate: "2026-10-04",
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "t-2",
      userId: "user-1",
      projectId: "proj-1",
      projectName: "Life OS Platform",
      title: "Write authorization tests",
      status: "TODO",
      priority: "HIGH",
      dueDate: "2026-10-05",
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "t-3",
      userId: "user-1",
      projectId: null,
      projectName: null,
      title: "Buy groceries",
      status: "TODO",
      priority: "LOW",
      dueDate: null,
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

  describe("Projects List Page (/projects)", () => {
    it("renders loading state then project list with task statistics", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: mockProjects }) } as Response;
        }
        return { ok: true, json: async () => ({ tasks: mockTasks }) } as Response;
      });

      window.history.pushState({}, "", "/projects");
      render(<App />);

      expect(screen.getByRole("heading", { name: "Projects & Initiatives" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /New Project/i })).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText("Life OS Platform")).toBeInTheDocument();
        expect(screen.getByText("Home Renovations")).toBeInTheDocument();
      });

      // Filter tabs: All, Active, Archived
      expect(screen.getByRole("tab", { name: /All Projects/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Active/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Archived/i })).toBeInTheDocument();

      // Stats check
      expect(screen.getByText("2/4 tasks (50%)")).toBeInTheDocument();
      expect(screen.getByText("0 tasks")).toBeInTheDocument();
    });

    it("displays deliberate empty state when no projects exist", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        return { ok: true, json: async () => ({ projects: [] }) } as Response;
      });

      window.history.pushState({}, "", "/projects");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("You don't have any projects yet.")).toBeInTheDocument();
        expect(
          screen.getByText("Organize tasks and track progress by creating your first strategic initiative.")
        ).toBeInTheDocument();
      });
    });

    it("opens create project modal and adds newly created project to list", async () => {
      const createdProject: Project = {
        id: "proj-new",
        userId: "user-1",
        name: "Mobile Companion App",
        description: "React Native or PWA companion client",
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        taskCount: 0,
        completedTaskCount: 0,
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
        const method = init?.method || "GET";
        if (method === "POST") {
          return { ok: true, json: async () => ({ project: createdProject }) } as Response;
        }
        return { ok: true, json: async () => ({ projects: [mockProjects[0]] }) } as Response;
      });

      window.history.pushState({}, "", "/projects");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Life OS Platform")).toBeInTheDocument();
      });

      const newBtn = screen.getByRole("button", { name: /New Project/i });
      fireEvent.click(newBtn);

      const modal = screen.getByRole("dialog");
      expect(within(modal).getByRole("heading", { name: "Create New Project" })).toBeInTheDocument();

      const nameInput = within(modal).getByLabelText(/Project Name/i);
      fireEvent.change(nameInput, { target: { value: "Mobile Companion App" } });

      const descInput = within(modal).getByLabelText(/Description/i);
      fireEvent.change(descInput, {
        target: { value: "React Native or PWA companion client" },
      });

      const submitBtn = within(modal).getByRole("button", { name: "Create Project" });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText("Mobile Companion App")).toBeInTheDocument();
      });
    });
  });

  describe("Project Detail Page (/projects/:id)", () => {
    it("renders project detail, tasks list, and allows archiving project", async () => {
      const proj = { ...mockProjects[0] };
      const projTasks = mockTasks.filter((t) => t.projectId === proj.id);

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method || "GET";

        if (url.includes(`/api/projects/${proj.id}`) && method === "PATCH") {
          return {
            ok: true,
            json: async () => ({
              project: { ...proj, status: "ARCHIVED" },
            }),
          } as Response;
        }

        if (url.includes(`/api/projects/${proj.id}`)) {
          return {
            ok: true,
            json: async () => ({ project: proj, tasks: projTasks }),
          } as Response;
        }

        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [proj] }) } as Response;
        }

        return { ok: true, json: async () => ({ tasks: projTasks }) } as Response;
      });

      window.history.pushState({}, "", `/projects/${proj.id}`);
      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: proj.name })).toBeInTheDocument();
        expect(screen.getByText(proj.description!)).toBeInTheDocument();
        expect(screen.getByText("Implement database migrations")).toBeInTheDocument();
        expect(screen.getByText("Write authorization tests")).toBeInTheDocument();
      });

      // Click Archive Project button
      const archiveBtn = screen.getByRole("button", { name: "Archive" });
      fireEvent.click(archiveBtn);

      await waitFor(() => {
        expect(screen.getByText("Archived")).toBeInTheDocument();
      });
    });

    it("handles zero-task project gracefully with empty state", async () => {
      const emptyProj = { ...mockProjects[1] }; // Home Renovations, 0 tasks

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes(`/api/projects/${emptyProj.id}`)) {
          return {
            ok: true,
            json: async () => ({ project: emptyProj, tasks: [] }),
          } as Response;
        }
        if (url.includes("/api/projects")) {
          return { ok: true, json: async () => ({ projects: [emptyProj] }) } as Response;
        }
        return { ok: true, json: async () => ({ tasks: [] }) } as Response;
      });

      window.history.pushState({}, "", `/projects/${emptyProj.id}`);
      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: emptyProj.name })).toBeInTheDocument();
        expect(screen.getByText("No tasks in this project yet.")).toBeInTheDocument();
        expect(screen.getByText("0%")).toBeInTheDocument();
      });
    });
  });

  describe("Dashboard Projects Integration", () => {
    it("renders Active Projects section with live calculated progress and zero-task state", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/projects")) {
          return {
            ok: true,
            json: async () => ({ projects: mockProjects }),
          } as Response;
        }
        return { ok: true, json: async () => ({ tasks: mockTasks }) } as Response;
      });

      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Active Projects" })).toBeInTheDocument();
      });

      const projectsPanel = screen.getByRole("region", { name: "Active Projects" });

      // Project 1 (Life OS Platform: 2/4 = 50%)
      expect(within(projectsPanel).getByText("Life OS Platform")).toBeInTheDocument();
      expect(within(projectsPanel).getByText("2/4 (50%)")).toBeInTheDocument();

      // Project 2 (Home Renovations: 0 tasks)
      expect(within(projectsPanel).getByText("Home Renovations")).toBeInTheDocument();
      expect(within(projectsPanel).getByText("0 tasks")).toBeInTheDocument();

      // Archived initiative is NOT in Active Projects list
      expect(within(projectsPanel).queryByText("Archived Initiative")).not.toBeInTheDocument();
    });
  });

  describe("Tasks Page Project Filter", () => {
    it("filters tasks by selected project and displays project badges", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/projects")) {
          return {
            ok: true,
            json: async () => ({ projects: mockProjects }),
          } as Response;
        }
        if (url.includes("projectId=proj-1")) {
          return {
            ok: true,
            json: async () => ({
              tasks: mockTasks.filter((t) => t.projectId === "proj-1"),
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({ tasks: mockTasks }) } as Response;
      });

      window.history.pushState({}, "", "/tasks");
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Implement database migrations")).toBeInTheDocument();
        expect(screen.getByText("Buy groceries")).toBeInTheDocument();
      });

      // Filter select exists
      const filterSelect = screen.getByLabelText("Filter tasks by project");
      expect(filterSelect).toBeInTheDocument();

      // Filter by "Life OS Platform"
      fireEvent.change(filterSelect, { target: { value: "proj-1" } });

      await waitFor(() => {
        expect(screen.getByText("Implement database migrations")).toBeInTheDocument();
        expect(screen.queryByText("Buy groceries")).not.toBeInTheDocument();
      });
    });
  });
});
