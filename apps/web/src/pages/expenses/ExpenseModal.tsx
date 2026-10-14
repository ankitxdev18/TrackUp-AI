import { AlertCircle, Check, Loader2, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import {
  CANONICAL_CATEGORIES,
  getCategoryMeta,
  parseCurrencyInputToCents,
  type CanonicalCategory,
  type Expense,
} from "../../api/expenses";

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    amountCents: number;
    date: string;
    categoryId: string;
    description: string | null;
  }) => Promise<void>;
  initialExpense?: Expense | null;
}

export function ExpenseModal({
  isOpen,
  onClose,
  onSubmit,
  initialExpense,
}: ExpenseModalProps) {
  const isEditing = Boolean(initialExpense);

  const [amountStr, setAmountStr] = useState("");
  const [date, setDate] = useState("");
  const [categoryId, setCategoryId] = useState<CanonicalCategory>("food");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);

  const getTodayDateString = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  useEffect(() => {
    if (isOpen) {
      previousFocusedElementRef.current = document.activeElement as HTMLElement | null;

      if (initialExpense) {
        setAmountStr((initialExpense.amountCents / 100).toFixed(2));
        setDate(initialExpense.date);
        setCategoryId(initialExpense.categoryId as CanonicalCategory);
        setDescription(initialExpense.description || "");
      } else {
        setAmountStr("");
        setDate(getTodayDateString());
        setCategoryId("food");
        setDescription("");
      }
      setError(null);
      setLoading(false);

      setTimeout(() => {
        amountInputRef.current?.focus();
      }, 50);
    } else if (previousFocusedElementRef.current) {
      previousFocusedElementRef.current.focus?.();
    }
  }, [isOpen, initialExpense]);

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

  const handleCategoryKeyDown = (
    e: React.KeyboardEvent,
    currentKey: CanonicalCategory
  ) => {
    const currentIndex = CANONICAL_CATEGORIES.indexOf(currentKey);
    let nextIndex = currentIndex;

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % CANONICAL_CATEGORIES.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      nextIndex =
        (currentIndex - 1 + CANONICAL_CATEGORIES.length) %
        CANONICAL_CATEGORIES.length;
    }

    if (nextIndex !== currentIndex) {
      const nextCategory = CANONICAL_CATEGORIES[nextIndex]!;
      setCategoryId(nextCategory);
      // Focus target element
      const targetBtn = modalRef.current?.querySelector<HTMLButtonElement>(
        `button[data-category="${nextCategory}"]`
      );
      targetBtn?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cents = parseCurrencyInputToCents(amountStr);
    if (!cents || cents <= 0) {
      setError("Please enter a valid amount greater than zero.");
      amountInputRef.current?.focus();
      return;
    }

    if (!date) {
      setError("Please select a transaction date.");
      return;
    }

    try {
      setLoading(true);
      await onSubmit({
        amountCents: cents,
        date,
        categoryId,
        description: description.trim() || null,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save expense.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="expense-modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={modalRef}
        className="expense-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="expense-modal-header">
          <h2 id="modal-title" className="expense-modal-title">
            {isEditing ? "Edit Expense" : "Log Expense"}
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

        <form onSubmit={handleSubmit} className="expense-modal-form">
          {error && (
            <div className="modal-error-banner" role="alert" aria-live="assertive">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          {/* Amount Hero Input */}
          <div className="form-group amount-group">
            <label htmlFor="amount-input" className="form-label">
              Amount (₹)
            </label>
            <div className="amount-input-wrap">
              <span className="currency-prefix" aria-hidden="true">₹</span>
              <input
                id="amount-input"
                ref={amountInputRef}
                type="text"
                inputMode="decimal"
                className="amount-input font-tabular"
                placeholder="0.00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <span className="amount-helper-hint">
              Enter amount in rupees and paise (e.g. 150.50). Stored with zero rounding drift.
            </span>
          </div>

          {/* Category Selector Grid */}
          <div className="form-group category-group">
            <span className="form-label">Category</span>
            <div className="category-select-grid" role="radiogroup" aria-label="Select category">
              {CANONICAL_CATEGORIES.map((catKey) => {
                const meta = getCategoryMeta(catKey);
                const Icon = meta.icon;
                const isSelected = categoryId === catKey;

                return (
                  <button
                    key={catKey}
                    type="button"
                    data-category={catKey}
                    tabIndex={isSelected ? 0 : -1}
                    className={`category-tile ${isSelected ? "is-selected" : ""}`}
                    onClick={() => setCategoryId(catKey)}
                    onKeyDown={(e) => handleCategoryKeyDown(e, catKey)}
                    role="radio"
                    aria-checked={isSelected}
                    disabled={loading}
                  >
                    <div
                      className="category-tile-icon"
                      style={{
                        backgroundColor: meta.bgColor,
                        color: meta.color,
                      }}
                      aria-hidden="true"
                    >
                      <Icon size={16} />
                    </div>
                    <span className="category-tile-name">{meta.name}</span>
                    {isSelected && (
                      <div className="category-tile-check" aria-hidden="true">
                        <Check size={12} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Transaction Date */}
          <div className="form-group date-group">
            <label htmlFor="date-input" className="form-label">
              Transaction Date
            </label>
            <input
              id="date-input"
              type="date"
              className="date-input font-tabular"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          {/* Optional Description */}
          <div className="form-group desc-group">
            <div className="label-with-counter">
              <label htmlFor="description-input" className="form-label">
                Description (Optional)
              </label>
              <span className="char-counter font-tabular">{description.length}/500</span>
            </div>
            <input
              id="description-input"
              type="text"
              className="desc-input"
              placeholder="What was this for? (e.g. Weekly grocery haul)"
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Form Actions */}
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
              type="submit"
              className="btn-modal-save"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="spinner" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{isEditing ? "Update Expense" : "Save Expense"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
