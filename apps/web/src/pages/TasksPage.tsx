import { useState, useEffect, useCallback, useMemo } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  FolderKanban,
  Plus,
} from "lucide-react";
import { fetchProjects, type Project } from "../api/projects";
import {
  createTask,
  deleteTask,
  fetchTasks,
  getTodayDateString,
  type Task,
  updateTask,
} from "../api/tasks";
import { CreateTaskModal } from "../components/CreateTaskModal";
import { QuickAddTask } from "./dashboard/QuickAddTask";
import { TaskItem } from "../components/TaskItem";
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

  const loadTasks = useCallback(async () => {
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
  }, [selectedProjectFilter]);

  useEffect(() => {
    fetchProjects()
      .then((projs) => setProjectsList(projs))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Completion toggle with optimistic UI and error rollback
  const handleToggleTask = async (task: Task) => {
    const nextStatus = task.status === "COMPLETED" ? "TODO" : "COMPLETED";
    const previousTasks = [...tasks];

    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
    );

    try {
      setUpdatingTaskId(task.id);
      const updated = await updateTask(task.id, { status: nextStatus });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch (err: unknown) {
      setTasks(previousTasks);
      alert(err instanceof Error ? err.message : "Failed to update task state. Reverting.");
    } finally {
      setUpdatingTaskId(null);
    }
  };

  // Safe task deletion with optimistic removal and error rollback
  const handleDeleteTask = async (id: string) => {
    const previousTasks = [...tasks];
    setTasks((prev) => prev.filter((t) => t.id !== id));

    try {
      await deleteTask(id);
    } catch (err: unknown) {
      setTasks(previousTasks);
      alert(err instanceof Error ? err.message : "Failed to delete task. Restoring.");
    }
  };

  // Inline Quick Add
  const handleQuickAdd = async (title: string) => {
    const newTask = await createTask({
      title,
      dueDate: activeFilter === "today" ? todayStr : null,
      priority: "MEDIUM",
      projectId:
        selectedProjectFilter !== "all" && selectedProjectFilter !== "none"
          ? selectedProjectFilter
          : null,
    });
    setTasks((prev) => [newTask, ...prev]);
  };

  const handleTaskCreated = (newTask: Task) => {
    if (
      selectedProjectFilter === "all" ||
      (selectedProjectFilter === "none" && !newTask.projectId) ||
      selectedProjectFilter === newTask.projectId
    ) {
      setTasks((prev) => [newTask, ...prev]);
    }
  };

  // Derived filtered tasks memoized for performance
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
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
  }, [tasks, activeFilter, todayStr]);

  // Derived counts for tabs
  const allCount = tasks.length;
  const todayCount = tasks.filter((t) => t.dueDate === todayStr).length;
  const upcomingCount = tasks.filter(
    (t) => t.dueDate && t.dueDate > todayStr && t.status !== "COMPLETED"
  ).length;
  const completedCount = tasks.filter((t) => t.status === "COMPLETED").length;

  const emptyStateConfig = useMemo(() => {
    switch (activeFilter) {
      case "today":
        return {
          title: "No tasks scheduled for today.",
          desc: "You're clear for today. Plan your actions and build momentum.",
          actionText: "Add Task",
          showAction: true,
        };
      case "upcoming":
        return {
          title: "No upcoming tasks.",
          desc: "Tasks scheduled for future dates will automatically show up here.",
          actionText: "Add Task",
          showAction: true,
        };
      case "completed":
        return {
          title: "No completed tasks yet.",
          desc: "Finish tasks from your active list to see them recorded here.",
          actionText: null,
          showAction: false,
        };
      default:
        return {
          title: "No tasks found.",
          desc: "Add something you want to accomplish. Start by adding your first action item or adjusting your project filter.",
          actionText: "Create Task",
          showAction: true,
        };
    }
  }, [activeFilter]);

  return (
    <div className="tasks-page-container">
      {/* Header */}
      <div className="tasks-page-header">
        <div className="tasks-header-text">
          <h1 className="tasks-title">Tasks & Planning</h1>
          <p className="tasks-subtitle">
            Manage your daily actions and build momentum.
          </p>
        </div>

        <button
          type="button"
          className="btn-create-task"
          onClick={() => setIsModalOpen(true)}
          aria-label="Add Task"
        >
          <Plus size={15} />
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
            <span className="filter-count">{allCount}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "today"}
            className={`filter-tab ${activeFilter === "today" ? "active" : ""}`}
            onClick={() => setActiveFilter("today")}
          >
            <span>Today</span>
            <span className="filter-count">{todayCount}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "upcoming"}
            className={`filter-tab ${activeFilter === "upcoming" ? "active" : ""}`}
            onClick={() => setActiveFilter("upcoming")}
          >
            <span>Upcoming</span>
            <span className="filter-count">{upcomingCount}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "completed"}
            className={`filter-tab ${activeFilter === "completed" ? "active" : ""}`}
            onClick={() => setActiveFilter("completed")}
          >
            <span>Completed</span>
            <span className="filter-count">{completedCount}</span>
          </button>
        </div>

        {/* Project Filter Select */}
        <div className="tasks-project-filter-wrap">
          <FolderKanban size={13} className="project-filter-icon" aria-hidden="true" />
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

      {/* Inline Quick Add Surface */}
      {!loading && !error && (
        <div className="tasks-quick-add-wrap">
          <QuickAddTask
            onQuickAdd={handleQuickAdd}
            onOpenDetailedModal={() => setIsModalOpen(true)}
            disabled={loading}
          />
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !error && (
        <div className="tasks-skeleton-list" role="status" aria-label="Loading tasks">
          <div className="tasks-skeleton-row" />
          <div className="tasks-skeleton-row" />
          <div className="tasks-skeleton-row" />
          <div className="tasks-skeleton-row" />
        </div>
      )}

      {/* Task List or Empty State */}
      {!loading && !error && (
        <div className="tasks-list-content">
          {filteredTasks.length === 0 ? (
            <div className="tasks-empty-state">
              <div className="empty-icon-wrap" aria-hidden="true">
                {activeFilter === "completed" ? (
                  <CheckCircle2 size={32} />
                ) : (
                  <Calendar size={32} />
                )}
              </div>
              <h3 className="empty-title">{emptyStateConfig.title}</h3>
              <p className="empty-desc">{emptyStateConfig.desc}</p>
              {emptyStateConfig.showAction && (
                <button
                  type="button"
                  className="btn-empty-action"
                  onClick={() => setIsModalOpen(true)}
                >
                  <Plus size={14} />
                  <span>{emptyStateConfig.actionText}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="tasks-items-list">
              {filteredTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onToggle={handleToggleTask}
                  onDelete={handleDeleteTask}
                  isUpdating={updatingTaskId === task.id}
                />
              ))}
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
