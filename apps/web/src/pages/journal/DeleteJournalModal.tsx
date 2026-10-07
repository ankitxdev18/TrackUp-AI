import React, { useEffect } from "react";
import { AlertCircle, AlertTriangle, Loader2, X } from "lucide-react";
import { type JournalEntry, formatJournalDate } from "../../api/journal";

interface DeleteJournalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  entry: JournalEntry | null;
  loading?: boolean;
  error?: string | null;
}

export const DeleteJournalModal: React.FC<DeleteJournalModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  entry,
  loading = false,
  error = null,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !loading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen || !entry) return null;

  const displayTitle = entry.title?.trim() || "Untitled Entry";
  const formattedDate = formatJournalDate(entry.entryDate);

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
        aria-labelledby="delete-journal-modal-title"
      >
        <div className="delete-modal-header">
          <div className="delete-modal-warning-icon">
            <AlertTriangle size={20} className="warning-icon" aria-hidden="true" />
          </div>
          <div className="delete-modal-title-wrap">
            <h2 id="delete-journal-modal-title">Delete Journal Entry</h2>
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
            Are you sure you want to delete the entry for{" "}
            <strong>{formattedDate} ({entry.entryDate})</strong>
            {entry.title ? (
              <>
                {" — "}
                <em className="delete-entry-title">"{displayTitle}"</em>
              </>
            ) : null}
            ?
          </p>
          <div className="delete-modal-callout">
            <span>This permanently deletes this journal entry.</span>
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
                <Loader2 size={15} className="spinner" aria-hidden="true" />
                <span>Deleting...</span>
              </>
            ) : (
              <span>Delete Entry</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
