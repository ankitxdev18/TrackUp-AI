import { useState, useEffect } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  FolderKanban,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { fetchGoals, formatTargetDate, type Goal } from "../api/goals";
import { fetchProjects, type Project } from "../api/projects";
import {
  fetchTasks,
  getTodayDateString,
  getTomorrowDateString,
  type Task,
  updateTask,
} from "../api/tasks";
import { CreateTaskModal } from "../components/CreateTaskModal";
import { Link, useRouter } from "../router/Router";
import "./DashboardView.css";

export function DashboardView() {
  const { navigate } = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [goalsError, setGoalsError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  const todayStr = getTodayDateString();
  const tomorrowStr = getTomorrowDateString();

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Tasks is the primary core operating surface of TrackUp
      const tasksData = await fetchTasks();
      setTasks(tasksData);

      // Projects preview is an auxiliary layout section.
      try {
        const projectsData = await fetchProjects();
        setProjects(projectsData.filter((p) => p.status === "ACTIVE"));
      } catch {
        setProjects([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const loadGoalsData = async () => {
    try {
      setGoalsLoading(true);
      setGoalsError(null);
      const goalsData = await fetchGoals("ACTIVE");
      const sorted = [...goalsData].sort((a, b) => {
        if (!a.targetDate && !b.targetDate) return 0;
        if (!a.targetDate) return 1;
        if (!b.targetDate) return -1;
        return a.targetDate.localeCompare(b.targetDate);
      });
      setGoals(sorted);
    } catch (err: unknown) {
      setGoalsError(
        err instanceof Error ? err.message : "Failed to load active goals"
      );
    } finally {
      setGoalsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
    loadGoalsData();
  }, []);

  const handleToggleTask = async (task: Task) => {
    const nextStatus = task.status === "COMPLETED" ? "TODO" : "COMPLETED";
    try {
      setUpdatingTaskId(task.id);
      const updated = await updateTask(task.id, { status: nextStatus });
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? updated : t))
      );

      // Optimistically update project completion progress if task belongs to a project
      if (task.projectId) {
        setProjects((prev) =>
          prev.map((p) => {
            if (p.id !== task.projectId) return p;
            const diff = nextStatus === "COMPLETED" ? 1 : -1;
            return {
              ...p,
              completedTaskCount: Math.max(0, (p.completedTaskCount ?? 0) + diff),
            };
          })
        );
      }
    } catch (err: unknown) {
      alert("Failed to update task state. Please try again.");
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const handleTaskCreated = (newTask: Task) => {
    setTasks((prev) => [newTask, ...prev]);
    if (newTask.projectId) {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== newTask.projectId) return p;
          return {
            ...p,
            taskCount: (p.taskCount ?? 0) + 1,
          };
        })
      );
    }
  };

  // Metric & segment calculations based on real tasks
  // Tasks Today: tasks due today or unscheduled
  const todayTasks = tasks.filter(
    (t) => t.dueDate === todayStr || (!t.dueDate && t.status !== "COMPLETED")
  );
  const todayTotal = todayTasks.length;
  const todayCompleted = todayTasks.filter((t) => t.status === "COMPLETED").length;
  const todayRemaining = todayTotal - todayCompleted;
  const progressPercent =
    todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0;

  // Overdue: tasks due before today and not completed
  const overdueTasks = tasks.filter(
    (t) => t.dueDate && t.dueDate < todayStr && t.status !== "COMPLETED"
  );

  // Upcoming: tasks due after today and not completed
  const upcomingTasks = tasks.filter(
    (t) => t.dueDate && t.dueDate > todayStr && t.status !== "COMPLETED"
  );

  // Recent activity: dynamically derived from real user tasks
  const recentlyCompleted = tasks
    .filter((t) => t.status === "COMPLETED" && t.completedAt)
    .sort(
      (a, b) =>
        new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()
    )
    .slice(0, 2);

  const recentlyCreated = [...tasks]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 2);

  return (
    <div className="dashboard-view">
      {/* Greeting Header */}
      <div className="dashboard-hero">
        <div>
          <h1 className="hero-greeting-title">Good morning, Alex 👋</h1>
          <p className="hero-greeting-sub">
            Here's what you need to focus on today.
          </p>
        </div>

        <div className="date-pill">
          <Calendar size={14} />
          <span>
            {new Date().toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="tasks-error-banner" role="alert">
          <AlertCircle size={18} />
          <div className="error-text">
            <strong>Unable to load dashboard data:</strong> {error}
          </div>
          <button type="button" className="btn-retry" onClick={loadDashboardData}>
            Retry
          </button>
        </div>
      )}

      {/* 4 Summary Stat Cards */}
      <div className="dashboard-stats">
        <div className="dash-stat-card">
          <div className="stat-top-row">
            <span className="stat-subtitle">Tasks Today</span>
            <div
              className="stat-icon-circle"
              style={{
                backgroundColor: "rgba(77, 142, 255, 0.15)",
                color: "var(--primary)",
              }}
            >
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="stat-num">{todayTotal}</div>
          <span className="stat-subtitle">
            {todayCompleted} of {todayTotal} completed
          </span>
        </div>

        <div className="dash-stat-card">
          <div className="stat-top-row">
            <span className="stat-subtitle">Daily Progress</span>
            <div
              className="stat-icon-circle"
              style={{
                backgroundColor: "var(--color-success-bg)",
                color: "var(--color-success)",
              }}
            >
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="stat-num">{progressPercent}%</div>
          <span className="stat-subtitle">
            {todayTotal === 0
              ? "No tasks scheduled for today"
              : progressPercent === 100
              ? "All done for today! 🎉"
              : "On track for today"}
          </span>
        </div>

        <div className="dash-stat-card">
          <div className="stat-top-row">
            <span className="stat-subtitle">Remaining</span>
            <div
              className="stat-icon-circle"
              style={{
                backgroundColor: "var(--color-warning-bg)",
                color: "var(--color-warning)",
              }}
            >
              <Clock size={18} />
            </div>
          </div>
          <div className="stat-num">{todayRemaining}</div>
          <span className="stat-subtitle">To do today</span>
        </div>

        <div className="dash-stat-card">
          <div className="stat-top-row">
            <span className="stat-subtitle">Overdue</span>
            <div
              className="stat-icon-circle"
              style={{
                backgroundColor: "var(--color-danger-bg)",
                color: "var(--color-danger)",
              }}
            >
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="stat-num">{overdueTasks.length}</div>
          <span
            className="stat-subtitle"
            style={{
              color: overdueTasks.length > 0 ? "var(--color-danger)" : "var(--text-muted)",
            }}
          >
            {overdueTasks.length > 0 ? "Needs attention" : "Zero overdue"}
          </span>
        </div>
      </div>

      {/* Main Grid: Tasks & Activity & Projects */}
      <div className="dashboard-grid">
        {/* Left Column: Today's Tasks */}
        <section
          className="dashboard-panel"
          aria-labelledby="today-tasks-heading"
        >
          <div className="panel-title-bar">
            <h2 id="today-tasks-heading" className="panel-heading">
              Today's Tasks
            </h2>
            <button
              type="button"
              className="panel-btn-add"
              onClick={() => setIsModalOpen(true)}
            >
              <Plus size={14} />
              <span>Add Task</span>
            </button>
          </div>

          {loading ? (
            <div className="dash-loading-wrap" role="status">
              <Loader2 size={20} className="spin-icon" />
              <span>Loading tasks...</span>
            </div>
          ) : todayTasks.length === 0 ? (
            <div className="dash-empty-tasks">
              <CheckCircle2 size={32} className="dash-empty-icon" />
              <p className="dash-empty-text">You're clear for today.</p>
              <button
                type="button"
                className="btn-dash-create"
                onClick={() => setIsModalOpen(true)}
              >
                <Plus size={14} />
                <span>Add a task</span>
              </button>
            </div>
          ) : (
            <div className="task-list-wrap">
              {todayTasks.map((task) => {
                const isCompleted = task.status === "COMPLETED";
                const isUpdating = updatingTaskId === task.id;

                return (
                  <div key={task.id} className="task-card-item">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isCompleted}
                      className={`task-check-circle ${
                        isCompleted ? "completed" : ""
                      }`}
                      onClick={() => handleToggleTask(task)}
                      disabled={isUpdating}
                      aria-label={
                        isCompleted
                          ? `Mark ${task.title} as incomplete`
                          : `Mark ${task.title} as complete`
                      }
                    >
                      {isCompleted && <Check size={12} strokeWidth={3} />}
                    </button>

                    <span
                      className={`task-label ${isCompleted ? "completed" : ""}`}
                    >
                      {task.title}
                    </span>

                    <span
                      className={`badge-priority ${
                        task.priority === "HIGH"
                          ? "badge-high"
                          : task.priority === "MEDIUM"
                          ? "badge-medium"
                          : "badge-low"
                      }`}
                    >
                      {task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}
                    </span>

                    {task.projectName && (
                      <span className="tag-project">
                        {task.projectName}
                      </span>
                    )}

                    {task.dueDate && (
                      <span className="tag-project">
                        {task.dueDate === todayStr
                          ? "Today"
                          : task.dueDate === tomorrowStr
                          ? "Tomorrow"
                          : task.dueDate}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Column: Active Projects, Upcoming & Recent Activity */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-6)",
          }}
        >
          {/* Active Projects Section (Milestone 3) */}
          <section
            className="dashboard-panel"
            aria-labelledby="active-projects-heading"
          >
            <div className="panel-title-bar">
              <h2 id="active-projects-heading" className="panel-heading">
                Active Projects
              </h2>
              <Link
                to="/projects"
                style={{ fontSize: "0.75rem", color: "var(--primary)" }}
              >
                View all →
              </Link>
            </div>

            {loading ? (
              <div className="dash-loading-wrap" role="status">
                <Loader2 size={16} className="spin-icon" />
                <span>Loading projects...</span>
              </div>
            ) : projects.length === 0 ? (
              <div className="dash-empty-upcoming" style={{ minHeight: "80px" }}>
                <FolderKanban size={22} className="dash-empty-icon" />
                <p className="dash-empty-text">No active projects yet.</p>
                <Link to="/projects" className="btn-dash-create">
                  <Plus size={14} />
                  <span>Create project</span>
                </Link>
              </div>
            ) : (
              <div className="dash-projects-list">
                {projects.slice(0, 3).map((project) => {
                  const total = project.taskCount ?? 0;
                  const completed = project.completedTaskCount ?? 0;
                  const percent =
                    total > 0 ? Math.round((completed / total) * 100) : 0;

                  return (
                    <div
                      key={project.id}
                      className="dash-project-item"
                      onClick={() => navigate(`/projects/${project.id}`)}
                      role="link"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") navigate(`/projects/${project.id}`);
                      }}
                      aria-label={`Open project ${project.name}`}
                    >
                      <div className="dash-project-meta-row">
                        <span className="dash-project-name">{project.name}</span>
                        <span className="dash-project-ratio">
                          {total === 0
                            ? "0 tasks"
                            : `${completed}/${total} (${percent}%)`}
                        </span>
                      </div>
                      <div className="dash-project-track">
                        <div
                          className="dash-project-fill"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Active Goals Section (Milestone 4) */}
          <section
            className="dashboard-panel"
            aria-labelledby="active-goals-heading"
          >
            <div className="panel-title-bar">
              <h2 id="active-goals-heading" className="panel-heading">
                Active Goals
              </h2>
              <Link
                to="/goals"
                style={{ fontSize: "0.75rem", color: "var(--primary)" }}
              >
                View all →
              </Link>
            </div>

            {goalsLoading ? (
              <div className="dash-loading-wrap" role="status">
                <Loader2 size={16} className="spin-icon" />
                <span>Loading goals...</span>
              </div>
            ) : goalsError ? (
              <div
                className="dash-empty-upcoming"
                style={{
                  minHeight: "80px",
                  borderColor: "var(--border-danger, #ef4444)",
                  color: "var(--danger, #ef4444)",
                }}
                role="alert"
              >
                <AlertCircle size={18} />
                <p className="dash-empty-text" style={{ color: "var(--danger, #ef4444)" }}>
                  {goalsError}
                </p>
                <button
                  id="btn-dash-goals-retry"
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={loadGoalsData}
                  style={{ marginTop: "4px" }}
                  aria-label="Retry goals"
                >
                  <RefreshCw size={12} />
                  <span>Retry goals</span>
                </button>
              </div>
            ) : goals.length === 0 ? (
              <div className="dash-empty-upcoming" style={{ minHeight: "80px" }}>
                <Target size={22} className="dash-empty-icon" />
                <p className="dash-empty-text">No active goals yet.</p>
                <Link to="/goals" className="btn-dash-create">
                  <Plus size={14} />
                  <span>Create goal</span>
                </Link>
              </div>
            ) : (
              <div className="dash-projects-list">
                {goals.slice(0, 3).map((goal) => {
                  const clamped = Math.min(
                    100,
                    Math.max(
                      0,
                      isNaN(Number(goal.progress)) ? 0 : Math.round(Number(goal.progress))
                    )
                  );
                  const formattedTarget = formatTargetDate(goal.targetDate);

                  return (
                    <div
                      key={goal.id}
                      className="dash-project-item"
                      onClick={() => navigate(`/goals/${goal.id}`)}
                      role="link"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") navigate(`/goals/${goal.id}`);
                      }}
                      aria-label={`Open goal ${goal.title}`}
                    >
                      <div className="dash-project-meta-row">
                        <span className="dash-project-name">{goal.title}</span>
                        <span className="dash-project-ratio">{clamped}%</span>
                      </div>
                      <div
                        className="dash-project-track"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={clamped}
                        aria-label={`${goal.title} progress: ${clamped}%`}
                      >
                        <div
                          className="dash-project-fill"
                          style={{
                            width: `${clamped}%`,
                            backgroundColor:
                              clamped === 100 ? "#10b981" : "var(--primary)",
                          }}
                        />
                      </div>
                      {formattedTarget && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            fontSize: "0.6875rem",
                            color: "var(--text-muted)",
                            marginTop: "2px",
                          }}
                        >
                          <Clock size={11} />
                          <span>Target {formattedTarget}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Upcoming Section */}
          <section
            className="dashboard-panel"
            aria-labelledby="upcoming-heading"
          >
            <div className="panel-title-bar">
              <h2 id="upcoming-heading" className="panel-heading">
                Upcoming
              </h2>
              <Link
                to="/tasks"
                style={{ fontSize: "0.75rem", color: "var(--primary)" }}
              >
                View all →
              </Link>
            </div>

            {loading ? (
              <div className="dash-loading-wrap" role="status">
                <Loader2 size={16} className="spin-icon" />
                <span>Loading...</span>
              </div>
            ) : upcomingTasks.length === 0 ? (
              <div className="dash-empty-upcoming">
                <Calendar size={22} className="dash-empty-icon" />
                <p className="dash-empty-text">No upcoming tasks.</p>
              </div>
            ) : (
              <div className="task-list-wrap">
                {upcomingTasks.slice(0, 4).map((task) => (
                  <div key={task.id} className="task-card-item">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={false}
                      className="task-check-circle"
                      onClick={() => handleToggleTask(task)}
                      aria-label={`Mark ${task.title} as complete`}
                    />
                    <span className="task-label">{task.title}</span>
                    <span className="tag-project">
                      {task.dueDate === tomorrowStr ? "Tomorrow" : task.dueDate}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recent Activity Section */}
          <section
            className="dashboard-panel"
            aria-labelledby="activity-heading"
          >
            <div className="panel-title-bar">
              <h2 id="activity-heading" className="panel-heading">
                Recent Activity
              </h2>
            </div>

            <div>
              {recentlyCompleted.length > 0 ? (
                recentlyCompleted.map((task) => (
                  <div key={`comp-${task.id}`} className="activity-item">
                    <div className="activity-icon-wrap">
                      <Check size={12} />
                    </div>
                    <div className="activity-text">
                      Completed "{task.title}"
                      <div className="activity-time">
                        {task.completedAt
                          ? new Date(task.completedAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Recently"}
                      </div>
                    </div>
                  </div>
                ))
              ) : null}

              {recentlyCreated.length > 0 ? (
                recentlyCreated.map((task) => (
                  <div key={`create-${task.id}`} className="activity-item">
                    <div
                      className="activity-icon-wrap"
                      style={{
                        backgroundColor: "rgba(77, 142, 255, 0.15)",
                        color: "var(--primary)",
                      }}
                    >
                      <Sparkles size={12} />
                    </div>
                    <div className="activity-text">
                      Created task "{task.title}"
                      <div className="activity-time">
                        {new Date(task.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                ))
              ) : null}

              {recentlyCompleted.length === 0 && recentlyCreated.length === 0 && (
                <div className="dash-empty-upcoming" style={{ minHeight: "80px" }}>
                  <p className="dash-empty-text">No activity yet. Create a task to get started.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Task Creation Modal */}
      <CreateTaskModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onTaskCreated={handleTaskCreated}
        initialDueDate={todayStr}
      />
    </div>
  );
}
