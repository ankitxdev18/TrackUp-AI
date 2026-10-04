import { useState, useEffect, useRef } from "react";
import { AlertCircle, Loader2, X } from "lucide-react";
import {
  createGoal,
  updateGoal,
  type Goal,
} from "../api/goals";
import "./GoalModal.css";

interface GoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoalSaved: (goal: Goal) => void;
  goalToEdit?: Goal | null;
}

export function GoalModal({
  isOpen,
  onClose,
  onGoalSaved,
  goalToEdit,
}: GoalModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"ACTIVE" | "COMPLETED" | "ARCHIVED">("ACTIVE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleInputRef = useRef<HTMLInputElement>(null);

  const isEditing = Boolean(goalToEdit);

  useEffect(() => {
    if (isOpen) {
      if (goalToEdit) {
        setTitle(goalToEdit.title);
        setDescription(goalToEdit.description || "");
        setTargetDate(goalToEdit.targetDate || "");
        setProgress(goalToEdit.progress);
        setStatus(goalToEdit.status);
      } else {
        setTitle("");
        setDescription("");
        setTargetDate("");
        setProgress(0);
        setStatus("ACTIVE");
      }
      setError(null);
      setLoading(false);
      setTimeout(() => titleInputRef.current?.focus(), 50);
    }
  }, [isOpen, goalToEdit]);

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
      setError("Goal title is required.");
      return;
    }

    if (progress < 0 || progress > 100 || !Number.isInteger(Number(progress))) {
      setError("Progress must be an integer between 0 and 100.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (isEditing && goalToEdit) {
        const updated = await updateGoal(goalToEdit.id, {
          title: trimmedTitle,
          description: description.trim() || null,
          targetDate: targetDate || null,
          progress: Number(progress),
          status,
        });
        onGoalSaved(updated);
      } else {
        const created = await createGoal({
          title: trimmedTitle,
          description: description.trim() || null,
          targetDate: targetDate || null,
          progress: Number(progress),
          status,
        });
        onGoalSaved(created);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save goal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
      data-testid="goal-modal-backdrop"
    >
      <div
        className="modal-content goal-modal-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-modal-title"
      >
        <div className="modal-header">
          <h2 id="goal-modal-title" className="modal-title">
            {isEditing ? "Edit Goal" : "Create New Goal"}
          </h2>
          <button
            type="button"
            className="btn-modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="modal-error-banner" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="goal-modal-form" noValidate>
          <div className="form-group">
            <label htmlFor="goal-title-input" className="form-label">
              Outcome Title <span className="label-required">*</span>
            </label>
            <input
              id="goal-title-input"
              ref={titleInputRef}
              type="text"
              className="form-input"
              placeholder="e.g. Become internship-ready, Launch TrackUp v1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
              maxLength={500}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="goal-desc-input" className="form-label">
              Description / Why this outcome matters
            </label>
            <textarea
              id="goal-desc-input"
              className="form-textarea"
              placeholder="Provide context or success criteria for this outcome..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              maxLength={2000}
              rows={3}
            />
          </div>

          <div className="form-row-grid">
            <div className="form-group">
              <label htmlFor="goal-target-date-input" className="form-label">
                Target Date
              </label>
              <input
                id="goal-target-date-input"
                type="date"
                className="form-input"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="goal-status-select" className="form-label">
                Status
              </label>
              <select
                id="goal-status-select"
                className="form-select"
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as "ACTIVE" | "COMPLETED" | "ARCHIVED")
                }
                disabled={loading}
              >
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <div className="progress-label-row">
              <label htmlFor="goal-progress-input" className="form-label">
                Progress Percentage
              </label>
              <span className="progress-display-val">{progress}%</span>
            </div>
            <div className="progress-inputs-wrap">
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                disabled={loading}
                className="form-range"
                aria-label="Progress slider"
              />
              <input
                id="goal-progress-input"
                type="number"
                min="0"
                max="100"
                step="1"
                value={progress}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setProgress(isNaN(val) ? 0 : Math.min(100, Math.max(0, val)));
                }}
                disabled={loading}
                className="form-input number-input"
              />
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              id="btn-goal-submit"
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading && <Loader2 size={16} className="spin-icon" />}
              <span>{isEditing ? "Save Changes" : "Create Goal"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
