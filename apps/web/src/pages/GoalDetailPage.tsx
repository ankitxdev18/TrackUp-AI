import { useState, useEffect } from "react";
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  deleteGoal,
  fetchGoal,
  formatTargetDate,
  type Goal,
  updateGoal,
} from "../api/goals";
import { GoalModal } from "../components/GoalModal";
import { useRouter } from "../router/Router";
import "./GoalDetailPage.css";

interface GoalDetailPageProps {
  goalId: string;
}

export function GoalDetailPage({ goalId }: GoalDetailPageProps) {
  const { navigate } = useRouter();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadGoalData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchGoal(goalId);
      setGoal(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load goal");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGoalData();
  }, [goalId]);

  const handleToggleComplete = async () => {
    if (!goal) return;
    const nextStatus = goal.status === "COMPLETED" ? "ACTIVE" : "COMPLETED";
    const nextProgress = nextStatus === "COMPLETED" ? 100 : goal.progress;
    try {
      setActionLoading(true);
      const updated = await updateGoal(goal.id, {
        status: nextStatus,
        progress: nextProgress,
      });
      setGoal(updated);
    } catch (err: unknown) {
      alert("Failed to update status. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleArchive = async () => {
    if (!goal) return;
    const nextStatus = goal.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED";
    try {
      setActionLoading(true);
      const updated = await updateGoal(goal.id, { status: nextStatus });
      setGoal(updated);
    } catch (err: unknown) {
      alert("Failed to update archive status. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!goal) return;
    const confirmed = confirm(
      `Are you sure you want to delete "${goal.title}"?\n\nThis action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      setActionLoading(true);
      await deleteGoal(goal.id);
      navigate("/goals");
    } catch (err: unknown) {
      alert("Failed to delete goal. Please try again.");
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="goal-detail-state" role="status">
        <Loader2 size={24} className="spin-icon text-primary" />
        <p>Loading goal details...</p>
      </div>
    );
  }

  if (error || !goal) {
    return (
      <div className="goal-detail-state">
        <AlertCircle size={32} className="text-danger" />
        <h2 className="state-heading">Goal Not Found</h2>
        <p className="state-text">{error || "The requested goal does not exist or you do not have permission to view it."}</p>
        <div className="state-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={loadGoalData}
          >
            <RefreshCw size={14} />
            <span>Retry</span>
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate("/goals")}
          >
            <ArrowLeft size={14} />
            <span>Back to Goals</span>
          </button>
        </div>
      </div>
    );
  }

  const formattedTargetDate = formatTargetDate(goal.targetDate);
  const formattedCreatedAt = new Date(goal.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const formattedUpdatedAt = new Date(goal.updatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="goal-detail-wrap">
      {/* Top Breadcrumb navigation */}
      <div className="detail-nav-row">
        <button
          type="button"
          className="btn-back-link"
          onClick={() => navigate("/goals")}
        >
          <ArrowLeft size={16} />
          <span>Back to Goals</span>
        </button>
      </div>

      {/* Hero Header */}
      <div className="goal-detail-header-card">
        <div className="header-meta-row">
          <span className={`goal-status-badge status-${goal.status.toLowerCase()}`}>
            {goal.status.charAt(0) + goal.status.slice(1).toLowerCase()}
          </span>

          <div className="header-actions-row">
            <button
              id="btn-goal-edit"
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setIsEditModalOpen(true)}
              disabled={actionLoading}
            >
              <Pencil size={14} />
              <span>Edit</span>
            </button>
            <button
              id="btn-goal-toggle-complete"
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleToggleComplete}
              disabled={actionLoading}
            >
              <CheckCircle2 size={14} />
              <span>{goal.status === "COMPLETED" ? "Mark Active" : "Mark Complete"}</span>
            </button>
            <button
              id="btn-goal-toggle-archive"
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleToggleArchive}
              disabled={actionLoading}
            >
              <Archive size={14} />
              <span>{goal.status === "ARCHIVED" ? "Unarchive" : "Archive"}</span>
            </button>
            <button
              id="btn-goal-delete"
              type="button"
              className="btn btn-secondary btn-sm btn-danger-action"
              onClick={handleDelete}
              disabled={actionLoading}
            >
              <Trash2 size={14} />
              <span>Delete</span>
            </button>
          </div>
        </div>

        <h1 className="goal-detail-title">{goal.title}</h1>

        {goal.description && (
          <p className="goal-detail-description">{goal.description}</p>
        )}

        {/* Progress Display */}
        <div className="detail-progress-card">
          <div className="detail-progress-header">
            <span className="detail-progress-label">Outcome Progress</span>
            <span className="detail-progress-val">{goal.progress}% Complete</span>
          </div>
          <div
            className="detail-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={goal.progress}
            aria-label={`Progress: ${goal.progress}%`}
          >
            <div
              className={`detail-progress-fill ${goal.status === "COMPLETED" ? "fill-completed" : ""}`}
              style={{ width: `${Math.min(100, Math.max(0, goal.progress))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Metadata Panel */}
      <div className="goal-metadata-panel">
        <h2 className="meta-section-title">Milestone Details</h2>
        <div className="meta-grid">
          <div className="meta-item">
            <span className="meta-item-label">Target Date</span>
            <span className="meta-item-val">
              {formattedTargetDate ? (
                <>
                  <Clock size={14} />
                  <span>{formattedTargetDate}</span>
                </>
              ) : (
                <span className="text-muted">No target date specified</span>
              )}
            </span>
          </div>

          <div className="meta-item">
            <span className="meta-item-label">Status</span>
            <span className="meta-item-val">
              {goal.status}
            </span>
          </div>

          <div className="meta-item">
            <span className="meta-item-label">Created Date</span>
            <span className="meta-item-val">{formattedCreatedAt}</span>
          </div>

          <div className="meta-item">
            <span className="meta-item-label">Last Modified</span>
            <span className="meta-item-val">{formattedUpdatedAt}</span>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <GoalModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onGoalSaved={(updated) => {
          setGoal(updated);
          setIsEditModalOpen(false);
        }}
        goalToEdit={goal}
      />
    </div>
  );
}
