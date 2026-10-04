import { useState, useEffect } from "react";
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  FolderKanban,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import {
  deleteProject,
  fetchProject,
  type Project,
  updateProject,
} from "../api/projects";
import {
  deleteTask,
  getTodayDateString,
  getTomorrowDateString,
  type Task,
  updateTask,
} from "../api/tasks";
import { CreateProjectModal } from "../components/CreateProjectModal";
import { CreateTaskModal } from "../components/CreateTaskModal";
import { Link, useRouter } from "../router/Router";
import "./ProjectDetailPage.css";

interface ProjectDetailPageProps {
  projectId: string;
}

type TaskFilterType = "all" | "todo" | "completed";

export function ProjectDetailPage({ projectId }: ProjectDetailPageProps) {
  const { navigate } = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<TaskFilterType>("all");
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  const todayStr = getTodayDateString();
  const tomorrowStr = getTomorrowDateString();

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchProject(projectId);
      setProject(data.project);
      setTasks(data.tasks || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load project details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  const handleToggleTask = async (task: Task) => {
    const nextStatus = task.status === "COMPLETED" ? "TODO" : "COMPLETED";
    try {
      setUpdatingTaskId(task.id);
      const updated = await updateTask(task.id, { status: nextStatus });
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? updated : t))
      );
      // Recompute project completed counts
      setProject((prev) => {
        if (!prev) return prev;
        const currentCompleted = prev.completedTaskCount ?? 0;
        const diff = nextStatus === "COMPLETED" ? 1 : -1;
        return {
          ...prev,
          completedTaskCount: Math.max(0, currentCompleted + diff),
        };
      });
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
      setTasks((prev) => {
        const deleted = prev.find((t) => t.id === id);
        const wasCompleted = deleted?.status === "COMPLETED";
        if (project) {
          setProject({
            ...project,
            taskCount: Math.max(0, (project.taskCount ?? 1) - 1),
            completedTaskCount: wasCompleted
              ? Math.max(0, (project.completedTaskCount ?? 1) - 1)
              : project.completedTaskCount,
          });
        }
        return prev.filter((t) => t.id !== id);
      });
    } catch (err: unknown) {
      alert("Failed to delete task. Please try again.");
    }
  };

  const handleTaskCreated = (newTask: Task) => {
    setTasks((prev) => [newTask, ...prev]);
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        taskCount: (prev.taskCount ?? 0) + 1,
      };
    });
  };

  const handleProjectUpdated = (savedProject: Project) => {
    setProject(savedProject);
    setIsEditModalOpen(false);
  };

  const handleToggleArchive = async () => {
    if (!project) return;
    const nextStatus = project.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
    try {
      const updated = await updateProject(project.id, { status: nextStatus });
      setProject((prev) => (prev ? { ...prev, status: updated.status } : null));
    } catch (err: unknown) {
      alert("Failed to update project status. Please try again.");
    }
  };

  const handleDeleteProject = async () => {
    if (!project) return;
    const confirmed = confirm(
      `Are you sure you want to delete "${project.name}"?\n\nNote: All associated tasks will remain safe and be detached from this project.`
    );
    if (!confirmed) return;

    try {
      await deleteProject(project.id);
      navigate("/projects");
    } catch (err: unknown) {
      alert("Failed to delete project. Please try again.");
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (activeFilter === "todo") return t.status !== "COMPLETED";
    if (activeFilter === "completed") return t.status === "COMPLETED";
    return true;
  });

  const totalTasks = project?.taskCount ?? tasks.length;
  const completedTasks =
    project?.completedTaskCount ??
    tasks.filter((t) => t.status === "COMPLETED").length;
  const progressPercent =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

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

  if (loading) {
    return (
      <div className="project-detail-loading" role="status" aria-label="Loading project details">
        <Loader2 size={24} className="spin-icon" />
        <span>Loading project details...</span>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="project-detail-container">
        <div className="tasks-error-banner" role="alert">
          <AlertCircle size={18} />
          <div className="error-text">
            <strong>Unable to load project:</strong> {error || "Project not found"}
          </div>
          <Link to="/projects" className="btn-retry">
            Return to Projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="project-detail-container">
      {/* Breadcrumb Navigation */}
      <div className="detail-breadcrumb">
        <Link to="/projects" className="breadcrumb-back-link">
          <ArrowLeft size={16} />
          <span>Back to Projects</span>
        </Link>
      </div>

      {/* Project Header */}
      <div className="project-detail-header">
        <div className="detail-header-left">
          <div className="detail-badge-row">
            <span
              className={`project-status-badge ${
                project.status === "ACTIVE" ? "badge-active" : "badge-archived"
              }`}
            >
              {project.status === "ACTIVE" ? "Active" : "Archived"}
            </span>
            <span className="detail-created-date">
              Created{" "}
              {new Date(project.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>

          <h1 className="project-detail-title">{project.name}</h1>

          {project.description && (
            <p className="project-detail-description">{project.description}</p>
          )}
        </div>

        <div className="detail-header-actions">
          <button
            type="button"
            className="btn-detail-action"
            onClick={() => setIsEditModalOpen(true)}
          >
            <Pencil size={15} />
            <span>Edit</span>
          </button>

          <button
            type="button"
            className="btn-detail-action"
            onClick={handleToggleArchive}
          >
            {project.status === "ACTIVE" ? (
              <>
                <Archive size={15} />
                <span>Archive</span>
              </>
            ) : (
              <>
                <RefreshCw size={15} />
                <span>Restore</span>
              </>
            )}
          </button>

          <button
            type="button"
            className="btn-detail-action btn-detail-danger"
            onClick={handleDeleteProject}
            aria-label="Delete project"
          >
            <Trash2 size={15} />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Progress & Metrics Summary */}
      <div className="project-metric-card">
        <div className="project-metric-top">
          <div className="metric-text-group">
            <span className="metric-headline">Initiative Completion</span>
            <span className="metric-subtext">
              {totalTasks === 0
                ? "No tasks assigned to this project yet."
                : `${completedTasks} of ${totalTasks} tasks completed`}
            </span>
          </div>
          <div className="metric-percentage">{progressPercent}%</div>
        </div>

        <div className="project-metric-track">
          <div
            className="project-metric-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Tasks Section */}
      <div className="project-tasks-section">
        <div className="project-tasks-header">
          <div>
            <h2 className="project-tasks-title">Project Tasks</h2>
            <p className="project-tasks-subtitle">
              Action items linked to this initiative.
            </p>
          </div>

          <button
            type="button"
            className="btn-add-project-task"
            onClick={() => setIsTaskModalOpen(true)}
          >
            <Plus size={16} />
            <span>Add Task</span>
          </button>
        </div>

        {/* Filter Bar */}
        <div className="tasks-filter-bar" role="tablist" aria-label="Project Task Filters">
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "all"}
            className={`filter-tab ${activeFilter === "all" ? "active" : ""}`}
            onClick={() => setActiveFilter("all")}
          >
            <span>All</span>
            <span className="filter-count">{tasks.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "todo"}
            className={`filter-tab ${activeFilter === "todo" ? "active" : ""}`}
            onClick={() => setActiveFilter("todo")}
          >
            <span>To Do</span>
            <span className="filter-count">
              {tasks.filter((t) => t.status !== "COMPLETED").length}
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

        {/* Task List or Empty State */}
        {filteredTasks.length === 0 ? (
          <div className="project-tasks-empty">
            <div className="empty-icon-wrap" aria-hidden="true">
              {activeFilter === "completed" ? (
                <CheckCircle2 size={36} />
              ) : (
                <FolderKanban size={36} />
              )}
            </div>
            <h3 className="empty-title">
              {activeFilter === "completed"
                ? "No completed tasks in this project yet."
                : activeFilter === "todo"
                ? "No pending tasks in this project."
                : "No tasks in this project yet."}
            </h3>
            <p className="empty-desc">
              {activeFilter === "completed"
                ? "Finish tasks belonging to this project to see them recorded here."
                : "Add action items to break down this strategic initiative into manageable steps."}
            </p>
            {activeFilter !== "completed" && (
              <button
                type="button"
                className="btn-empty-action"
                onClick={() => setIsTaskModalOpen(true)}
              >
                <Plus size={16} />
                <span>Add First Task</span>
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

      {/* Task Creation Modal with this project preselected */}
      <CreateTaskModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onTaskCreated={handleTaskCreated}
        initialProjectId={projectId}
      />

      {/* Edit Project Modal */}
      <CreateProjectModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onProjectSaved={handleProjectUpdated}
        projectToEdit={project}
      />
    </div>
  );
}
