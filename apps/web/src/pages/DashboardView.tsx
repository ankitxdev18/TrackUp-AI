import { useState, useEffect, useCallback } from "react";
import { AlertCircle } from "lucide-react";
import { fetchGoals, type Goal } from "../api/goals";
import { fetchProjects, type Project } from "../api/projects";
import {
  createTask,
  fetchTasks,
  getTodayDateString,
  type Task,
  updateTask,
} from "../api/tasks";
import { CreateTaskModal } from "../components/CreateTaskModal";
import { DashboardHeader } from "./dashboard/DashboardHeader";
import { GoalsWidget } from "./dashboard/GoalsWidget";
import { OverdueTriage } from "./dashboard/OverdueTriage";
import { ProjectsWidget } from "./dashboard/ProjectsWidget";
import { TodayTasks } from "./dashboard/TodayTasks";
import { UpcomingWidget } from "./dashboard/UpcomingWidget";
import "./DashboardView.css";

export function DashboardView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  const [tasksLoading, setTasksLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [goalsLoading, setGoalsLoading] = useState(true);

  const [tasksError, setTasksError] = useState<string | null>(null);
  const [goalsError, setGoalsError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  const todayStr = getTodayDateString();

  const loadTasksData = useCallback(async () => {
    try {
      setTasksLoading(true);
      setTasksError(null);
      const data = await fetchTasks();
      setTasks(data);
    } catch (err: unknown) {
      setTasksError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const loadProjectsData = useCallback(async () => {
    try {
      setProjectsLoading(true);
      const data = await fetchProjects();
      setProjects(data.filter((p) => p.status === "ACTIVE"));
    } catch {
      setProjects([]);
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const loadGoalsData = useCallback(async () => {
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
  }, []);

  // Concurrent dashboard hydration
  useEffect(() => {
    Promise.allSettled([loadTasksData(), loadProjectsData(), loadGoalsData()]);
  }, [loadTasksData, loadProjectsData, loadGoalsData]);

  // Task Completion Toggle with Optimistic Rollback
  const handleToggleTask = async (task: Task) => {
    const nextStatus = task.status === "COMPLETED" ? "TODO" : "COMPLETED";
    const prevTasks = [...tasks];

    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
    );

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

    try {
      setUpdatingTaskId(task.id);
      const updated = await updateTask(task.id, { status: nextStatus });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch (err: unknown) {
      // Revert optimistic update
      setTasks(prevTasks);
      alert("Failed to update task state. Reverting to previous state.");
    } finally {
      setUpdatingTaskId(null);
    }
  };

  // Quick Add for Today
  const handleQuickAdd = async (title: string) => {
    const newTask = await createTask({
      title,
      dueDate: todayStr,
      priority: "MEDIUM",
    });
    setTasks((prev) => [newTask, ...prev]);
  };

  // Detailed Modal Task Creation
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

  // Data Derivations
  // Today's Tasks: explicitly scheduled for today (unscheduled backlog excluded)
  const todayTasks = tasks.filter((t) => t.dueDate === todayStr);
  const todayTotal = todayTasks.length;
  const todayCompleted = todayTasks.filter((t) => t.status === "COMPLETED").length;
  const todayRemaining = todayTotal - todayCompleted;
  const progressPercent =
    todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0;

  // Overdue: tasks scheduled before today and not completed
  const overdueTasks = tasks.filter(
    (t) => t.dueDate && t.dueDate < todayStr && t.status !== "COMPLETED"
  );

  // Upcoming: tasks scheduled after today and not completed
  const upcomingTasks = tasks.filter(
    (t) => t.dueDate && t.dueDate > todayStr && t.status !== "COMPLETED"
  );

  return (
    <div className="dashboard-view">
      {/* Zone 1: Orientation Header & Daily Momentum */}
      <DashboardHeader
        todayTotal={todayTotal}
        todayCompleted={todayCompleted}
        todayRemaining={todayRemaining}
        overdueCount={overdueTasks.length}
        progressPercent={progressPercent}
      />

      {/* Error Banner if tasks fail */}
      {tasksError && (
        <div className="tasks-error-banner" role="alert">
          <AlertCircle size={18} />
          <div className="error-text">
            <strong>Unable to load dashboard data:</strong> {tasksError}
          </div>
          <button type="button" className="btn-retry" onClick={loadTasksData}>
            Retry
          </button>
        </div>
      )}

      {/* Main Grid: Today's Execution (Left) & Contextual Horizon (Right) */}
      <div className="dashboard-grid">
        {/* Left Column: Overdue Triage + Today's Tasks */}
        <div className="dashboard-primary-col">
          <OverdueTriage
            overdueTasks={overdueTasks}
            onToggleTask={handleToggleTask}
            updatingTaskId={updatingTaskId}
          />

          <TodayTasks
            tasks={todayTasks}
            loading={tasksLoading}
            error={tasksError}
            onToggleTask={handleToggleTask}
            updatingTaskId={updatingTaskId}
            onQuickAdd={handleQuickAdd}
            onOpenModal={() => setIsModalOpen(true)}
          />
        </div>

        {/* Right Column: Contextual Horizon (Goals, Projects, Upcoming) */}
        <div className="dashboard-horizon-col">
          <GoalsWidget
            goals={goals}
            loading={goalsLoading}
            error={goalsError}
            onRetry={loadGoalsData}
          />

          <ProjectsWidget
            projects={projects}
            loading={projectsLoading}
          />

          <UpcomingWidget
            upcomingTasks={upcomingTasks}
            loading={tasksLoading}
            onToggleTask={handleToggleTask}
            updatingTaskId={updatingTaskId}
          />
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
