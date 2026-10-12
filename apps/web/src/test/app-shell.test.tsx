import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { AppShell, isRouteActive } from "../components/AppShell";
import { SettingsPage } from "../pages/SettingsPage";
import { applyTheme, THEME_STORAGE_KEY } from "../utils/theme";

// State holder for router path
let currentPath = "/dashboard";
const mockNavigate = vi.fn((to: string) => {
  currentPath = to;
});

vi.mock("../router/Router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../router/Router")>();
  return {
    ...actual,
    useRouter: () => ({
      path: currentPath,
      navigate: mockNavigate,
    }),
    Link: ({ to, children, className, onClick, ...rest }: any) => (
      <a
        href={to}
        className={className}
        onClick={(e) => {
          e.preventDefault();
          if (onClick) onClick(e);
          mockNavigate(to);
        }}
        {...rest}
      >
        {children}
      </a>
    ),
  };
});

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1", name: "Ankit Dev", email: "ankit@trackup.dev" },
    logout: vi.fn(),
    updateProfile: vi.fn(),
  }),
}));

vi.mock("../context/NotificationContext", () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    isPanelOpen: false,
    setIsPanelOpen: vi.fn(),
    togglePanel: vi.fn(),
    isLoading: false,
    error: null,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    refreshNotifications: vi.fn(),
  }),
}));

