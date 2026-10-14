import { AlertCircle, AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { formatCents, parseCurrencyInputToCents } from "../../api/expenses";

interface BudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: { month: string; amountCents: number }) => Promise<void>;
  onDelete?: (month: string) => Promise<void>;
  currentMonth: string;
  existingBudgetAmountCents?: number | null;
}

export function BudgetModal({
  isOpen,
  onClose,
  onSubmit,
  onDelete,
  currentMonth,
  existingBudgetAmountCents,
}: BudgetModalProps) {
  const isEditing = Boolean(
    existingBudgetAmountCents && existingBudgetAmountCents > 0
  );

  const [amountStr, setAmountStr] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const amountInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);

  // Month label formatting
  const getMonthLabel = (mStr: string) => {
    if (!mStr) return "";
    const [year, month] = mStr.split("-");
    const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  const monthLabel = getMonthLabel(currentMonth);

  useEffect(() => {
    if (isOpen) {
      previousFocusedElementRef.current = document.activeElement as HTMLElement | null;

      if (existingBudgetAmountCents && existingBudgetAmountCents > 0) {
        setAmountStr((existingBudgetAmountCents / 100).toFixed(2));
      } else {
        setAmountStr("");
      }
      setShowConfirmDelete(false);
      setError(null);
      setLoading(false);

      setTimeout(() => {
        amountInputRef.current?.focus();
      }, 50);
    } else {
      if (previousFocusedElementRef.current) {
        previousFocusedElementRef.current.focus();
      }
    }
  }, [isOpen, existingBudgetAmountCents]);

  // Trap focus and close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab" && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedCents = parseCurrencyInputToCents(amountStr);
    if (parsedCents === null) {
      setError(
        "Please enter a valid positive budget amount in INR (e.g. 10000 or 10,000.00)."
      );
      amountInputRef.current?.focus();
      return;
    }

    try {
      setLoading(true);
      await onSubmit({
        month: currentMonth,
        amountCents: parsedCents,
      });
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to save monthly budget."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!onDelete) return;
    try {
      setLoading(true);
      setError(null);
      await onDelete(currentMonth);
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to remove monthly budget."
      );
    } finally {
      setLoading(false);
    }
  };

  const parsedPreview = parseCurrencyInputToCents(amountStr);

  return (
    <div
      className="modal-overlay budget-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
      role="presentation"
      data-testid="budget-modal-overlay"
    >
      <div
        className="modal-container budget-modal-container"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="budget-modal-title"
      >
        <header className="modal-header">
          <div>
            <h2 id="budget-modal-title" className="modal-title">
              {isEditing ? "Edit Monthly Budget" : "Set Monthly Budget"}
            </h2>
            <p className="modal-subtitle">
              Configure spending limit for{" "}
              <strong className="budget-modal-month">{monthLabel}</strong>.
            </p>
          </div>
          <button
            type="button"
            className="btn-modal-close"
            onClick={onClose}
            aria-label="Close budget dialog"
          >
            <X size={18} />
          </button>
        </header>

        {error && (
          <div className="modal-error-banner" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="modal-form" noValidate>
          {/* Target Month display */}
          <div className="form-group">
            <label className="form-label" htmlFor="budget-month-display">
              Target Month
            </label>
            <input
              id="budget-month-display"
              type="text"
              className="form-input font-tabular budget-month-input"
              value={`${monthLabel} (${currentMonth})`}
              readOnly
              disabled
            />
          </div>

          {/* Budget Amount Input */}
          <div className="form-group">
            <label className="form-label" htmlFor="budget-amount-input">
              Monthly Budget Limit (₹) <span className="req">*</span>
            </label>
            <div className="amount-input-wrapper">
              <span className="currency-prefix" aria-hidden="true">
                ₹
              </span>
              <input
                id="budget-amount-input"
                ref={amountInputRef}
                type="text"
                inputMode="decimal"
                className="form-input amount-input font-tabular"
                placeholder="e.g. 10000 or 10,000.00"
                value={amountStr}
                onChange={(e) => {
                  setAmountStr(e.target.value);
                  if (error) setError(null);
                }}
                disabled={loading}
                required
                autoComplete="off"
              />
            </div>
            <div className="amount-helper-hint">
              {parsedPreview !== null ? (
                <span className="amount-preview font-tabular">
                  Equivalent to: <strong>{formatCents(parsedPreview)}</strong>
                </span>
              ) : (
                <span>
                  Enter maximum monthly spending in INR. Saved in integer paise.
                </span>
              )}
            </div>
          </div>

          {/* Form Actions or Destructive Confirmation */}
          {showConfirmDelete ? (
            <div className="budget-delete-confirm-box" role="alert">
              <div className="budget-delete-confirm-text">
                <AlertTriangle size={16} className="budget-delete-icon" />
                <span>
                  Remove monthly spending limit for <strong>{monthLabel}</strong>? Your recorded expenses will not be deleted.
                </span>
              </div>
              <div className="budget-delete-confirm-actions">
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setShowConfirmDelete(false)}
                  disabled={loading}
                >
                  Keep Budget
                </button>
                <button
                  type="button"
                  className="btn-modal-confirm-remove"
                  onClick={handleConfirmDelete}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 size={14} className="spinner" />
                      <span>Removing...</span>
                    </>
                  ) : (
                    <span>Confirm Remove</span>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="modal-actions">
              {isEditing && onDelete && (
                <button
                  type="button"
                  className="btn-modal-remove"
                  onClick={() => setShowConfirmDelete(true)}
                  disabled={loading}
                >
                  <Trash2 size={13} aria-hidden="true" />
                  <span>Remove Budget</span>
                </button>
              )}
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-modal-save"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 size={15} className="spinner" />
                    <span>Saving Budget...</span>
                  </>
                ) : (
                  <span>{isEditing ? "Update Budget" : "Save Budget"}</span>
                )}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
