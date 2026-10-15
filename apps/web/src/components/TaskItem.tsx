import { useState } from "react";
import { AlertTriangle, Check, Clock, Pencil, Trash2 } from "lucide-react";
import {
  type Task,
  getDaysOverdue,
  getTodayDateString,
  getTomorrowDateString,
} from "../api/tasks";

export interface TaskItemProps {
  task: Task;
  onToggle: (task: Task) => void;
  onDelete?: (id: string) => void;
  onEdit?: (task: Task) => void;
  isUpdating?: boolean;
  isOverdueItem?: boolean;
}

export function TaskItem({
  task,
  onToggle,
  onDelete,
  onEdit,
  isUpdating = false,
  isOverdueItem = false,
}: TaskItemProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isCompleted = task.status === "COMPLETED";
  const todayStr = getTodayDateString();
  const tomorrowStr = getTomorrowDateString();

  const isOverdue =
    (isOverdueItem || (task.dueDate ? task.dueDate < todayStr : false)) &&
    !isCompleted;

  const daysOverdue = isOverdue && task.dueDate ? getDaysOverdue(task.dueDate, todayStr) : 0;

  const formatDueDateLabel = (dateStr: string) => {
    if (dateStr === todayStr) return "Today";
    if (dateStr === tomorrowStr) return "Tomorrow";
    try {
      const [y, m, d] = dateStr.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className={`task-card-item ${isOverdue ? "item-overdue" : ""} ${isCompleted ? "item-completed" : ""}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={isCompleted}
        className={`task-check-circle ${isCompleted ? "completed" : ""}`}
        onClick={() => onToggle(task)}
        disabled={isUpdating}
        aria-label={
          isCompleted
            ? `Mark ${task.title} as incomplete`
            : `Mark ${task.title} as complete`
        }
      >
        {isCompleted && <Check size={12} strokeWidth={3} />}
      </button>

      <div className="task-content">
        <div className="task-title-row">
          <span className={`task-label ${isCompleted ? "completed" : ""}`}>
            {task.title}
          </span>
        </div>

        <div className="task-meta-pills">
          {isOverdue && (
            <span className="badge-overdue">
              <AlertTriangle size={10} />
              <span>Overdue {daysOverdue}d</span>
            </span>
          )}

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
            <span className="tag-project" title={`Project: ${task.projectName}`}>
              {task.projectName}
            </span>
          )}

          {!isOverdue && task.dueDate && (
            <span className="tag-due-date">
              <Clock size={10} />
              <span>{formatDueDateLabel(task.dueDate)}</span>
            </span>
          )}

          {isCompleted && (
            <span className="tag-completed-status">
              Completed
            </span>
          )}
        </div>
      </div>

      {(onEdit || onDelete) && (
        <div className="task-actions-wrap">
          {onEdit && (
            <button
              type="button"
              className="task-btn-edit"
              onClick={() => onEdit(task)}
              disabled={isUpdating}
              aria-label={`Edit task: ${task.title}`}
              title="Edit task"
            >
              <Pencil size={13} aria-hidden="true" />
            </button>
          )}

          {onDelete && (
            confirmDelete ? (
              <div className="task-delete-confirm-box" role="group" aria-label="Confirm deletion">
                <span className="task-delete-confirm-label">Delete?</span>
                <button
                  type="button"
                  className="btn-delete-confirm-yes"
                  onClick={() => {
                    setConfirmDelete(false);
                    onDelete(task.id);
                  }}
                  aria-label={`Confirm delete task: ${task.title}`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className="btn-delete-confirm-cancel"
                  onClick={() => setConfirmDelete(false)}
                  aria-label="Cancel delete"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="task-btn-delete"
                onClick={() => setConfirmDelete(true)}
                aria-label={`Delete task: ${task.title}`}
                title="Delete task"
              >
                <Trash2 size={14} />
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