describe("Milestone 2B: Navigation & App Shell Refinement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPath = "/dashboard";
    localStorage.clear();
    applyTheme("dark");
  });

  afterEach(() => {
    localStorage.clear();
  });

  // =========================================================================
  // 1. ROUTE-AWARE ACTIVE NAVIGATION MATCHER
  // =========================================================================
  describe("Route-aware active navigation helper (isRouteActive)", () => {
    it("matches exact routes", () => {
      expect(isRouteActive("/dashboard", "/dashboard")).toBe(true);
      expect(isRouteActive("/tasks", "/tasks")).toBe(true);
      expect(isRouteActive("/projects", "/projects")).toBe(true);
      expect(isRouteActive("/goals", "/goals")).toBe(true);
      expect(isRouteActive("/settings", "/settings")).toBe(true);
    });

    it("matches nested detail routes for projects and goals", () => {
      expect(isRouteActive("/projects/proj-123", "/projects")).toBe(true);
      expect(isRouteActive("/projects/proj-123/tasks", "/projects")).toBe(true);
      expect(isRouteActive("/goals/goal-456", "/goals")).toBe(true);
      expect(isRouteActive("/goals/goal-456/milestones", "/goals")).toBe(true);
    });

    it("prevents prefix collisions on similar route names", () => {
      // Must not match without a trailing slash boundary
      expect(isRouteActive("/goals-archived", "/goals")).toBe(false);
      expect(isRouteActive("/projectscope", "/projects")).toBe(false);
      expect(isRouteActive("/dashboard/overview", "/dashboard")).toBe(false); // /dashboard matches only /dashboard
    });

    it("does not match completely unrelated routes", () => {
      expect(isRouteActive("/tasks", "/projects")).toBe(false);
      expect(isRouteActive("/expenses", "/goals")).toBe(false);
      expect(isRouteActive("/calendar", "/journal")).toBe(false);
    });
  });

  // =========================================================================
  // 2. DESKTOP SIDEBAR EXPOSES ALL 11 MODULES
  // =========================================================================
  describe("Desktop sidebar structure", () => {
    it("exposes all 11 core modules directly in categorized groups", () => {
      render(
        <AppShell>
          <div>Page content</div>
        </AppShell>
      );

      const sidebar = document.querySelector(".shell-sidebar");
      expect(sidebar).toBeInTheDocument();

      // Check all 11 modules in sidebar
      const expectedModules = [
        "Dashboard",
        "Calendar",
        "Tasks",
        "Projects",
        "Goals",
        "Habits",
        "Journal",
        "Ideas",
        "Expenses",
        "Analytics",
        "Settings",
      ];

      expectedModules.forEach((label) => {
        const link = sidebar?.querySelector(`.sidebar-nav a[href="/${label.toLowerCase()}"]`);
        expect(link, `Module ${label} should be in sidebar navigation`).toBeInTheDocument();
        expect(link).toHaveTextContent(label);
      });

      // Verify the 4 semantic group headers
      expect(sidebar).toHaveTextContent(/workspace/i);
      expect(sidebar).toHaveTextContent(/growth/i);
      expect(sidebar).toHaveTextContent(/finance & insights/i);
      expect(sidebar).toHaveTextContent(/system/i);
    });

    it("makes Settings directly accessible as an explicit navigation link in the System group", () => {
      render(
        <AppShell>
          <div>Page content</div>
        </AppShell>
      );

      const sidebarNav = document.querySelector(".sidebar-nav");
      const settingsLink = sidebarNav?.querySelector('a[href="/settings"]');
      expect(settingsLink).toBeInTheDocument();
      expect(settingsLink).toHaveTextContent("Settings");
    });

    it("does NOT expose the redundant More button or drawer on desktop", () => {
      render(
        <AppShell>
          <div>Page content</div>
        </AppShell>
      );

      const sidebar = document.querySelector(".shell-sidebar");
      const moreBtn = sidebar?.querySelector(".btn-sidebar-more");
      expect(moreBtn).toBeNull();
    });

    it("marks active link with aria-current='page' and active class on detail route", () => {
      currentPath = "/projects/proj-123";
      render(
        <AppShell>
          <div>Project Details</div>
        </AppShell>
      );

      const sidebar = document.querySelector(".shell-sidebar");
      const projectsLink = sidebar?.querySelector('a[href="/projects"]');
      expect(projectsLink).toHaveClass("active");
      expect(projectsLink).toHaveAttribute("aria-current", "page");

      const tasksLink = sidebar?.querySelector('a[href="/tasks"]');
      expect(tasksLink).not.toHaveClass("active");
      expect(tasksLink).not.toHaveAttribute("aria-current");
    });
  });

  // =========================================================================
  // 3. HEADER REFINEMENT & THEME TOGGLE
  // =========================================================================
  describe("Header refinement and theme toggle", () => {
    it("displays clean section title without redundant 'TrackUp /' prefix", () => {
      currentPath = "/tasks";
      render(
        <AppShell>
          <div>Tasks Page</div>
        </AppShell>
      );

      const header = document.querySelector(".shell-header");
      expect(header).toBeInTheDocument();
      expect(header).toHaveTextContent("Tasks");
      expect(header).not.toHaveTextContent("TrackUp /");
    });

    it("renders contextual breadcrumb on nested project and goal detail routes", () => {
      currentPath = "/projects/proj-123";
      render(
        <AppShell>
          <div>Project Details</div>
        </AppShell>
      );

      const header = document.querySelector(".shell-header");
      const parentLink = header?.querySelector(".breadcrumb-parent");
      expect(parentLink).toHaveTextContent("Projects");
      expect(parentLink).toHaveAttribute("href", "/projects");
      expect(header?.querySelector(".header-title-detail")).toHaveTextContent("Detail");
    });

    it("renders accessible theme toggle button and toggles theme state", () => {
      render(
        <AppShell>
          <div>Workspace</div>
        </AppShell>
      );

      const themeToggle = screen.getByRole("button", {
        name: /switch to light theme/i,
      });
      expect(themeToggle).toBeInTheDocument();

      // Click to toggle to light theme
      fireEvent.click(themeToggle);

      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
      expect(themeToggle).toHaveAttribute("aria-label", "Switch to dark theme");

      // Click again to toggle back to dark theme
      fireEvent.click(themeToggle);

      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
      expect(themeToggle).toHaveAttribute("aria-label", "Switch to light theme");
    });

    it("synchronizes theme between AppShell header toggle and SettingsPage appearance section", async () => {
      const { unmount } = render(
        <div>
          <AppShell>
            <SettingsPage />
          </AppShell>
        </div>
      );

      // Initially dark
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

      // Toggle from AppShell header button
      const headerToggle = screen.getByRole("button", {
        name: /switch to light theme/i,
      });
      fireEvent.click(headerToggle);

      // Verify document & storage are light
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

      // Verify SettingsPage radio/tile reflects light mode
      const lightTile = screen.getByRole("radio", { name: /light/i });
      expect(lightTile).toHaveAttribute("aria-checked", "true");

      // Now click dark tile in SettingsPage
      const darkTile = screen.getByRole("radio", { name: /dark/i });
      fireEvent.click(darkTile);

      // Verify document & storage are back to dark
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
      expect(headerToggle).toHaveAttribute("aria-label", "Switch to light theme");

      unmount();
    });
  });

  // =========================================================================
  // 4. MOBILE BOTTOM NAVIGATION & DRAWER
  // =========================================================================
  describe("Mobile bottom navigation and drawer", () => {
    it("exposes 4 primary destinations (Dashboard, Tasks, Goals, Projects) and More button", () => {
      render(
        <AppShell>
          <div>Mobile View</div>
        </AppShell>
      );

      const mobileNav = document.querySelector(".mobile-nav");
      expect(mobileNav).toBeInTheDocument();

      expect(mobileNav?.querySelector('a[href="/dashboard"]')).toBeInTheDocument();
      expect(mobileNav?.querySelector('a[href="/tasks"]')).toBeInTheDocument();
      expect(mobileNav?.querySelector('a[href="/goals"]')).toBeInTheDocument();
      expect(mobileNav?.querySelector('a[href="/projects"]')).toBeInTheDocument();

      const moreBtn = mobileNav?.querySelector(".btn-more-trigger");
      expect(moreBtn).toBeInTheDocument();
      expect(moreBtn).toHaveAttribute("aria-expanded", "false");
      expect(moreBtn).toHaveAttribute("aria-haspopup", "dialog");
    });

    it("opens drawer on More button click and renders remaining modules including Settings", () => {
      render(
        <AppShell>
          <div>Mobile View</div>
        </AppShell>
      );

      const moreBtn = screen.getByRole("button", { name: /more navigation/i });
      fireEvent.click(moreBtn);

      const drawer = screen.getByRole("dialog", { name: /more navigation/i });
      expect(drawer).toBeInTheDocument();

      // Modules inside mobile drawer
      const remainingModules = [
        "Calendar",
        "Journal",
        "Habits",
        "Ideas",
        "Expenses",
        "Analytics",
        "Settings",
      ];

      remainingModules.forEach((label) => {
        const link = drawer.querySelector(`a[href="/${label.toLowerCase()}"]`);
        expect(link, `Drawer should contain ${label}`).toBeInTheDocument();
      });
    });

    it("closes drawer when clicking backdrop outside sheet", () => {
      render(
        <AppShell>
          <div>Mobile View</div>
        </AppShell>
      );

      const moreBtn = screen.getByRole("button", { name: /more navigation/i });
      fireEvent.click(moreBtn);

      const backdrop = document.querySelector(".more-drawer-backdrop");
      expect(backdrop).toBeInTheDocument();

      fireEvent.click(backdrop!);
      expect(document.querySelector(".more-drawer-backdrop")).toBeNull();
    });

    it("closes drawer on Escape key press and prevents background propagation", () => {
      render(
        <AppShell>
          <div>Mobile View</div>
        </AppShell>
      );

      const moreBtn = screen.getByRole("button", { name: /more navigation/i });
      fireEvent.click(moreBtn);

      expect(screen.getByRole("dialog")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("closes drawer and navigates when selecting a drawer link", () => {
      render(
        <AppShell>
          <div>Mobile View</div>
        </AppShell>
      );

      const moreBtn = screen.getByRole("button", { name: /more navigation/i });
      fireEvent.click(moreBtn);

      const drawer = screen.getByRole("dialog", { name: /more navigation/i });
      const expensesLink = within(drawer).getByRole("link", { name: /expenses/i });
      fireEvent.click(expensesLink);

      expect(mockNavigate).toHaveBeenCalledWith("/expenses");
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("traps focus between first and last interactive elements within drawer", () => {
      render(
        <AppShell>
          <div>Mobile View</div>
        </AppShell>
      );

      const moreBtn = screen.getByRole("button", { name: /more navigation/i });
      fireEvent.click(moreBtn);

      const drawer = screen.getByRole("dialog", { name: /more navigation/i });
      const closeBtn = within(drawer).getByRole("button", { name: /close more navigation/i });
      const logoutBtn = within(drawer).getByRole("button", { name: /log out/i });

      // Focus last element (logout button) and press Tab -> should wrap to first element (close button)
      logoutBtn.focus();
      expect(document.activeElement).toBe(logoutBtn);

      fireEvent.keyDown(window, { key: "Tab" });
      expect(document.activeElement).toBe(closeBtn);

      // Focus first element (close button) and press Shift+Tab -> should wrap to last element (logout button)
      fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(logoutBtn);
    });
  });
});
