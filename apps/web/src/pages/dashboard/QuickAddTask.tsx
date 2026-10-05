import React, { useState } from "react";
import { Plus, SlidersHorizontal, Loader2 } from "lucide-react";

interface QuickAddTaskProps {
  onQuickAdd: (title: string) => Promise<void>;
  onOpenDetailedModal: () => void;
  disabled?: boolean;
}

export function QuickAddTask({
  onQuickAdd,
  onOpenDetailedModal,
  disabled = false,
}: QuickAddTaskProps) {
  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || isSubmitting || disabled) return;

    try {
      setIsSubmitting(true);
      await onQuickAdd(trimmed);
      setTitle("");
    } catch {
      // Handled by parent or toast
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="quick-add-form" onSubmit={handleSubmit}>
      <div className="quick-add-input-wrap">
        <Plus size={14} className="quick-add-icon" aria-hidden="true" />
        <input
          type="text"
          className="quick-add-input"
          placeholder="Add a task for today... (Press Enter to save)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={disabled || isSubmitting}
          aria-label="Add a task for today"
        />
        {isSubmitting && <Loader2 size={14} className="spin-icon submit-spinner" />}
      </div>

      <div className="quick-add-actions">
        {title.trim().length > 0 && (
          <button
            type="submit"
            className="btn-quick-submit"
            disabled={disabled || isSubmitting}
          >
            Add
          </button>
        )}
        <button
          type="button"
          className="btn-quick-detailed"
          onClick={onOpenDetailedModal}
          title="Open detailed task form"
          aria-label="Open detailed task form"
        >
          <SlidersHorizontal size={13} />
          <span>Detailed</span>
        </button>
      </div>
    </form>
  );
}
