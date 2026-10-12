import React, { useState, useEffect } from "react";
import {
  BookOpen,
  Calendar as CalendarIcon,
  CheckSquare,
  FolderKanban,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  MoreHorizontal,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  User as UserIcon,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Link, useRouter } from "../router/Router";
import { NotificationBell } from "./notifications/NotificationBell";
import "./AppShell.css";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { path, navigate } = useRouter();
  const { user, logout } = useAuth();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  // Close drawer on path change
  useEffect(() => {
    setIsMoreOpen(false);
  }, [path]);

  // Handle ESC key to close More drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMoreOpen) {
        setIsMoreOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMoreOpen]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const navPrimary = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Calendar", href: "/calendar", icon: CalendarIcon },
    { label: "Tasks", href: "/tasks", icon: CheckSquare },
    { label: "Projects", href: "/projects", icon: FolderKanban },
    { label: "Goals", href: "/goals", icon: Target },
    { label: "Habits", href: "/habits", icon: Sparkles },
    { label: "Journal", href: "/journal", icon: BookOpen },
    { label: "Ideas", href: "/ideas", icon: Lightbulb },
  ];


  // Derive current section name for top bar
  const getCurrentSectionTitle = () => {
    if (path.startsWith("/calendar")) return "Calendar";
    if (path.startsWith("/tasks")) return "Tasks";
    if (path.startsWith("/habits")) return "Habits";
    if (path.startsWith("/projects")) return "Projects";
    if (path.startsWith("/goals")) return "Goals";
    if (path.startsWith("/analytics")) return "Analytics";
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
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </Link>
          <Link to="/dashboard" className="brand-title">
            <span>TrackUp</span>
            <span className="brand-subtitle">Life OS</span>
          </Link>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-group">
            <span className="nav-group-title">Main</span>
            {navPrimary.map((item) => {
              const Icon = item.icon;
              const isActive = path === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`nav-item ${isActive ? "active" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon size={16} className="nav-icon" aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="nav-group">
            <span className="nav-group-title">Insights</span>
            <Link
              to="/analytics"
              className={`nav-item ${path === "/analytics" ? "active" : ""}`}
              aria-current={path === "/analytics" ? "page" : undefined}
            >
              <TrendingUp size={16} className="nav-icon" aria-hidden="true" />
              <span>Analytics</span>
            </Link>
          </div>

          <div className="nav-group">
            <span className="nav-group-title">Secondary</span>
            <button
              type="button"
              className={`nav-item btn-sidebar-more ${isMoreOpen || path === "/settings" ? "active" : ""}`}
              onClick={() => setIsMoreOpen(true)}
              aria-label="More navigation"
              aria-expanded={isMoreOpen}
            >
              <MoreHorizontal size={16} className="nav-icon" aria-hidden="true" />
              <span>More</span>
            </button>
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
          <div className="header-breadcrumbs">
            <span className="breadcrumb-brand">TrackUp</span>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-current">{getCurrentSectionTitle()}</span>
          </div>

          <div className="header-actions">
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

      {/* Mobile Bottom Navigation (Persistent, 5 destinations) */}
      <nav className="mobile-nav" aria-label="Mobile Navigation">
        <Link
          to="/dashboard"
          className={`mobile-nav-item ${path === "/dashboard" ? "active" : ""}`}
          aria-current={path === "/dashboard" ? "page" : undefined}
        >
          <LayoutDashboard size={18} />
          <span>Dashboard</span>
        </Link>
        <Link
          to="/tasks"
          className={`mobile-nav-item ${path === "/tasks" ? "active" : ""}`}
          aria-current={path === "/tasks" ? "page" : undefined}
        >
          <CheckSquare size={18} />
          <span>Tasks</span>
        </Link>
        <Link
          to="/goals"
          className={`mobile-nav-item ${path === "/goals" ? "active" : ""}`}
          aria-current={path === "/goals" ? "page" : undefined}
        >
          <Target size={18} />
          <span>Goals</span>
        </Link>
        <Link
          to="/projects"
          className={`mobile-nav-item ${path === "/projects" ? "active" : ""}`}
          aria-current={path === "/projects" ? "page" : undefined}
        >
          <FolderKanban size={18} />
          <span>Projects</span>
        </Link>
        <button
          type="button"
          className={`mobile-nav-item btn-more-trigger ${isMoreOpen ? "active" : ""}`}
          onClick={() => setIsMoreOpen(true)}
          aria-label="More navigation"
          aria-expanded={isMoreOpen}
        >
          <MoreHorizontal size={18} />
          <span>More</span>
        </button>
      </nav>

      {/* Mobile More Drawer / Surface */}
      {isMoreOpen && (
        <div className="more-drawer-backdrop" onClick={() => setIsMoreOpen(false)} role="presentation">
          <div
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
                className={`drawer-nav-item ${path === "/calendar" ? "active" : ""}`}
                onClick={() => setIsMoreOpen(false)}
              >
                <CalendarIcon size={16} />
                <span>Calendar</span>
              </Link>
              <Link
                to="/journal"
                className={`drawer-nav-item ${path === "/journal" ? "active" : ""}`}
                onClick={() => setIsMoreOpen(false)}
              >
                <BookOpen size={16} />
                <span>Journal</span>
              </Link>
              <Link
                to="/habits"
                className={`drawer-nav-item ${path === "/habits" ? "active" : ""}`}
                onClick={() => setIsMoreOpen(false)}
              >
                <Sparkles size={16} />
                <span>Habits</span>
              </Link>
              <Link
                to="/ideas"
                className={`drawer-nav-item ${path === "/ideas" ? "active" : ""}`}
                onClick={() => setIsMoreOpen(false)}
              >
                <Lightbulb size={16} />
                <span>Ideas</span>
              </Link>
              <Link
                to="/analytics"
                className={`drawer-nav-item ${path === "/analytics" ? "active" : ""}`}
                onClick={() => setIsMoreOpen(false)}
              >
                <TrendingUp size={16} />
                <span>Analytics</span>
              </Link>
              <Link
                to="/settings"
                className={`drawer-nav-item ${path === "/settings" ? "active" : ""}`}
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

