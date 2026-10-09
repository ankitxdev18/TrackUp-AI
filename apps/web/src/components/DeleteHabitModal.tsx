import { useEffect, useRef } from "react";
import { AlertCircle, AlertTriangle, Loader2, X } from "lucide-react";
import "./DeleteHabitModal.css";

interface DeleteHabitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  habitTitle: string;
  loading?: boolean;
  error?: string | null;
}

export function DeleteHabitModal({
  isOpen,
  onClose,
  onConfirm,
  habitTitle,
  loading = false,
  error = null,
}: DeleteHabitModalProps) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
    } else {
      previousFocusRef.current?.focus?.();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !loading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="delete-modal-backdrop"
      onClick={() => !loading && onClose()}
      role="presentation"
    >
      <div
        className="delete-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-habit-modal-title"
      >
        <div className="delete-modal-header">
          <div className="delete-modal-warning-icon">
            <AlertTriangle size={20} className="warning-icon" aria-hidden="true" />
          </div>
          <div className="delete-modal-title-wrap">
            <h2 id="delete-habit-modal-title">Delete Habit</h2>
            <p className="delete-modal-subtitle">
              This action is permanent and cannot be undone.
            </p>
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

        {error && (
          <div className="delete-modal-error" role="alert">
            <AlertCircle size={16} className="error-icon" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div className="delete-modal-body">
          <p className="delete-modal-message">
            Are you sure you want to delete{" "}
            <strong className="delete-habit-name">"{habitTitle}"</strong>?
          </p>
          <div className="delete-modal-callout">
            <span>
              All completion history for this habit will be permanently deleted
              from your account.
            </span>
          </div>
        </div>

        <div className="delete-modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spinner" aria-hidden="true" />
                <span>Deleting...</span>
              </>
            ) : (
              <span>Delete Habit</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
