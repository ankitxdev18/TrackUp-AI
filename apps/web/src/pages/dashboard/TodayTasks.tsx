import { AlertCircle, CheckCircle2, Plus } from "lucide-react";
import { type Task } from "../../api/tasks";
import { QuickAddTask } from "./QuickAddTask";
import { TaskItem } from "./TaskItem";

interface TodayTasksProps {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  onToggleTask: (task: Task) => void;
  updatingTaskId?: string | null;
  onQuickAdd: (title: string) => Promise<void>;
  onOpenModal: () => void;
}

export function TodayTasks({
  tasks,
  loading,
  error,
  onToggleTask,
  updatingTaskId,
  onQuickAdd,
  onOpenModal,
}: TodayTasksProps) {
  const completedCount = tasks.filter((t) => t.status === "COMPLETED").length;
  const totalCount = tasks.length;
  const remainingCount = totalCount - completedCount;

  return (
    <section className="dashboard-panel" aria-labelledby="today-tasks-heading">
      <div className="panel-title-bar">
        <div className="panel-title-left">
          <h2 id="today-tasks-heading" className="panel-heading">
            Today's Tasks
          </h2>
          {totalCount > 0 && (
            <span className="panel-counter-badge">
              {remainingCount} to do
            </span>
          )}
        </div>

        <button
          type="button"
          className="panel-btn-add"
          onClick={onOpenModal}
          aria-label="Add task"
        >
          <Plus size={14} />
          <span>Add Task</span>
        </button>
      </div>

      {/* Inline Quick Add Input */}
      <QuickAddTask
        onQuickAdd={onQuickAdd}
        onOpenDetailedModal={onOpenModal}
        disabled={loading}
      />

      {/* Task List / Skeletons / States */}
      {loading ? (
        <div className="dash-skeleton-list" role="status" aria-label="Loading tasks">
          <div className="dash-skeleton-row" />
          <div className="dash-skeleton-row" />
          <div className="dash-skeleton-row" />
        </div>
      ) : error ? (
        <div className="dash-error-box" role="alert">
          <AlertCircle size={16} />
          <div className="dash-error-msg">{error}</div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="dash-empty-tasks">
          <div className="empty-icon-ring">
            <CheckCircle2 size={24} className="dash-empty-icon" />
          </div>
          <p className="dash-empty-title">Your day is clear.</p>
          <p className="dash-empty-sub">You're clear for today.</p>
          <p className="dash-empty-hint">Add something you want to accomplish.</p>
          <button
            type="button"
            className="btn-dash-create"
            onClick={onOpenModal}
          >
            <Plus size={14} />
            <span>Add task</span>
          </button>
        </div>
      ) : (
        <div className="task-list-wrap">
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={onToggleTask}
              isUpdating={updatingTaskId === task.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}
