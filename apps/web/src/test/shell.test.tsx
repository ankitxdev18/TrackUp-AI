import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { App } from "../App";

describe("TrackUp Product Shell & Landing Page (Milestone 1 & 2)", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/projects")) {
        return {
          ok: true,
          json: async () => ({ projects: [] }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          tasks: [
            {
              id: "shell-task-1",
              userId: "user-1",
              title: "Design new landing page",
              status: "TODO",
              priority: "HIGH",
              dueDate: new Date().toISOString().split("T")[0],
              completedAt: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
      } as Response;
    });
  });


  describe("Landing Page", () => {
    it("renders the TrackUp landing page at root URL", () => {
      render(<App />);

      // Brand & Navigation
      expect(screen.getAllByText("TrackUp").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Sign In").length).toBeGreaterThan(0);
      expect(screen.getByText("Get Started")).toBeInTheDocument();

      // Hero
      expect(screen.getByText("The Personal Life OS")).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Track Your Life/i);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Build a Better You/i);
      expect(screen.getByText("Explore Dashboard Preview")).toBeInTheDocument();

      // Product Value Pillars
      expect(screen.getByText("Organize Your Day")).toBeInTheDocument();
      expect(screen.getByText("Connect Projects & Execution")).toBeInTheDocument();
      expect(screen.getByText("Build Atomic Habits")).toBeInTheDocument();
      expect(screen.getByText("One Source of Truth")).toBeInTheDocument();

      // Feature Previews
      expect(screen.getByText("Tasks & Planning")).toBeInTheDocument();
      expect(screen.getByText("Projects & Roadmaps")).toBeInTheDocument();
      expect(screen.getByText("Goals & Vision")).toBeInTheDocument();
      expect(screen.getByText("Habit Tracking")).toBeInTheDocument();
      expect(screen.getByText("Calendar & Timelines")).toBeInTheDocument();
      expect(screen.getByText("Progress Insights")).toBeInTheDocument();

      // How It Works
      expect(screen.getByText("Simple. Systematic. Repeatable.")).toBeInTheDocument();
      expect(screen.getByText("Plan")).toBeInTheDocument();
      expect(screen.getByText("Execute")).toBeInTheDocument();
      expect(screen.getByText("Track")).toBeInTheDocument();
      expect(screen.getByText("Improve")).toBeInTheDocument();

      // Final CTA
      expect(screen.getByText("Start building your personal Life OS today.")).toBeInTheDocument();
      expect(screen.getByText("Create Your Free Account")).toBeInTheDocument();
    });

    it("navigates to dashboard live preview on CTA click", async () => {
      render(<App />);

      const previewBtn = screen.getByText("Explore Dashboard Preview");
      fireEvent.click(previewBtn);

      expect(window.location.pathname).toBe("/dashboard");
      await waitFor(() => {
        expect(screen.getAllByText(/Good morning, Alex/i).length).toBeGreaterThan(0);
      });
    });

    it("navigates to signup on 'Start Your Workspace' click", () => {
      render(<App />);

      const signupBtn = screen.getByText("Start Your Workspace");
      fireEvent.click(signupBtn);

      expect(window.location.pathname).toBe("/signup");
      expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    });
  });

  describe("Routing & Auth Views", () => {
    it("renders signup view at /signup with working form elements", () => {
      window.history.pushState({}, "", "/signup");
      render(<App />);

      expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
      expect(screen.getByLabelText("Full Name")).toBeInTheDocument();
      expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
      expect(screen.getByLabelText("Password")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Create Account" })).toBeInTheDocument();
    });

    it("renders login view at /login with working form elements", () => {
      window.history.pushState({}, "", "/login");
      render(<App />);

      expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
      expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
      expect(screen.getByLabelText("Password")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Log In" })).toBeInTheDocument();
    });
  });

  describe("AppShell & Navigation Structure", () => {
    it("renders the application shell with sidebar and header at /dashboard", async () => {
      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      // Header and user elements
      expect(screen.getByText("Alex Mercer")).toBeInTheDocument();
      expect(screen.getByText(/Search tasks, projects, notes/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Life OS/i).length).toBeGreaterThan(0);

      // Navigation links exist in sidebar
      expect(screen.getAllByRole("link", { name: /Dashboard/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: /Tasks/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: /Projects/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: /Goals/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: /Habits/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: /Calendar/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: /Notes/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: /Expenses/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: /Health/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: /Settings/i }).length).toBeGreaterThan(0);

      await waitFor(() => {
        expect(screen.getByText("Design new landing page")).toBeInTheDocument();
      });
    });

    it("renders real Tasks page at /tasks with action controls", async () => {
      window.history.pushState({}, "", "/tasks");
      render(<App />);

      expect(screen.getByRole("heading", { name: "Tasks & Planning" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add Task" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /All Tasks/i })).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText("Design new landing page")).toBeInTheDocument();
      });
    });
  });

  describe("Active Projects Route (Milestone 3)", () => {
    it("renders active Projects page at /projects", async () => {
      window.history.pushState({}, "", "/projects");
      render(<App />);

      expect(screen.getByRole("heading", { name: "Projects & Initiatives" })).toBeInTheDocument();
      expect(screen.getByText("New Project")).toBeInTheDocument();
    });
  });

  describe("Active Goals Route (Milestone 4)", () => {
    it("renders active Goals page at /goals", async () => {
      window.history.pushState({}, "", "/goals");
      render(<App />);

      expect(screen.getByRole("heading", { name: "Goals" })).toBeInTheDocument();
      expect(screen.getByText("Create Goal")).toBeInTheDocument();
    });
  });

  describe("Future Route Placeholders", () => {
    const placeholderRoutes = [
      { path: "/habits", title: "Atomic Habits", milestone: "Phase 3 Milestone" },
      { path: "/calendar", title: "Calendar & Agenda", milestone: "Phase 3 Milestone" },
      { path: "/notes", title: "Notes & Focus Journal", milestone: "Phase 4 Milestone" },
      { path: "/expenses", title: "Expenses & Budgeting", milestone: "Phase 4 Milestone" },
      { path: "/health", title: "Health & Recovery", milestone: "Phase 5 Milestone" },
      { path: "/settings", title: "Workspace Settings", milestone: "Phase 5 Milestone" },
    ];

    placeholderRoutes.forEach(({ path, title, milestone }) => {
      it(`renders deliberate placeholder for ${path}`, () => {
        window.history.pushState({}, "", path);
        render(<App />);

        expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
        expect(screen.getByText(milestone)).toBeInTheDocument();
        expect(screen.getByText("Return to Dashboard")).toBeInTheDocument();
      });
    });


    it("renders 404 placeholder for unknown routes", () => {
      window.history.pushState({}, "", "/unknown-random-route");
      render(<App />);

      expect(screen.getByRole("heading", { name: "Page Not Found" })).toBeInTheDocument();
    });
  });
});
