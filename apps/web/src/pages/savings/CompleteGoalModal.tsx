import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import {
  formatSavingsPaise,
  updateSavingsGoalStatus,
  SavingsApiError,
  type ActiveSavingsGoal,
  type UpdateGoalStatusResponse,
} from "../../api/savings";

interface CompleteGoalModalProps {
  isOpen: boolean;
  goal: ActiveSavingsGoal;
  onClose: () => void;
  onGoalCompleted: (res: UpdateGoalStatusResponse) => void;
}

export function CompleteGoalModal({
  isOpen,
  goal,
  onClose,
  onGoalCompleted,
}: CompleteGoalModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusedElementRef.current = document.activeElement as HTMLElement | null;
      setError(null);
      setLoading(false);

      const timer = setTimeout(() => {
        confirmBtnRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else if (previousFocusedElementRef.current) {
      previousFocusedElementRef.current.focus?.();
    }
  }, [isOpen]);

  // Focus trap & Escape key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        onClose();
        return;
      }

      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (loading) return; // Prevent duplicate clicks

    try {
      setLoading(true);
      setError(null);
      const res = await updateSavingsGoalStatus(goal.id, "COMPLETED");
      onGoalCompleted(res);
      onClose();
    } catch (err: unknown) {
      if (err instanceof SavingsApiError) {
        setError(err.message);
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "An unexpected error occurred while completing the goal."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        className="modal-box modal-box-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="complete-goal-title"
        ref={modalRef}
      >
        <div className="modal-header">
          <div className="modal-title-wrap">
            <div className="modal-icon-badge badge-success" aria-hidden="true">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <h2 id="complete-goal-title" className="modal-title">
                Complete Savings Goal
              </h2>
              <p className="modal-subtitle">
                Mark <strong>{goal.name}</strong> as completed.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-modal-close"
            onClick={onClose}
            disabled={loading}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="modal-error-banner" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <p className="confirm-text">
            Are you sure you want to complete this savings goal?
          </p>

          <div className="confirm-goal-summary">
            <div className="confirm-summary-row">
              <span>Goal:</span>
              <strong>{goal.name}</strong>
            </div>
            <div className="confirm-summary-row">
              <span>Total Saved:</span>
              <strong>{formatSavingsPaise(goal.savedAmountCents)}</strong>
            </div>
            <div className="confirm-summary-row">
              <span>Target Amount:</span>
              <span>{formatSavingsPaise(goal.targetAmountCents)}</span>
            </div>
            <div className="confirm-summary-row">
              <span>Progress:</span>
              <span>{goal.progressPercent}%</span>
            </div>
          </div>

          <p className="confirm-subtext">
            Completing this goal releases your active goal slot so you can create a new active savings goal. Historical deposit records remain safely stored in your ledger.
          </p>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            id="btn-confirm-complete-goal"
            ref={confirmBtnRef}
            type="button"
            className="btn btn-primary btn-success-action"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Completing...</span>
              </>
            ) : (
              <span>Confirm Complete</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
