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
  LogOut,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Link, useRouter } from "../router/Router";
import "./AppShell.css";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { path, navigate } = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const navSections = [
    {
      group: "Overview",
      items: [
        { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { label: "Tasks", href: "/tasks", icon: CheckSquare },
        { label: "Projects", href: "/projects", icon: FolderKanban },
      ],
    },
    {
      group: "Systems",
      items: [
        { label: "Goals", href: "/goals", icon: Target },
        { label: "Habits", href: "/habits", icon: Sparkles },
        { label: "Calendar", href: "/calendar", icon: Calendar },
        { label: "Notes", href: "/notes", icon: BookOpen },
      ],
    },
    {
      group: "Workspace",
      items: [
        { label: "Expenses", href: "/expenses", icon: Receipt },
        { label: "Health", href: "/health", icon: HeartPulse },
        { label: "Settings", href: "/settings", icon: Settings },
      ],
    },
  ];

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
          <Link to="/" className="brand-title">
            <span>TrackUp</span>
            <span className="brand-subtitle">Life OS</span>
          </Link>
        </div>

        <nav className="sidebar-nav">
          {navSections.map((sec) => (
            <div key={sec.group} className="nav-group">
              <span className="nav-group-title">{sec.group}</span>
              {sec.items.map((item) => {
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
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-avatar-sm" aria-hidden="true">
            {user ? user.name.slice(0, 2).toUpperCase() : "AM"}
          </div>
          <div className="user-info">
            <span className="user-name">{user ? user.name : "Alex Mercer"}</span>
            <span className="user-role">{user ? user.email : "Free Workspace"}</span>
          </div>
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
        {/* Top Header */}
        <header className="shell-header" role="banner">
          <div className="search-box">
            <Search size={14} className="search-icon" aria-hidden="true" />
            <span className="search-placeholder">Search tasks, projects, notes...</span>
            <kbd className="search-shortcut">⌘K</kbd>
          </div>

          <div className="header-actions">
            <div className="header-greeting">
              <span>Good morning, Alex 👋</span>
            </div>
            <button className="header-icon-btn" aria-label="Notifications">
              <Bell size={16} />
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
          <Home size={18} />
          <span>Home</span>
        </Link>
        <Link
          to="/tasks"
          className={`mobile-nav-item ${path === "/tasks" ? "active" : ""}`}
        >
          <CheckSquare size={18} />
          <span>Tasks</span>
        </Link>
        <Link
          to="/tasks"
          className="mobile-fab-btn"
          aria-label="Create new task"
        >
          <Plus size={20} />
        </Link>
        <Link
          to="/projects"
          className={`mobile-nav-item ${path === "/projects" ? "active" : ""}`}
        >
          <FolderKanban size={18} />
          <span>Projects</span>
        </Link>
        <Link
          to="/settings"
          className={`mobile-nav-item ${path === "/settings" ? "active" : ""}`}
        >
          <Settings size={18} />
          <span>More</span>
        </Link>
      </nav>
    </div>
  );
}
