import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowUpRight, Loader2, X } from "lucide-react";
import {
  addSavingsContribution,
  formatSavingsPaise,
  parseCurrencyInputToCents,
  SavingsApiError,
  type AddContributionResponse,
} from "../../api/savings";

interface AddContributionModalProps {
  isOpen: boolean;
  goalId: string;
  goalName: string;
  remainingPaise: number | string;
  onClose: () => void;
  onContributionAdded: (res: AddContributionResponse) => void;
}

export function AddContributionModal({
  isOpen,
  goalId,
  goalName,
  remainingPaise,
  onClose,
  onContributionAdded,
}: AddContributionModalProps) {
  const [amountStr, setAmountStr] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusedElementRef.current = document.activeElement as HTMLElement | null;
      setAmountStr("");
      setNote("");
      setError(null);
      setLoading(false);

      const timer = setTimeout(() => {
        amountInputRef.current?.focus();
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

  const parsedPreviewPaise = parseCurrencyInputToCents(amountStr);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // Prevent duplicate submissions

    setError(null);

    const amountCents = parseCurrencyInputToCents(amountStr);
    if (!amountCents || amountCents <= 0) {
      setError("Please enter a valid deposit amount greater than zero.");
      amountInputRef.current?.focus();
      return;
    }

    const trimmedNote = note.trim();
    if (trimmedNote.length > 500) {
      setError("Note must not exceed 500 characters.");
      return;
    }

    try {
      setLoading(true);
      const res = await addSavingsContribution(goalId, {
        amountCents,
        note: trimmedNote || null,
      });
      onContributionAdded(res);
      onClose();
    } catch (err: unknown) {
      if (err instanceof SavingsApiError) {
        setError(err.message);
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "An unexpected error occurred while recording the deposit."
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
        aria-labelledby="add-contribution-title"
        ref={modalRef}
      >
        <div className="modal-header">
          <div className="modal-title-wrap">
            <div className="modal-icon-badge" aria-hidden="true">
              <ArrowUpRight size={18} />
            </div>
            <div>
              <h2 id="add-contribution-title" className="modal-title">
                Add Savings Deposit
              </h2>
              <p className="modal-subtitle">
                Record an immutable deposit towards <strong>{goalName}</strong>.
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

            <div className="remaining-context-banner">
              <span>Remaining to reach target:</span>
              <strong>{formatSavingsPaise(remainingPaise)}</strong>
            </div>

            <div className="form-group">
              <label htmlFor="contribution-amount" className="form-label">
                Deposit Amount (INR) <span className="required-star">*</span>
              </label>
              <div className="currency-input-wrap">
                <span className="currency-prefix" aria-hidden="true">
                  ₹
                </span>
                <input
                  id="contribution-amount"
                  ref={amountInputRef}
                  type="text"
                  inputMode="decimal"
                  className="form-input currency-input"
                  placeholder="e.g. 2,000 or 500.50"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              <div className="field-hint-row">
                <span className="field-hint">
                  Enter deposit in whole rupees or up to 2 decimal places.
                </span>
                {parsedPreviewPaise !== null && (
                  <span className="amount-preview-pill" aria-live="polite">
                    = {formatSavingsPaise(parsedPreviewPaise)}
                  </span>
                )}
              </div>
            </div>

            <div className="form-group">
              <div className="label-with-meta">
                <label htmlFor="contribution-note" className="form-label">
                  Note <span className="optional-tag">(Optional)</span>
                </label>
                <span className="char-count" aria-live="polite">
                  {note.length}/500
                </span>
              </div>
              <textarea
                id="contribution-note"
                className="form-textarea"
                placeholder="e.g. Monthly salary transfer, freelance bonus, birthday gift..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={3}
                disabled={loading}
              />
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
              id="btn-add-contribution-submit"
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Recording Deposit...</span>
                </>
              ) : (
                <span>Add Deposit</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
