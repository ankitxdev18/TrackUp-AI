import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Target, X } from "lucide-react";
import {
  createSavingsGoal,
  formatSavingsPaise,
  parseCurrencyInputToCents,
  SavingsApiError,
  type ActiveSavingsGoal,
} from "../../api/savings";

interface CreateSavingsGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoalCreated: (goal: ActiveSavingsGoal) => void;
  onConflict?: () => void;
}

export function CreateSavingsGoalModal({
  isOpen,
  onClose,
  onGoalCreated,
  onConflict,
}: CreateSavingsGoalModalProps) {
  const [name, setName] = useState("");
  const [targetAmountStr, setTargetAmountStr] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusedElementRef.current = document.activeElement as HTMLElement | null;
      setName("");
      setTargetAmountStr("");
      setError(null);
      setLoading(false);

      const timer = setTimeout(() => {
        nameInputRef.current?.focus();
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
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

  const parsedPreviewPaise = parseCurrencyInputToCents(targetAmountStr);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // Prevent duplicate submissions

    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please enter a goal name.");
      nameInputRef.current?.focus();
      return;
    }

    if (trimmedName.length > 100) {
      setError("Goal name must not exceed 100 characters.");
      nameInputRef.current?.focus();
      return;
    }

    const targetAmountCents = parseCurrencyInputToCents(targetAmountStr);
    if (!targetAmountCents || targetAmountCents <= 0) {
      setError("Please enter a valid target amount greater than zero.");
      return;
    }

    try {
      setLoading(true);
      const newGoal = await createSavingsGoal({
        name: trimmedName,
        targetAmountCents,
      });
      onGoalCreated(newGoal);
      onClose();
    } catch (err: unknown) {
      if (err instanceof SavingsApiError) {
        if (err.statusCode === 409 || err.code === "ACTIVE_GOAL_EXISTS") {
          setError(
            "An active savings goal already exists. Complete or archive it before creating a new one."
          );
          onConflict?.();
          return;
        }
        setError(err.message);
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "An unexpected error occurred while creating the savings goal."
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
        className="modal-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-savings-goal-title"
        ref={modalRef}
      >
        <div className="modal-header">
          <div className="modal-title-wrap">
            <div className="modal-icon-badge" aria-hidden="true">
              <Target size={18} />
            </div>
            <div>
              <h2 id="create-savings-goal-title" className="modal-title">
                Create Savings Goal
              </h2>
              <p className="modal-subtitle">
                Set a dedicated target amount to start building your savings.
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

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            {error && (
              <div className="modal-error-banner" role="alert">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="savings-goal-name" className="form-label">
                Goal Name <span className="required-star">*</span>
              </label>
              <input
                id="savings-goal-name"
                ref={nameInputRef}
                type="text"
                className="form-input"
                placeholder="e.g. Emergency Fund, New Laptop, Vacation"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                disabled={loading}
                required
              />
              <span className="field-hint">
                Give your goal a clear, motivating name (max 100 characters).
              </span>
            </div>

            <div className="form-group">
              <label htmlFor="savings-target-amount" className="form-label">
                Target Amount (INR) <span className="required-star">*</span>
              </label>
              <div className="currency-input-wrap">
                <span className="currency-prefix" aria-hidden="true">
                  ₹
                </span>
                <input
                  id="savings-target-amount"
                  type="text"
                  inputMode="decimal"
                  className="form-input currency-input"
                  placeholder="e.g. 50,000 or 1,25,000.50"
                  value={targetAmountStr}
                  onChange={(e) => setTargetAmountStr(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              <div className="field-hint-row">
                <span className="field-hint">
                  Exact rupee amount. Converted directly to integer paise with zero floating-point drift.
                </span>
                {parsedPreviewPaise !== null && (
                  <span className="amount-preview-pill" aria-live="polite">
                    = {formatSavingsPaise(parsedPreviewPaise)}
                  </span>
                )}
              </div>
            </div>
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
              id="btn-create-savings-goal-submit"
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Creating Goal...</span>
                </>
              ) : (
                <span>Create Goal</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
