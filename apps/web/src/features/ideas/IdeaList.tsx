import React from "react";
import { AlertCircle, Lightbulb, RefreshCw, Sparkles } from "lucide-react";
import { type Idea, type IdeaStatus } from "../../api/ideas";
import { IdeaCard } from "./IdeaCard";

interface IdeaListProps {
  ideas: Idea[];
  status: IdeaStatus;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  onEdit: (idea: Idea) => void;
  onArchive?: (idea: Idea) => void;
  onRestore?: (idea: Idea) => void;
  onDelete: (idea: Idea) => void;
  pendingIdeaId?: string | null;
  onFocusCapture?: () => void;
}

export const IdeaList: React.FC<IdeaListProps> = ({
  ideas,
  status,
  loading,
  error,
  onRetry,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  pendingIdeaId,
  onFocusCapture,
}) => {
  if (loading) {
    return (
      <div className="idea-list-loading" aria-label="Loading ideas">
        <div className="idea-skeleton-card">
          <div className="skeleton-title" />
          <div className="skeleton-desc" />
          <div className="skeleton-meta" />
        </div>
        <div className="idea-skeleton-card">
          <div className="skeleton-title" />
          <div className="skeleton-meta" />
        </div>
        <div className="idea-skeleton-card">
          <div className="skeleton-title" />
          <div className="skeleton-desc short" />
          <div className="skeleton-meta" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="idea-list-error" role="alert">
        <AlertCircle size={22} className="error-icon" aria-hidden="true" />
        <div className="error-content">
          <h3 className="error-title">Unable to load your ideas</h3>
          <p className="error-message">{error}</p>
        </div>
        {onRetry && (
          <button
            type="button"
            className="btn-retry"
            onClick={onRetry}
            aria-label="Retry loading ideas"
          >
            <RefreshCw size={14} aria-hidden="true" />
            <span>Try again</span>
          </button>
        )}
      </div>
    );
  }

  if (ideas.length === 0) {
    if (status === "ACTIVE") {
      return (
        <div className="idea-empty-state active-empty">
          <div className="empty-state-icon" aria-hidden="true">
            <Lightbulb size={24} />
          </div>
          <h3 className="empty-state-title">No ideas yet.</h3>
          <p className="empty-state-subtitle">
            Capture a thought before it disappears.
          </p>
          {onFocusCapture && (
            <button
              type="button"
              className="btn-empty-focus"
              onClick={onFocusCapture}
            >
              <Sparkles size={14} aria-hidden="true" />
              <span>Capture a thought</span>
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="idea-empty-state archived-empty">
        <h3 className="empty-state-title">No archived ideas.</h3>
        <p className="empty-state-subtitle">
          Ideas you archive will be kept here for future reflection.
        </p>
      </div>
    );
  }

  return (
    <div className="idea-cards-list" role="feed" aria-label={`${status.toLowerCase()} ideas`}>
      {ideas.map((idea) => (
        <IdeaCard
          key={idea.id}
          idea={idea}
          onEdit={onEdit}
          onArchive={onArchive}
          onRestore={onRestore}
          onDelete={onDelete}
          isPending={pendingIdeaId === idea.id}
        />
      ))}
    </div>
  );
};
