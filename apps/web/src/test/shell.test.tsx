import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { App } from "../App";
import { getTodayDateString } from "../api/tasks";

describe("TrackUp Product Shell & Landing Page (Milestone 1 & 2)", () => {
  const todayStr = getTodayDateString();

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
      if (url.includes("/api/ideas")) {
        return {
          ok: true,
          json: async () => ({ ideas: [] }),
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
        json: async () => ({
          tasks: [
            {
              id: "shell-task-1",
              userId: "user-1",
              title: "Design new landing page",
              status: "TODO",
              priority: "HIGH",
              dueDate: todayStr,
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

    it("navigates to dashboard live preview on CTA click with dynamic time-aware greeting", async () => {
      render(<App />);

      const previewBtn = screen.getByText("Explore Dashboard Preview");
      fireEvent.click(previewBtn);

      expect(window.location.pathname).toBe("/dashboard");
      await waitFor(() => {
        expect(screen.getByText(/Good (morning|afternoon|evening)/i)).toBeInTheDocument();
        expect(screen.getByText(/Here's what you need to focus on today/i)).toBeInTheDocument();
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

  describe("AppShell & Responsive Navigation Structure", () => {
    it("renders the application shell with active sidebar, header, and mobile navigation at /dashboard", async () => {
      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      // Dynamic workspace identity (no hardcoded Alex Mercer)
      expect(screen.getAllByText("Workspace").length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Life OS/i).length).toBeGreaterThan(0);

      // Top application header breadcrumb
      expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);

      // Primary navigation links in desktop sidebar
      expect(screen.getAllByRole("link", { name: /Dashboard/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: /Calendar/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: /Tasks/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: /Goals/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: /Projects/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: /Habits/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: /Journal/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: /Ideas/i }).length).toBeGreaterThan(0);

      // Verify exact desktop sidebar primary navigation order
      const sidebarLinks = Array.from(document.querySelectorAll(".shell-sidebar .nav-item")).map(
        (el) => el.getAttribute("href")
      );
      expect(sidebarLinks).toEqual([
        "/dashboard",
        "/calendar",
        "/tasks",
        "/projects",
        "/goals",
        "/habits",
        "/journal",
        "/ideas",
        "/expenses",
        "/savings",
        "/analytics",
        "/settings",
      ]);

      // Persistent More navigation trigger in sidebar and mobile nav
      expect(screen.getAllByRole("button", { name: /More navigation/i }).length).toBeGreaterThan(0);

      // Verify persistent mobile bottom navigation has exactly 5 items
      const mobileNav = document.querySelector(".mobile-nav");
      expect(mobileNav).toBeInTheDocument();
      const mobileItems = mobileNav?.children;
      expect(mobileItems?.length).toBe(5);

      await waitFor(() => {
        expect(screen.getByText("Design new landing page")).toBeInTheDocument();
      });
    });

    it("renders Calendar in desktop sidebar with active state and working navigation", async () => {
      window.history.pushState({}, "", "/calendar");
      render(<App />);

      // Top application header breadcrumb shows Calendar
      expect(screen.getByText("Calendar", { selector: ".breadcrumb-current" })).toBeInTheDocument();

      // Desktop sidebar Calendar item is active
      const sidebarCalendarLink = document.querySelector(".shell-sidebar .nav-item[href='/calendar']");
      expect(sidebarCalendarLink).toBeInTheDocument();
      expect(sidebarCalendarLink).toHaveClass("active");
      expect(sidebarCalendarLink).toHaveAttribute("aria-current", "page");

      // Navigate back to dashboard by clicking dashboard link
      const dashboardLink = document.querySelector(".shell-sidebar .nav-item[href='/dashboard']");
      expect(dashboardLink).toBeInTheDocument();
      fireEvent.click(dashboardLink!);
      expect(window.location.pathname).toBe("/dashboard");

      // Now click Calendar link in sidebar and verify navigation
      const calendarLink = document.querySelector(".shell-sidebar .nav-item[href='/calendar']");
      fireEvent.click(calendarLink!);
      expect(window.location.pathname).toBe("/calendar");
    });

    it("provides Calendar inside mobile More menu, navigates to /calendar, and closes More menu", async () => {
      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      // Open mobile More drawer
      const moreBtn = screen.getAllByRole("button", { name: /More navigation/i })[0];
      fireEvent.click(moreBtn);

      // More drawer should be open and contain Calendar link
      expect(screen.getByText("Navigation & Account")).toBeInTheDocument();
      const drawerCalendarLink = document.querySelector(".more-drawer-nav .drawer-nav-item[href='/calendar']");
      expect(drawerCalendarLink).toBeInTheDocument();
      expect(drawerCalendarLink).toHaveTextContent("Calendar");

      // Clicking Calendar link navigates to /calendar and closes drawer
      fireEvent.click(drawerCalendarLink!);
      expect(window.location.pathname).toBe("/calendar");
      expect(screen.queryByText("Navigation & Account")).not.toBeInTheDocument();
    });

    it("renders Journal in desktop sidebar with active state and working navigation", async () => {
      window.history.pushState({}, "", "/journal");
      render(<App />);

      // Top application header breadcrumb shows Journal
      expect(screen.getByText("Journal", { selector: ".breadcrumb-current" })).toBeInTheDocument();

      // Desktop sidebar Journal item is active
      const sidebarJournalLink = document.querySelector(".shell-sidebar .nav-item[href='/journal']");
      expect(sidebarJournalLink).toBeInTheDocument();
      expect(sidebarJournalLink).toHaveClass("active");
      expect(sidebarJournalLink).toHaveAttribute("aria-current", "page");

      // Navigate back to dashboard by clicking dashboard link
      const dashboardLink = document.querySelector(".shell-sidebar .nav-item[href='/dashboard']");
      expect(dashboardLink).toBeInTheDocument();
      fireEvent.click(dashboardLink!);
      expect(window.location.pathname).toBe("/dashboard");

      // Now click Journal link in sidebar and verify navigation
      const journalLink = document.querySelector(".shell-sidebar .nav-item[href='/journal']");
      fireEvent.click(journalLink!);
      expect(window.location.pathname).toBe("/journal");
    });

    it("provides Journal inside mobile More menu, navigates to /journal, and closes More menu", async () => {
      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      // Open mobile More drawer
      const moreBtn = screen.getAllByRole("button", { name: /More navigation/i })[0];
      fireEvent.click(moreBtn);

      // More drawer should be open and contain Journal link
      expect(screen.getByText("Navigation & Account")).toBeInTheDocument();
      const drawerJournalLink = document.querySelector(".more-drawer-nav .drawer-nav-item[href='/journal']");
      expect(drawerJournalLink).toBeInTheDocument();
      expect(drawerJournalLink).toHaveTextContent("Journal");

      // Clicking Journal link navigates to /journal and closes drawer
      fireEvent.click(drawerJournalLink!);
      expect(window.location.pathname).toBe("/journal");
      expect(screen.queryByText("Navigation & Account")).not.toBeInTheDocument();

      // Test Escape key closes More drawer
      const moreBtn2 = screen.getAllByRole("button", { name: /More navigation/i })[0];
      fireEvent.click(moreBtn2);
      expect(screen.getByText("Navigation & Account")).toBeInTheDocument();
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByText("Navigation & Account")).not.toBeInTheDocument();
    });

    it("renders Ideas in desktop sidebar with active state and bidirectional navigation", async () => {
      window.history.pushState({}, "", "/ideas");
      render(<App />);

      // Top application header breadcrumb shows Ideas
      expect(screen.getByText("Ideas", { selector: ".breadcrumb-current" })).toBeInTheDocument();

      // Desktop sidebar Ideas item is active
      const sidebarIdeasLink = document.querySelector(".shell-sidebar .nav-item[href='/ideas']");
      expect(sidebarIdeasLink).toBeInTheDocument();
      expect(sidebarIdeasLink).toHaveClass("active");
      expect(sidebarIdeasLink).toHaveAttribute("aria-current", "page");

      // Navigate back to tasks by clicking tasks link
      const tasksLink = document.querySelector(".shell-sidebar .nav-item[href='/tasks']");
      expect(tasksLink).toBeInTheDocument();
      fireEvent.click(tasksLink!);
      expect(window.location.pathname).toBe("/tasks");

      // Now click Ideas link in sidebar and verify navigation back to /ideas
      const ideasLink = document.querySelector(".shell-sidebar .nav-item[href='/ideas']");
      fireEvent.click(ideasLink!);
      expect(window.location.pathname).toBe("/ideas");
    });

    it("provides Ideas inside mobile More menu, navigates to /ideas, and closes More menu", async () => {
      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      // Open mobile More drawer
      const moreBtn = screen.getAllByRole("button", { name: /More navigation/i })[0];
      fireEvent.click(moreBtn);

      // More drawer should be open and contain Ideas link
      expect(screen.getByText("Navigation & Account")).toBeInTheDocument();
      const drawerIdeasLink = document.querySelector(".more-drawer-nav .drawer-nav-item[href='/ideas']");
      expect(drawerIdeasLink).toBeInTheDocument();
      expect(drawerIdeasLink).toHaveTextContent("Ideas");

      // Clicking Ideas link navigates to /ideas and closes drawer
      fireEvent.click(drawerIdeasLink!);
      expect(window.location.pathname).toBe("/ideas");
      expect(screen.queryByText("Navigation & Account")).not.toBeInTheDocument();
    });

    it("supports cross-domain navigation between all core TrackUp areas and Ideas", async () => {
      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      // Dashboard -> Ideas
      const ideasLink = document.querySelector(".shell-sidebar .nav-item[href='/ideas']");
      fireEvent.click(ideasLink!);
      expect(window.location.pathname).toBe("/ideas");
      expect(screen.getByText("Ideas", { selector: ".breadcrumb-current" })).toBeInTheDocument();

      // Ideas -> Habits
      const habitsLink = document.querySelector(".shell-sidebar .nav-item[href='/habits']");
      fireEvent.click(habitsLink!);
      expect(window.location.pathname).toBe("/habits");
      expect(screen.getByText("Habits", { selector: ".breadcrumb-current" })).toBeInTheDocument();

      // Habits -> Journal
      const journalLink = document.querySelector(".shell-sidebar .nav-item[href='/journal']");
      fireEvent.click(journalLink!);
      expect(window.location.pathname).toBe("/journal");
      expect(screen.getByText("Journal", { selector: ".breadcrumb-current" })).toBeInTheDocument();

      // Journal -> Ideas
      const ideasLinkBack = document.querySelector(".shell-sidebar .nav-item[href='/ideas']");
      fireEvent.click(ideasLinkBack!);
      expect(window.location.pathname).toBe("/ideas");
      expect(screen.getByText("Ideas", { selector: ".breadcrumb-current" })).toBeInTheDocument();
    });

    it("opens and closes mobile More drawer properly", async () => {
      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      const moreBtn = screen.getAllByRole("button", { name: /More navigation/i })[0];
      fireEvent.click(moreBtn);

      // More drawer should be open with Settings destination
      expect(screen.getByText("Navigation & Account")).toBeInTheDocument();
      expect(screen.getAllByRole("link", { name: /Settings/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("button", { name: /Log Out/i }).length).toBeGreaterThan(0);

      // Close drawer
      const closeBtn = screen.getByRole("button", { name: /Close more navigation/i });
      fireEvent.click(closeBtn);

      expect(screen.queryByText("Navigation & Account")).not.toBeInTheDocument();
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

  describe("Active Habits Route (Milestone H01-D)", () => {
    it("renders active Habits page at /habits", async () => {
      window.history.pushState({}, "", "/habits");
      render(<App />);

      expect(screen.getByRole("heading", { name: "Habits" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Create new habit" })).toBeInTheDocument();
    });
  });

  describe("Active Settings Route (Phase 4)", () => {
    it("renders active Settings & Account page at /settings", async () => {
      window.history.pushState({}, "", "/settings");
      render(<App />);

      expect(screen.getByRole("heading", { name: "Settings & Account" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Profile & Regional Identity" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Appearance & Theme" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Account Security" })).toBeInTheDocument();
    });
  });

  describe("Active Expenses Route (Phase 5)", () => {
    it("renders active Expenses page at /expenses", async () => {
      window.history.pushState({}, "", "/expenses");
      render(<App />);

      expect(screen.getByRole("heading", { name: "Expenses" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Log new expense" })).toBeInTheDocument();
    });
  });

  describe("Future Route Placeholders", () => {
    const placeholderRoutes = [
      { path: "/notes", title: "Notes & Focus Journal", milestone: "Phase 4 Milestone" },
      { path: "/health", title: "Health & Recovery", milestone: "Phase 5 Milestone" },
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
