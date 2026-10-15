import { Calendar } from "lucide-react";
import { type Task } from "../../api/tasks";
import { Link } from "../../router/Router";
import { TaskItem } from "./TaskItem";

interface UpcomingWidgetProps {
  upcomingTasks: Task[];
  loading: boolean;
  onToggleTask: (task: Task) => void;
  updatingTaskId?: string | null;
  onEditTask?: (task: Task) => void;
}

export function UpcomingWidget({
  upcomingTasks,
  loading,
  onToggleTask,
  updatingTaskId,
  onEditTask,
}: UpcomingWidgetProps) {

  return (
    <section className="dashboard-panel" aria-labelledby="upcoming-heading">
      <div className="panel-title-bar">
        <h2 id="upcoming-heading" className="panel-heading">
          Upcoming
        </h2>
        <Link
          to="/tasks"
          className="panel-link-all"
        >
          View all →
        </Link>
      </div>

      {loading ? (
        <div className="dash-skeleton-list" role="status" aria-label="Loading upcoming tasks">
          <div className="dash-skeleton-row" />
          <div className="dash-skeleton-row" />
        </div>
      ) : upcomingTasks.length === 0 ? (
        <div className="dash-empty-compact">
          <Calendar size={20} className="dash-empty-icon" />
          <p className="dash-empty-text">No upcoming tasks scheduled.</p>
        </div>
      ) : (
        <div className="task-list-wrap">
          {upcomingTasks.slice(0, 4).map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={onToggleTask}
              onEdit={onEditTask}
              isUpdating={updatingTaskId === task.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}
