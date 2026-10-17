import React, { useState, useEffect, useRef } from "react";
import {
  BookOpen,
  Calendar as CalendarIcon,
  CheckSquare,
  FolderKanban,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Moon,
  MoreHorizontal,
  PiggyBank,
  Receipt,
  Settings,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  User as UserIcon,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Link, useRouter } from "../router/Router";
import { NotificationBell } from "./notifications/NotificationBell";
import { applyTheme, getStoredTheme, subscribeTheme, type Theme } from "../utils/theme";
import { BrandIcon } from "./BrandIcon";
import "./AppShell.css";

interface AppShellProps {
  children: React.ReactNode;
}

/**
 * Route-aware active navigation matcher with trailing slash boundary.
 * Prevents prefix collisions like /goals-archived matching /goals.
 */
export function isRouteActive(currentPath: string, targetHref: string): boolean {
  if (targetHref === "/dashboard") {
    return currentPath === "/dashboard";
  }
  return currentPath === targetHref || currentPath.startsWith(`${targetHref}/`);
}

export function AppShell({ children }: AppShellProps) {
  const { path, navigate } = useRouter();
  const { user, logout } = useAuth();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<Theme>(getStoredTheme);

  const drawerRef = useRef<HTMLDivElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);

  // Sync theme changes with central theme utility
  useEffect(() => {
    return subscribeTheme((theme) => {
      setCurrentTheme(theme);
    });
  }, []);

  const handleToggleTheme = () => {
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
  };

  // Close drawer on path change
  useEffect(() => {
    setIsMoreOpen(false);
  }, [path]);

  // Manage drawer focus and focus restoration
  useEffect(() => {
    if (isMoreOpen) {
      previousFocusedElementRef.current = document.activeElement as HTMLElement | null;
      const timer = setTimeout(() => {
        const firstFocusable = drawerRef.current?.querySelector<HTMLElement>(
          'button:not([disabled]), a[href]:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        firstFocusable?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else if (previousFocusedElementRef.current) {
      previousFocusedElementRef.current.focus?.();
    }
  }, [isMoreOpen]);

  // Drawer keyboard trap and Escape handler
  useEffect(() => {
    if (!isMoreOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setIsMoreOpen(false);
        return;
      }

      if (e.key === "Tab" && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href]:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMoreOpen]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  // --- Desktop Navigation Groups (All 11 Modules Directly Visible) ---
  const navWorkspace = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Calendar", href: "/calendar", icon: CalendarIcon },
    { label: "Tasks", href: "/tasks", icon: CheckSquare },
    { label: "Projects", href: "/projects", icon: FolderKanban },
  ];

  const navGrowth = [
    { label: "Goals", href: "/goals", icon: Target },
    { label: "Habits", href: "/habits", icon: Sparkles },
    { label: "Journal", href: "/journal", icon: BookOpen },
    { label: "Ideas", href: "/ideas", icon: Lightbulb },
  ];

  const navFinance = [
    { label: "Expenses", href: "/expenses", icon: Receipt },
    { label: "Savings", href: "/savings", icon: PiggyBank },
    { label: "Analytics", href: "/analytics", icon: TrendingUp },
  ];

  const navSystem = [
    { label: "Settings", href: "/settings", icon: Settings },
  ];

  // --- Mobile Bottom Bar Primary Destinations (4 items + More trigger) ---
  const mobileNavPrimary = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Tasks", href: "/tasks", icon: CheckSquare },
    { label: "Goals", href: "/goals", icon: Target },
    { label: "Projects", href: "/projects", icon: FolderKanban },
  ];

  // Derive current section name for top bar
  const getCurrentSectionTitle = () => {
    if (path.startsWith("/calendar")) return "Calendar";
    if (path.startsWith("/tasks")) return "Tasks";
    if (path.startsWith("/habits")) return "Habits";
    if (path.startsWith("/projects")) return "Projects";
    if (path.startsWith("/goals")) return "Goals";
    if (path.startsWith("/analytics")) return "Analytics";
    if (path.startsWith("/expenses")) return "Expenses";
    if (path.startsWith("/savings")) return "Savings";
    if (path.startsWith("/settings")) return "Settings";
    if (path.startsWith("/journal")) return "Journal";
    if (path.startsWith("/ideas")) return "Ideas";
    return "Dashboard";
  };

  const userInitials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "U";

  const displayName = user?.name || "Workspace";
  const displayRole = user?.email || "Personal OS";

  return (
    <div className="app-shell">
      {/* Desktop Left Sidebar */}
      <aside className="shell-sidebar" aria-label="Main Navigation">
        <div className="sidebar-header">
          <Link to="/" className="brand-icon" aria-label="TrackUp Home">
            <BrandIcon size={18} />
          </Link>
          <Link to="/dashboard" className="brand-title">
            <span>TrackUp</span>
            <span className="brand-subtitle">Life OS</span>
          </Link>
        </div>

        <nav className="sidebar-nav">
          {/* Workspace Group */}
          <div className="nav-group">
            <span className="nav-group-title">Workspace</span>
            {navWorkspace.map((item) => {
              const Icon = item.icon;
              const active = isRouteActive(path, item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`nav-item ${active ? "active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={16} className="nav-icon" aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Growth Group */}
          <div className="nav-group">
            <span className="nav-group-title">Growth</span>
            {navGrowth.map((item) => {
              const Icon = item.icon;
              const active = isRouteActive(path, item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`nav-item ${active ? "active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={16} className="nav-icon" aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Finance & Insights Group */}
          <div className="nav-group">
            <span className="nav-group-title">Finance & Insights</span>
            {navFinance.map((item) => {
              const Icon = item.icon;
              const active = isRouteActive(path, item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`nav-item ${active ? "active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={16} className="nav-icon" aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* System Group */}
          <div className="nav-group">
            <span className="nav-group-title">System</span>
            {navSystem.map((item) => {
              const Icon = item.icon;
              const active = isRouteActive(path, item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`nav-item ${active ? "active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={16} className="nav-icon" aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="sidebar-footer">
          <Link
            to="/settings"
            className="sidebar-user-link"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              textDecoration: "none",
              color: "inherit",
              flex: 1,
              minWidth: 0,
              cursor: "pointer",
            }}
            aria-label="User Profile"
          >
            <div className="user-avatar-sm" aria-hidden="true">
              {userInitials}
            </div>
            <div className="user-info">
              <span className="user-name" title={displayName}>{displayName}</span>
              <span className="user-role" title={displayRole}>{displayRole}</span>
            </div>
          </Link>
          <button
            type="button"
            className="btn-shell-logout"
            onClick={handleLogout}
            aria-label="Log Out"
            title="Log Out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <div className="shell-main">
        {/* Top Application Bar */}
        <header className="shell-header" role="banner">
          <div className="header-title-container">
            {path.startsWith("/projects/") ? (
              <div className="header-breadcrumbs">
                <Link to="/projects" className="breadcrumb-parent">Projects</Link>
                <span className="breadcrumb-separator" aria-hidden="true">/</span>
                <span className="header-title-detail">Detail</span>
              </div>
            ) : path.startsWith("/goals/") ? (
              <div className="header-breadcrumbs">
                <Link to="/goals" className="breadcrumb-parent">Goals</Link>
                <span className="breadcrumb-separator" aria-hidden="true">/</span>
                <span className="header-title-detail">Detail</span>
              </div>
            ) : (
              <span className="header-title breadcrumb-current">{getCurrentSectionTitle()}</span>
            )}
          </div>

          <div className="header-actions">
            <button
              type="button"
              className="btn-theme-toggle"
              onClick={handleToggleTheme}
              aria-label={`Switch to ${currentTheme === "dark" ? "light" : "dark"} theme`}
              title={`Switch to ${currentTheme === "dark" ? "light" : "dark"} theme`}
            >
              {currentTheme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <NotificationBell />
            <Link
              to="/settings"
              style={{
                display: "flex",
                textDecoration: "none",
                color: "inherit",
                cursor: "pointer",
              }}
              aria-label="User Profile"
            >
              <div className="user-avatar-sm" aria-label="User profile" title={`${displayName} (${displayRole})`}>
                {userInitials}
              </div>
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main className="shell-content" role="main">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation (Persistent, 4 primary destinations + More) */}
      <nav className="mobile-nav" aria-label="Mobile Navigation">
        {mobileNavPrimary.map((item) => {
          const Icon = item.icon;
          const active = isRouteActive(path, item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`mobile-nav-item ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          ref={moreTriggerRef}
          type="button"
          className={`mobile-nav-item btn-more-trigger ${isMoreOpen ? "active" : ""}`}
          onClick={() => setIsMoreOpen(true)}
          aria-label="More navigation"
          aria-expanded={isMoreOpen}
          aria-haspopup="dialog"
          aria-controls="mobile-more-drawer"
        >
          <MoreHorizontal size={18} />
          <span>More</span>
        </button>
      </nav>

      {/* Mobile More Drawer / Surface */}
      {isMoreOpen && (
        <div
          className="more-drawer-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsMoreOpen(false);
          }}
          role="presentation"
        >
          <div
            id="mobile-more-drawer"
            ref={drawerRef}
            className="more-drawer-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="More navigation"
          >
            <div className="more-drawer-header">
              <div className="more-drawer-title-wrap">
                <span className="more-drawer-title">Navigation & Account</span>
              </div>
              <button
                type="button"
                className="btn-drawer-close"
                onClick={() => setIsMoreOpen(false)}
                aria-label="Close more navigation"
              >
                <X size={18} />
              </button>
            </div>

            <div className="more-drawer-user">
              <div className="user-avatar-sm" aria-hidden="true">
                {userInitials}
              </div>
              <div className="user-info">
                <span className="user-name">{displayName}</span>
                <span className="user-role">{displayRole}</span>
              </div>
            </div>

            <div className="more-drawer-nav">
              <Link
                to="/calendar"
                className={`drawer-nav-item ${isRouteActive(path, "/calendar") ? "active" : ""}`}
                aria-current={isRouteActive(path, "/calendar") ? "page" : undefined}
                onClick={() => setIsMoreOpen(false)}
              >
                <CalendarIcon size={16} />
                <span>Calendar</span>
              </Link>
              <Link
                to="/journal"
                className={`drawer-nav-item ${isRouteActive(path, "/journal") ? "active" : ""}`}
                aria-current={isRouteActive(path, "/journal") ? "page" : undefined}
                onClick={() => setIsMoreOpen(false)}
              >
                <BookOpen size={16} />
                <span>Journal</span>
              </Link>
              <Link
                to="/habits"
                className={`drawer-nav-item ${isRouteActive(path, "/habits") ? "active" : ""}`}
                aria-current={isRouteActive(path, "/habits") ? "page" : undefined}
                onClick={() => setIsMoreOpen(false)}
              >
                <Sparkles size={16} />
                <span>Habits</span>
              </Link>
              <Link
                to="/ideas"
                className={`drawer-nav-item ${isRouteActive(path, "/ideas") ? "active" : ""}`}
                aria-current={isRouteActive(path, "/ideas") ? "page" : undefined}
                onClick={() => setIsMoreOpen(false)}
              >
                <Lightbulb size={16} />
                <span>Ideas</span>
              </Link>
              <Link
                to="/expenses"
                className={`drawer-nav-item ${isRouteActive(path, "/expenses") ? "active" : ""}`}
                aria-current={isRouteActive(path, "/expenses") ? "page" : undefined}
                onClick={() => setIsMoreOpen(false)}
              >
                <Receipt size={16} />
                <span>Expenses</span>
              </Link>
              <Link
                to="/savings"
                className={`drawer-nav-item ${isRouteActive(path, "/savings") ? "active" : ""}`}
                aria-current={isRouteActive(path, "/savings") ? "page" : undefined}
                onClick={() => setIsMoreOpen(false)}
              >
                <PiggyBank size={16} />
                <span>Savings</span>
              </Link>
              <Link
                to="/analytics"
                className={`drawer-nav-item ${isRouteActive(path, "/analytics") ? "active" : ""}`}
                aria-current={isRouteActive(path, "/analytics") ? "page" : undefined}
                onClick={() => setIsMoreOpen(false)}
              >
                <TrendingUp size={16} />
                <span>Analytics</span>
              </Link>
              <Link
                to="/settings"
                className={`drawer-nav-item ${isRouteActive(path, "/settings") ? "active" : ""}`}
                aria-current={isRouteActive(path, "/settings") ? "page" : undefined}
                onClick={() => setIsMoreOpen(false)}
              >
                <Settings size={16} />
                <span>Settings</span>
              </Link>
              <Link
                to="/"
                className="drawer-nav-item"
                onClick={() => setIsMoreOpen(false)}
              >
                <UserIcon size={16} />
                <span>TrackUp Home</span>
              </Link>
            </div>

            <div className="more-drawer-footer">
              <button
                type="button"
                className="btn-drawer-logout"
                onClick={handleLogout}
              >
                <LogOut size={16} />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
