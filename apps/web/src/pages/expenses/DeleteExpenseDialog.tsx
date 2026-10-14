import { AlertTriangle, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatCents, getCategoryMeta, type Expense } from "../../api/expenses";

interface DeleteExpenseDialogProps {
  isOpen: boolean;
  expense: Expense | null;
  onClose: () => void;
  onConfirmDelete: (id: string) => Promise<void>;
}

export function DeleteExpenseDialog({
  isOpen,
  expense,
  onClose,
  onConfirmDelete,
}: DeleteExpenseDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusedElementRef.current = document.activeElement as HTMLElement | null;
      setError(null);
      setLoading(false);
    } else if (previousFocusedElementRef.current) {
      previousFocusedElementRef.current.focus?.();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        onClose();
        return;
      }

      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
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

  if (!isOpen || !expense) return null;

  const meta = getCategoryMeta(expense.categoryId);

  const handleDelete = async () => {
    try {
      setLoading(true);
      setError(null);
      await onConfirmDelete(expense.id);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete expense");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="expense-modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="expense-modal-card delete-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
      >
        <div className="expense-modal-header">
          <div className="delete-header-icon-wrap" aria-hidden="true">
            <AlertTriangle size={18} />
          </div>
          <h2 id="delete-dialog-title" className="expense-modal-title">
            Delete Expense
          </h2>
          <button
            type="button"
            className="btn-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
            disabled={loading}
          >
            <X size={18} />
          </button>
        </div>

        <div className="delete-modal-body">
          <p className="delete-modal-prompt">
            Are you sure you want to delete this expense? This action cannot be undone.
          </p>

          <div className="delete-preview-box">
            <div className="delete-preview-category">
              <meta.icon size={15} style={{ color: meta.color }} />
              <span>{meta.name}</span>
            </div>
            <div className="delete-preview-desc">
              {expense.description || "No description"}
            </div>
            <div className="delete-preview-amount font-tabular">
              {formatCents(expense.amountCents)}
            </div>
          </div>

          {error && <div className="modal-error-banner">{error}</div>}
        </div>

        <div className="expense-modal-footer">
          <button
            type="button"
            className="btn-modal-cancel"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-modal-delete"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={15} className="spinner" />
                <span>Deleting...</span>
              </>
            ) : (
              <span>Delete Expense</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
