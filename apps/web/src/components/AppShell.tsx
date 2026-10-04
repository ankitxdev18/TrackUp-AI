import React from "react";
import {
  Bell,
  BookOpen,
  Calendar,
  CheckSquare,
  FolderKanban,
  HeartPulse,
  Home,
  LayoutDashboard,
  Plus,
  Receipt,
  Search,
  Settings,
  Sparkles,
  Target,
} from "lucide-react";
import { Link, useRouter } from "../router/Router";
import "./AppShell.css";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { path } = useRouter();

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Tasks", href: "/tasks", icon: CheckSquare },
    { label: "Projects", href: "/projects", icon: FolderKanban },
    { label: "Goals", href: "/goals", icon: Target },
    { label: "Habits", href: "/habits", icon: Sparkles },
    { label: "Calendar", href: "/calendar", icon: Calendar },
    { label: "Notes", href: "/notes", icon: BookOpen },
    { label: "Expenses", href: "/expenses", icon: Receipt },
    { label: "Health", href: "/health", icon: HeartPulse },
    { label: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <div className="app-shell">
      {/* Desktop Left Sidebar */}
      <aside className="shell-sidebar" aria-label="Main Navigation">
        <div className="sidebar-header">
          <Link to="/" className="brand-icon" aria-label="TrackUp Home">
            <svg
              width="18"
              height="18"
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
          <Link to="/" className="brand-title">
            <span>TrackUp</span>
            <span className="brand-subtitle">Life OS</span>
          </Link>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = path === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`nav-item ${isActive ? "active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-avatar-sm" aria-hidden="true">
            AM
          </div>
          <div className="user-info">
            <span className="user-name">Alex Mercer</span>
            <span className="user-role">Free Workspace</span>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <div className="shell-main">
        {/* Top Header */}
        <header className="shell-header" role="banner">
          <div className="search-box">
            <Search size={15} />
            <span>Search tasks, projects, notes...</span>
            <span className="search-shortcut">⌘K</span>
          </div>

          <div className="header-actions">
            <div className="header-greeting">
              <span>Good morning, Alex 👋</span>
            </div>
            <button className="header-icon-btn" aria-label="Notifications">
              <Bell size={18} />
              <span className="icon-badge" aria-label="Unread notification" />
            </button>
            <div className="user-avatar-sm" aria-label="User profile">
              AM
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="shell-content" role="main">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-nav" aria-label="Mobile Navigation">
        <Link
          to="/dashboard"
          className={`mobile-nav-item ${path === "/dashboard" ? "active" : ""}`}
        >
          <Home size={20} />
          <span>Home</span>
        </Link>
        <Link
          to="/tasks"
          className={`mobile-nav-item ${path === "/tasks" ? "active" : ""}`}
        >
          <CheckSquare size={20} />
          <span>Tasks</span>
        </Link>
        <Link
          to="/tasks"
          className="mobile-fab-btn"
          aria-label="Create new task"
        >
          <Plus size={24} />
        </Link>
        <Link
          to="/calendar"
          className={`mobile-nav-item ${path === "/calendar" ? "active" : ""}`}
        >
          <Calendar size={20} />
          <span>Calendar</span>
        </Link>
        <Link
          to="/settings"
          className={`mobile-nav-item ${path === "/settings" ? "active" : ""}`}
        >
          <Settings size={20} />
          <span>More</span>
        </Link>
      </nav>
    </div>
  );
}
