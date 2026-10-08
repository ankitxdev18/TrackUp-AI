import React, { useEffect } from "react";
import { AlertCircle, AlertTriangle, Loader2, X } from "lucide-react";
import type { CalendarEvent } from "../../api/calendar";

interface DeleteEventDialogProps {
  isOpen: boolean;
  event: CalendarEvent | null;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteEventDialog: React.FC<DeleteEventDialogProps> = ({
  isOpen,
  event,
  loading = false,
  error = null,
  onClose,
  onConfirm,
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

  if (!isOpen || !event) return null;

  return (
    <div
      className="calendar-modal-backdrop"
      onClick={() => !loading && onClose()}
      role="presentation"
    >
      <div
        className="calendar-modal-dialog"
        style={{ maxWidth: "440px" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-event-dialog-title"
      >
        <div className="calendar-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <AlertTriangle size={20} style={{ color: "var(--color-danger, #e35d6a)" }} />
            <h2 id="delete-event-dialog-title" className="calendar-modal-title">
              Delete Event
            </h2>
          </div>
          <button
            type="button"
            className="btn-calendar-nav"
            onClick={onClose}
            disabled={loading}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="calendar-modal-body">
          {error && (
            <div className="calendar-error-banner" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.5, color: "var(--text-primary, #f4f4f5)" }}>
            Are you sure you want to delete <strong style={{ color: "#ffffff" }}>"{event.title}"</strong>?
          </p>

          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-danger, #e35d6a)" }}>
            This action is permanent and cannot be undone.
          </p>
        </div>

        <div className="calendar-modal-footer">
          <button
            type="button"
            className="btn-calendar-nav"
            onClick={onClose}
            disabled={loading}
            aria-label="Cancel deletion"
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-create-event"
            style={{ background: "var(--color-danger, #e35d6a)" }}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spinner" />
                <span>Deleting...</span>
              </>
            ) : (
              <span>Delete Event</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
