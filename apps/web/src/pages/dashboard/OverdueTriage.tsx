import { AlertTriangle } from "lucide-react";
import { type Task } from "../../api/tasks";
import { TaskItem } from "./TaskItem";

interface OverdueTriageProps {
  overdueTasks: Task[];
  onToggleTask: (task: Task) => void;
  updatingTaskId?: string | null;
}

export function OverdueTriage({
  overdueTasks,
  onToggleTask,
  updatingTaskId,
}: OverdueTriageProps) {
  if (overdueTasks.length === 0) {
    return null;
  }

  const count = overdueTasks.length;

  return (
    <section className="dashboard-panel overdue-triage-panel" aria-labelledby="overdue-triage-heading">
      <div className="panel-title-bar overdue-title-bar">
        <div className="overdue-header-wrap">
          <div className="overdue-icon-wrap" aria-hidden="true">
            <AlertTriangle size={15} />
          </div>
          <div>
            <h2 id="overdue-triage-heading" className="panel-heading overdue-heading">
              Overdue · {count} {count === 1 ? "task" : "tasks"}
            </h2>
            <p className="overdue-sub">Needs attention before continuing today</p>
          </div>
        </div>
      </div>

      <div className="task-list-wrap">
        {overdueTasks.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            onToggle={onToggleTask}
            isUpdating={updatingTaskId === task.id}
            isOverdueItem={true}
          />
        ))}
      </div>
    </section>
  );
}
