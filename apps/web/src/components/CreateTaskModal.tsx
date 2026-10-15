import { useState, useEffect, useRef } from "react";
import { AlertCircle, Calendar, Check, FolderKanban, Loader2, X } from "lucide-react";
import { fetchProjects, type Project } from "../api/projects";
import {
  createTask,
  getTodayDateString,
  getTomorrowDateString,
  type Task,
  TaskApiError,
  updateTask,
} from "../api/tasks";
import "./CreateTaskModal.css";

export interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated?: (task: Task) => void;
  onTaskUpdated?: (task: Task) => void;
  taskToEdit?: Task | null;
  initialDueDate?: string | null;
  initialProjectId?: string | null;
}

export function CreateTaskModal({
  isOpen,
  onClose,
  onTaskCreated,
  onTaskUpdated,
  taskToEdit,
  initialDueDate,
  initialProjectId,
}: CreateTaskModalProps) {
  const isEditMode = Boolean(taskToEdit);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [dueDate, setDueDate] = useState<string>(initialDueDate || "");
  const [projectId, setProjectId] = useState<string>(initialProjectId || "");
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isMounted = true;

    if (isOpen) {
      if (taskToEdit) {
        setTitle(taskToEdit.title);
        setPriority(taskToEdit.priority);
        setDueDate(taskToEdit.dueDate || "");
        setProjectId(taskToEdit.projectId || "");
      } else {
        setTitle("");
        setPriority("MEDIUM");
        setDueDate(initialDueDate || "");
        setProjectId(initialProjectId || "");
      }
      setError(null);
      setLoading(false);

      // Load user's projects for project selector
      fetchProjects()
        .then((data) => {
          if (!isMounted) return;
          setProjectsList(
            data.filter(
              (p) => p.status === "ACTIVE" || (taskToEdit && p.id === taskToEdit.projectId)
            )
          );
        })
        .catch(() => {
          // ignore background failure to fetch projects list
        });

      setTimeout(() => inputRef.current?.focus(), 50);
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen, taskToEdit, initialDueDate, initialProjectId]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      setError("Please enter a task title.");
      return;
    }

    if (loading) return;

    try {
      setLoading(true);
      setError(null);

      if (isEditMode && taskToEdit) {
        const updated = await updateTask(taskToEdit.id, {
          title: trimmedTitle,
          priority,
          dueDate: dueDate ? dueDate : null,
          projectId: projectId ? projectId : null,
        });

        onTaskUpdated?.(updated);
        onClose();
      } else {
        const newTask = await createTask({
          title: trimmedTitle,
          priority,
          dueDate: dueDate ? dueDate : null,
          projectId: projectId ? projectId : null,
        });

        onTaskCreated?.(newTask);
        onClose();
      }
    } catch (err: unknown) {
      if (err instanceof TaskApiError) {
        setError(err.message);
      } else {
        setError(
          isEditMode
            ? "Failed to update task. Please try again."
            : "Failed to create task. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-task-heading"
      >
        <div className="modal-header">
          <div className="modal-title-group">
            <h2 id="create-task-heading" className="modal-title">
              {isEditMode ? "Edit Task" : "Create New Task"}
            </h2>
            <span className="modal-subtitle">
              {isEditMode
                ? "Update task details and schedule"
                : "Add an action item to your personal Life OS"}
            </span>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="modal-error-alert" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="task-title-input" className="form-label">
              Task Title <span className="required-star">*</span>
            </label>
            <input
              ref={inputRef}
              id="task-title-input"
              type="text"
              className="modal-input"
              placeholder="What needs to be done?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
              maxLength={500}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="task-project-select" className="form-label">
              Project (Optional)
            </label>
            <div className="date-input-wrapper">
              <FolderKanban size={15} className="date-icon" aria-hidden="true" />
              <select
                id="task-project-select"
                className="modal-input modal-input-date"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={loading}
              >
                <option value="">No Project (Standalone Task)</option>
                {projectsList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Priority</label>
            <div
              className="priority-pill-selector"
              role="radiogroup"
              aria-label="Task Priority"
            >
              {(["LOW", "MEDIUM", "HIGH"] as const).map((p) => {
                const isSelected = priority === p;
                return (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`priority-pill priority-pill-${p.toLowerCase()} ${
                      isSelected ? "selected" : ""
                    }`}
                    onClick={() => setPriority(p)}
                    disabled={loading}
                  >
                    {isSelected && <Check size={12} strokeWidth={3} />}
                    <span>{p.charAt(0) + p.slice(1).toLowerCase()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="task-due-date" className="form-label">
              Due Date (Optional)
            </label>
            <div className="due-date-row">
              <div className="date-input-wrapper">
                <Calendar size={15} className="date-icon" aria-hidden="true" />
                <input
                  id="task-due-date"
                  type="date"
                  className="modal-input modal-input-date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="quick-date-buttons">
                <button
                  type="button"
                  className={`btn-quick-date ${
                    dueDate === getTodayDateString() ? "active" : ""
                  }`}
                  onClick={() => setDueDate(getTodayDateString())}
                  disabled={loading}
                >
                  Today
                </button>
                <button
                  type="button"
                  className={`btn-quick-date ${
                    dueDate === getTomorrowDateString() ? "active" : ""
                  }`}
                  onClick={() => setDueDate(getTomorrowDateString())}
                  disabled={loading}
                >
                  Tomorrow
                </button>
                {dueDate && (
                  <button
                    type="button"
                    className="btn-quick-date btn-quick-clear"
                    onClick={() => setDueDate("")}
                    disabled={loading}
                    aria-label="Clear due date"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn-modal-cancel"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-modal-submit"
              disabled={loading || !title.trim()}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="spin-icon" />
                  <span>{isEditMode ? "Saving..." : "Creating..."}</span>
                </>
              ) : (
                <span>{isEditMode ? "Save Changes" : "Create Task"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const TaskModal = CreateTaskModal;
