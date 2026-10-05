import { Check, Clock, AlertTriangle } from "lucide-react";
import { type Task, getDaysOverdue, getTodayDateString, getTomorrowDateString } from "../../api/tasks";

interface TaskItemProps {
  task: Task;
  onToggle: (task: Task) => void;
  isUpdating?: boolean;
  isOverdueItem?: boolean;
}

export function TaskItem({
  task,
  onToggle,
  isUpdating = false,
  isOverdueItem = false,
}: TaskItemProps) {
  const isCompleted = task.status === "COMPLETED";
  const todayStr = getTodayDateString();
  const tomorrowStr = getTomorrowDateString();

  const daysOverdue = isOverdueItem && task.dueDate ? getDaysOverdue(task.dueDate, todayStr) : 0;

  return (
    <div className={`task-card-item ${isOverdueItem ? "item-overdue" : ""}`}>
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

      <span className={`task-label ${isCompleted ? "completed" : ""}`}>
        {task.title}
      </span>

      <div className="task-meta-pills">
        {isOverdueItem && (
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

        {!isOverdueItem && task.dueDate && (
          <span className="tag-due-date">
            <Clock size={10} />
            <span>
              {task.dueDate === todayStr
                ? "Today"
                : task.dueDate === tomorrowStr
                ? "Tomorrow"
                : task.dueDate}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
