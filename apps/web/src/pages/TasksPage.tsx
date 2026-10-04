import { useState, useEffect } from "react";
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  FolderKanban,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { fetchProjects, type Project } from "../api/projects";
import {
  deleteTask,
  fetchTasks,
  getTodayDateString,
  getTomorrowDateString,
  type Task,
  updateTask,
} from "../api/tasks";
import { CreateTaskModal } from "../components/CreateTaskModal";
import "./TasksPage.css";

type FilterType = "all" | "today" | "upcoming" | "completed";

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  const todayStr = getTodayDateString();
  const tomorrowStr = getTomorrowDateString();

  const loadTasks = async () => {
    try {
      setLoading(true);
      setError(null);
      const projParam =
        selectedProjectFilter !== "all" ? selectedProjectFilter : undefined;
      const data = await fetchTasks(projParam);
      setTasks(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects()
      .then((projs) => setProjectsList(projs))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadTasks();
  }, [selectedProjectFilter]);

  const handleToggleTask = async (task: Task) => {
    const nextStatus = task.status === "COMPLETED" ? "TODO" : "COMPLETED";
    try {
      setUpdatingTaskId(task.id);
      const updated = await updateTask(task.id, { status: nextStatus });
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? updated : t))
      );
    } catch (err: unknown) {
      alert("Failed to update task state. Please try again.");
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm("Are you sure you want to delete this task?")) return;

    try {
      await deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err: unknown) {
      alert("Failed to delete task. Please try again.");
    }
  };

  const handleTaskCreated = (newTask: Task) => {
    // If filter matches, add to list
    if (
      selectedProjectFilter === "all" ||
      (selectedProjectFilter === "none" && !newTask.projectId) ||
      selectedProjectFilter === newTask.projectId
    ) {
      setTasks((prev) => [newTask, ...prev]);
    }
  };

  // Filter tasks based on selected tab
  const filteredTasks = tasks.filter((t) => {
    if (activeFilter === "today") {
      return t.dueDate === todayStr;
    }
    if (activeFilter === "upcoming") {
      return t.dueDate && t.dueDate > todayStr && t.status !== "COMPLETED";
    }
    if (activeFilter === "completed") {
      return t.status === "COMPLETED";
    }
    return true; // 'all'
  });

  const getDueDateLabel = (dueDate: string | null, isCompleted: boolean) => {
    if (!dueDate) return null;
    if (dueDate === todayStr) {
      return <span className="task-date-badge task-date-today">Today</span>;
    }
    if (dueDate === tomorrowStr) {
      return <span className="task-date-badge task-date-tomorrow">Tomorrow</span>;
    }
    if (dueDate < todayStr && !isCompleted) {
      return <span className="task-date-badge task-date-overdue">Overdue</span>;
    }
    return <span className="task-date-badge">{dueDate}</span>;
  };

  return (
    <div className="tasks-page-container">
      {/* Header */}
      <div className="tasks-page-header">
        <div className="tasks-header-text">
          <h1 className="tasks-title">Tasks & Planning</h1>
          <p className="tasks-subtitle">
            Manage your daily actions, prioritize work, and build momentum.
          </p>
        </div>

        <button
          type="button"
          className="btn-create-task"
          onClick={() => setIsModalOpen(true)}
        >
          <Plus size={16} />
          <span>Add Task</span>
        </button>
      </div>

      {/* Filter Tabs & Project Selector Bar */}
      <div className="tasks-filters-row">
        <div className="tasks-filter-bar" role="tablist" aria-label="Task Filters">
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "all"}
            className={`filter-tab ${activeFilter === "all" ? "active" : ""}`}
            onClick={() => setActiveFilter("all")}
          >
            <span>All Tasks</span>
            <span className="filter-count">{tasks.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "today"}
            className={`filter-tab ${activeFilter === "today" ? "active" : ""}`}
            onClick={() => setActiveFilter("today")}
          >
            <span>Today</span>
            <span className="filter-count">
              {tasks.filter((t) => t.dueDate === todayStr).length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "upcoming"}
            className={`filter-tab ${activeFilter === "upcoming" ? "active" : ""}`}
            onClick={() => setActiveFilter("upcoming")}
          >
            <span>Upcoming</span>
            <span className="filter-count">
              {tasks.filter((t) => t.dueDate && t.dueDate > todayStr && t.status !== "COMPLETED").length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "completed"}
            className={`filter-tab ${activeFilter === "completed" ? "active" : ""}`}
            onClick={() => setActiveFilter("completed")}
          >
            <span>Completed</span>
            <span className="filter-count">
              {tasks.filter((t) => t.status === "COMPLETED").length}
            </span>
          </button>
        </div>

        {/* Project Filter Select */}
        <div className="tasks-project-filter-wrap">
          <FolderKanban size={14} className="project-filter-icon" aria-hidden="true" />
          <select
            className="tasks-project-select"
            value={selectedProjectFilter}
            onChange={(e) => setSelectedProjectFilter(e.target.value)}
            aria-label="Filter tasks by project"
          >
            <option value="all">All Projects</option>
            <option value="none">No Project</option>
            {projectsList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="tasks-error-banner" role="alert">
          <AlertCircle size={18} />
          <div className="error-text">
            <strong>Unable to load tasks:</strong> {error}
          </div>
          <button type="button" className="btn-retry" onClick={loadTasks}>
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && !error && (
        <div className="tasks-loading-skeleton" role="status" aria-label="Loading tasks">
          <div className="loading-spinner-wrap">
            <Loader2 size={24} className="spin-icon" />
            <span>Loading tasks...</span>
          </div>
        </div>
      )}

      {/* Task List or Empty State */}
      {!loading && !error && (
        <div className="tasks-list-content">
          {filteredTasks.length === 0 ? (
            <div className="tasks-empty-state">
              <div className="empty-icon-wrap" aria-hidden="true">
                {activeFilter === "completed" ? (
                  <CheckCircle2 size={36} />
                ) : (
                  <Calendar size={36} />
                )}
              </div>
              <h3 className="empty-title">
                {activeFilter === "today"
                  ? "You're clear for today."
                  : activeFilter === "upcoming"
                  ? "No upcoming tasks scheduled."
                  : activeFilter === "completed"
                  ? "No completed tasks yet."
                  : "No tasks found."}
              </h3>
              <p className="empty-desc">
                {activeFilter === "today"
                  ? "Enjoy the focus or plan your next move by scheduling tasks for today."
                  : activeFilter === "upcoming"
                  ? "Tasks due in future dates will automatically show up here."
                  : activeFilter === "completed"
                  ? "Finish a task from your active list to see it recorded here."
                  : "Start by adding your first action item or adjusting your project filter."}
              </p>
              {activeFilter !== "completed" && (
                <button
                  type="button"
                  className="btn-empty-action"
                  onClick={() => setIsModalOpen(true)}
                >
                  <Plus size={16} />
                  <span>Create Task</span>
                </button>
              )}
            </div>
          ) : (
            <div className="tasks-items-list">
              {filteredTasks.map((task) => {
                const isCompleted = task.status === "COMPLETED";
                const isUpdating = updatingTaskId === task.id;

                return (
                  <div
                    key={task.id}
                    className={`task-row-card ${isCompleted ? "task-completed" : ""}`}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isCompleted}
                      className={`task-checkbox-circle ${
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

                    <div className="task-row-content">
                      <span className={`task-row-title ${isCompleted ? "done" : ""}`}>
                        {task.title}
                      </span>

                      <div className="task-row-meta">
                        <span
                          className={`task-priority-badge priority-${task.priority.toLowerCase()}`}
                        >
                          {task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}
                        </span>

                        {task.projectName && (
                          <span className="task-project-pill">
                            <FolderKanban size={11} aria-hidden="true" />
                            <span>{task.projectName}</span>
                          </span>
                        )}

                        {getDueDateLabel(task.dueDate, isCompleted)}

                        <span className="task-time-indicator">
                          <Clock size={12} />
                          <span>
                            {new Date(task.createdAt).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="task-btn-delete"
                      onClick={() => handleDeleteTask(task.id)}
                      aria-label={`Delete task: ${task.title}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Creation Modal */}
      <CreateTaskModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onTaskCreated={handleTaskCreated}
        initialDueDate={activeFilter === "today" ? todayStr : null}
        initialProjectId={
          selectedProjectFilter !== "all" && selectedProjectFilter !== "none"
            ? selectedProjectFilter
            : undefined
        }
      />
    </div>
  );
}
