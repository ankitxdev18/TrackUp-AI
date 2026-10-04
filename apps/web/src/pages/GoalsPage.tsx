import { useState, useEffect } from "react";
import {
  AlertCircle,
  Archive,
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Target,
  Trash2,
} from "lucide-react";
import {
  deleteGoal,
  fetchGoals,
  formatTargetDate,
  type Goal,
  updateGoal,
} from "../api/goals";
import { GoalModal } from "../components/GoalModal";
import { useRouter } from "../router/Router";
import "./GoalsPage.css";

type GoalFilterType = "all" | "active" | "completed" | "archived";

export function GoalsPage() {
  const { navigate } = useRouter();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<GoalFilterType>("active");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const loadGoals = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchGoals();
      setGoals(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load goals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGoals();
  }, []);

  const handleGoalSaved = (savedGoal: Goal) => {
    setGoals((prev) => {
      const exists = prev.some((g) => g.id === savedGoal.id);
      if (exists) {
        return prev.map((g) => (g.id === savedGoal.id ? savedGoal : g));
      }
      return [savedGoal, ...prev];
    });
    setEditingGoal(null);
  };

  const handleToggleComplete = async (goal: Goal) => {
    const nextStatus = goal.status === "COMPLETED" ? "ACTIVE" : "COMPLETED";
    const nextProgress = nextStatus === "COMPLETED" ? 100 : goal.progress;
    try {
      const updated = await updateGoal(goal.id, {
        status: nextStatus,
        progress: nextProgress,
      });
      setGoals((prev) => prev.map((g) => (g.id === goal.id ? updated : g)));
      setMenuOpenId(null);
    } catch (err: unknown) {
      alert("Failed to update goal status. Please try again.");
    }
  };

  const handleToggleArchive = async (goal: Goal) => {
    const nextStatus = goal.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED";
    try {
      const updated = await updateGoal(goal.id, { status: nextStatus });
      setGoals((prev) => prev.map((g) => (g.id === goal.id ? updated : g)));
      setMenuOpenId(null);
    } catch (err: unknown) {
      alert("Failed to update goal archive status. Please try again.");
    }
  };

  const handleDeleteGoal = async (goal: Goal) => {
    setMenuOpenId(null);
    const confirmed = confirm(
      `Are you sure you want to delete the goal "${goal.title}"?\n\nThis action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await deleteGoal(goal.id);
      setGoals((prev) => prev.filter((g) => g.id !== goal.id));
    } catch (err: unknown) {
      alert("Failed to delete goal. Please try again.");
    }
  };

  const counts = {
    all: goals.length,
    active: goals.filter((g) => g.status === "ACTIVE").length,
    completed: goals.filter((g) => g.status === "COMPLETED").length,
    archived: goals.filter((g) => g.status === "ARCHIVED").length,
  };

  const filteredGoals = goals.filter((g) => {
    if (activeFilter === "active") return g.status === "ACTIVE";
    if (activeFilter === "completed") return g.status === "COMPLETED";
    if (activeFilter === "archived") return g.status === "ARCHIVED";
    return true;
  });

  return (
    <div className="goals-page-wrap">
      {/* Page Header */}
      <div className="goals-header-row">
        <div>
          <h1 className="goals-main-title">Goals</h1>
          <p className="goals-subtitle">
            Track high-level outcomes and meaningful life milestones.
          </p>
        </div>

        <button
          id="btn-create-goal"
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setEditingGoal(null);
            setIsModalOpen(true);
          }}
        >
          <Plus size={16} />
          <span>Create Goal</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="goals-filters-bar" role="tablist" aria-label="Goal status filters">
        <button
          type="button"
          role="tab"
          aria-selected={activeFilter === "all"}
          className={`filter-tab ${activeFilter === "all" ? "active" : ""}`}
          onClick={() => setActiveFilter("all")}
        >
          <span>All</span>
          <span className="filter-count-badge">{counts.all}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeFilter === "active"}
          className={`filter-tab ${activeFilter === "active" ? "active" : ""}`}
          onClick={() => setActiveFilter("active")}
        >
          <span>Active</span>
          <span className="filter-count-badge">{counts.active}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeFilter === "completed"}
          className={`filter-tab ${activeFilter === "completed" ? "active" : ""}`}
          onClick={() => setActiveFilter("completed")}
        >
          <span>Completed</span>
          <span className="filter-count-badge">{counts.completed}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeFilter === "archived"}
          className={`filter-tab ${activeFilter === "archived" ? "active" : ""}`}
          onClick={() => setActiveFilter("archived")}
        >
          <span>Archived</span>
          <span className="filter-count-badge">{counts.archived}</span>
        </button>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="goals-state-card" role="status">
          <Loader2 size={24} className="spin-icon text-primary" />
          <p className="state-card-title">Loading goals...</p>
        </div>
      ) : error ? (
        <div className="goals-error-banner" role="alert">
          <AlertCircle size={18} />
          <div className="error-content">
            <span className="error-title">Failed to load goals</span>
            <span className="error-desc">{error}</span>
          </div>
          <button
            id="btn-goals-retry"
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={loadGoals}
          >
            <RefreshCw size={14} />
            <span>Retry</span>
          </button>
        </div>
      ) : goals.length === 0 ? (
        <div className="goals-empty-state">
          <div className="empty-icon-wrap">
            <Target size={32} />
          </div>
          <h2 className="empty-title">No goals yet.</h2>
          <p className="empty-desc">
            Define high-level outcomes to anchor your daily focus and track long-term progress.
          </p>
          <button
            id="btn-empty-create-goal"
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditingGoal(null);
              setIsModalOpen(true);
            }}
          >
            <Plus size={16} />
            <span>Create your first goal</span>
          </button>
        </div>
      ) : filteredGoals.length === 0 ? (
        <div className="goals-empty-state" style={{ padding: "var(--space-8) var(--space-4)" }}>
          <p className="empty-desc">No {activeFilter} goals found.</p>
        </div>
      ) : (
        <div className="goals-grid">
          {filteredGoals.map((goal) => {
            const isMenuOpen = menuOpenId === goal.id;
            const formattedDate = formatTargetDate(goal.targetDate);

            return (
              <div
                key={goal.id}
                className="goal-card"
                onClick={() => navigate(`/goals/${goal.id}`)}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") navigate(`/goals/${goal.id}`);
                }}
                aria-label={`View goal ${goal.title}`}
              >
                <div className="goal-card-header">
                  <div className="goal-title-wrap">
                    <span
                      className={`goal-status-badge status-${goal.status.toLowerCase()}`}
                    >
                      {goal.status.charAt(0) + goal.status.slice(1).toLowerCase()}
                    </span>
                    <h3 className="goal-card-title">{goal.title}</h3>
                  </div>

                  <div
                    className="goal-menu-container"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="btn-card-menu"
                      onClick={() => setMenuOpenId(isMenuOpen ? null : goal.id)}
                      aria-label="Goal options"
                      aria-expanded={isMenuOpen}
                    >
                      <MoreVertical size={16} />
                    </button>

                    {isMenuOpen && (
                      <div className="card-dropdown-menu">
                        <button
                          type="button"
                          className="dropdown-item"
                          onClick={() => {
                            setMenuOpenId(null);
                            setEditingGoal(goal);
                            setIsModalOpen(true);
                          }}
                        >
                          <Pencil size={14} />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          className="dropdown-item"
                          onClick={() => handleToggleComplete(goal)}
                        >
                          <CheckCircle2 size={14} />
                          <span>
                            {goal.status === "COMPLETED" ? "Mark Active" : "Mark Complete"}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="dropdown-item"
                          onClick={() => handleToggleArchive(goal)}
                        >
                          <Archive size={14} />
                          <span>
                            {goal.status === "ARCHIVED" ? "Unarchive" : "Archive"}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="dropdown-item item-danger"
                          onClick={() => handleDeleteGoal(goal)}
                        >
                          <Trash2 size={14} />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {goal.description && (
                  <p className="goal-card-description">{goal.description}</p>
                )}

                <div className="goal-card-progress-section">
                  <div className="goal-progress-meta">
                    <span className="goal-progress-label">Progress</span>
                    <span className="goal-progress-percent">{goal.progress}%</span>
                  </div>
                  <div
                    className="goal-progress-track"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={goal.progress}
                    aria-label={`Progress: ${goal.progress}%`}
                  >
                    <div
                      className={`goal-progress-fill ${
                        goal.status === "COMPLETED" ? "fill-completed" : ""
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, goal.progress))}%` }}
                    />
                  </div>
                </div>

                <div className="goal-card-footer">
                  {formattedDate ? (
                    <div className="goal-date-badge">
                      <Clock size={12} />
                      <span>Target {formattedDate}</span>
                    </div>
                  ) : (
                    <div className="goal-date-badge date-muted">
                      <span>No target date</span>
                    </div>
                  )}

                  <span className="goal-view-link">
                    <span>Details</span>
                    <ArrowRight size={13} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Goal Create/Edit Modal */}
      <GoalModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingGoal(null);
        }}
        onGoalSaved={handleGoalSaved}
        goalToEdit={editingGoal}
      />
    </div>
  );
}
