import { useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Plus,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Link } from "../router/Router";
import "./DashboardView.css";

interface TaskItem {
  id: string;
  title: string;
  priority: "High" | "Medium" | "Low";
  project: string;
  time: string;
  completed: boolean;
}

export function DashboardView() {
  const [tasks, setTasks] = useState<TaskItem[]>([
    {
      id: "1",
      title: "Design new landing page",
      priority: "High",
      project: "Product",
      time: "10:00 AM",
      completed: false,
    },
    {
      id: "2",
      title: "Go for a 30 min run",
      priority: "Medium",
      project: "Health",
      time: "12:00 PM",
      completed: false,
    },
    {
      id: "3",
      title: "Read 20 pages",
      priority: "Low",
      project: "Personal",
      time: "2:00 PM",
      completed: true,
    },
    {
      id: "4",
      title: "Update project roadmap",
      priority: "High",
      project: "Product",
      time: "4:00 PM",
      completed: false,
    },
  ]);

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  const completedCount = tasks.filter((t) => t.completed).length;
  const progressPercent = Math.round((completedCount / tasks.length) * 100);

  return (
    <div className="dashboard-view">
      {/* Milestone Preview Banner */}
      <div className="dashboard-banner">
        <div className="banner-content">
          <span className="banner-badge">Shell Preview</span>
          <span className="banner-text">
            <strong>Milestone 1 Product Shell Active.</strong> Backend registration foundation is connected. Full Task persistence & editing will be integrated in the upcoming milestone!
          </span>
        </div>
        <Link to="/tasks" className="btn-secondary" style={{ padding: "4px 12px", fontSize: "0.75rem" }}>
          View Tasks Roadmap
        </Link>
      </div>

      {/* Greeting Header */}
      <div className="dashboard-hero">
        <div>
          <h1 className="hero-greeting-title">Good morning, Alex 👋</h1>
          <p className="hero-greeting-sub">Here's what you need to focus on today.</p>
        </div>

        <div className="date-pill">
          <Calendar size={14} />
          <span>Mon, Apr 24, 2024</span>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="dashboard-stats">
        <div className="dash-stat-card">
          <div className="stat-top-row">
            <span className="stat-subtitle">Tasks Today</span>
            <div className="stat-icon-circle" style={{ backgroundColor: "rgba(77, 142, 255, 0.15)", color: "var(--primary)" }}>
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="stat-num">{tasks.length}</div>
          <span className="stat-subtitle">{completedCount} of {tasks.length} completed</span>
        </div>

        <div className="dash-stat-card">
          <div className="stat-top-row">
            <span className="stat-subtitle">Daily Progress</span>
            <div className="stat-icon-circle" style={{ backgroundColor: "var(--color-success-bg)", color: "var(--color-success)" }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="stat-num">{progressPercent}%</div>
          <span className="stat-subtitle">On track for today</span>
        </div>

        <div className="dash-stat-card">
          <div className="stat-top-row">
            <span className="stat-subtitle">Remaining</span>
            <div className="stat-icon-circle" style={{ backgroundColor: "var(--color-warning-bg)", color: "var(--color-warning)" }}>
              <Clock size={18} />
            </div>
          </div>
          <div className="stat-num">{tasks.length - completedCount}</div>
          <span className="stat-subtitle">To do today</span>
        </div>

        <div className="dash-stat-card">
          <div className="stat-top-row">
            <span className="stat-subtitle">Overdue</span>
            <div className="stat-icon-circle" style={{ backgroundColor: "var(--color-danger-bg)", color: "var(--color-danger)" }}>
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="stat-num">1</div>
          <span className="stat-subtitle" style={{ color: "var(--color-danger)" }}>Needs attention</span>
        </div>
      </div>

      {/* Main Grid: Tasks & Activity */}
      <div className="dashboard-grid">
        {/* Left Column: Today's Tasks */}
        <section className="dashboard-panel" aria-labelledby="today-tasks-heading">
          <div className="panel-title-bar">
            <h2 id="today-tasks-heading" className="panel-heading">Today's Tasks</h2>
            <Link to="/tasks" className="panel-btn-add">
              <Plus size={14} />
              <span>Add Task</span>
            </Link>
          </div>

          <div className="task-list-wrap">
            {tasks.map((task) => (
              <div key={task.id} className="task-card-item">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={task.completed}
                  className={`task-check-circle ${task.completed ? "completed" : ""}`}
                  onClick={() => toggleTask(task.id)}
                  aria-label={task.completed ? `Mark ${task.title} as incomplete` : `Mark ${task.title} as complete`}
                >
                  {task.completed && <Check size={12} strokeWidth={3} />}
                </button>

                <span className={`task-label ${task.completed ? "completed" : ""}`}>
                  {task.title}
                </span>

                <span
                  className={`badge-priority ${
                    task.priority === "High"
                      ? "badge-high"
                      : task.priority === "Medium"
                      ? "badge-medium"
                      : "badge-low"
                  }`}
                >
                  {task.priority}
                </span>

                <span className="tag-project">{task.project}</span>
                <span className="task-time">{task.time}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Right Column: Upcoming & Recent Activity */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          <section className="dashboard-panel" aria-labelledby="upcoming-heading">
            <div className="panel-title-bar">
              <h2 id="upcoming-heading" className="panel-heading">Upcoming</h2>
              <Link to="/calendar" style={{ fontSize: "0.75rem", color: "var(--primary)" }}>View all →</Link>
            </div>

            <div className="task-list-wrap">
              <div className="task-card-item">
                <div className="task-check-circle" />
                <span className="task-label">Plan weekly meals</span>
                <span className="tag-project">Tomorrow</span>
              </div>
              <div className="task-card-item">
                <div className="task-check-circle" />
                <span className="task-label">Review Q1 goals</span>
                <span className="tag-project">Apr 26</span>
              </div>
            </div>
          </section>

          <section className="dashboard-panel" aria-labelledby="activity-heading">
            <div className="panel-title-bar">
              <h2 id="activity-heading" className="panel-heading">Recent Activity</h2>
            </div>

            <div>
              <div className="activity-item">
                <div className="activity-icon-wrap">
                  <Check size={12} />
                </div>
                <div className="activity-text">
                  Completed "Read 20 pages"
                  <div className="activity-time">2 hours ago</div>
                </div>
              </div>

              <div className="activity-item">
                <div className="activity-icon-wrap" style={{ backgroundColor: "rgba(77, 142, 255, 0.15)", color: "var(--primary)" }}>
                  <Sparkles size={12} />
                </div>
                <div className="activity-text">
                  Created new task "Design new landing page"
                  <div className="activity-time">4 hours ago</div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
