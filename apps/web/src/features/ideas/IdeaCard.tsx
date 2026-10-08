import React from "react";
import { Archive, Edit3, RotateCcw, Trash2 } from "lucide-react";
import { formatIdeaDate, type Idea } from "../../api/ideas";

interface IdeaCardProps {
  idea: Idea;
  onEdit: (idea: Idea) => void;
  onArchive?: (idea: Idea) => void;
  onRestore?: (idea: Idea) => void;
  onDelete: (idea: Idea) => void;
  isPending?: boolean;
}

export const IdeaCard: React.FC<IdeaCardProps> = ({
  idea,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  isPending = false,
}) => {
  const isArchived = idea.status === "ARCHIVED";
  const formattedDate = formatIdeaDate(idea.createdAt);

  return (
    <article className={`idea-card ${isArchived ? "archived" : ""}`} aria-label={idea.title}>
      <div className="idea-card-main">
        <h3 className="idea-card-title">{idea.title}</h3>

        {idea.description && idea.description.trim() ? (
          <p className="idea-card-description">{idea.description}</p>
        ) : null}

        <div className="idea-card-meta">
          <time className="idea-card-date" dateTime={idea.createdAt}>
            {formattedDate}
          </time>
        </div>
      </div>

      <div className="idea-card-actions" role="group" aria-label="Idea actions">
        <button
          type="button"
          className="btn-card-action btn-card-edit"
          onClick={() => onEdit(idea)}
          disabled={isPending}
          aria-label={`Edit ${idea.title}`}
          title="Edit idea"
        >
          <Edit3 size={14} aria-hidden="true" />
          <span>Edit</span>
        </button>

        {!isArchived && onArchive ? (
          <button
            type="button"
            className="btn-card-action btn-card-archive"
            onClick={() => onArchive(idea)}
            disabled={isPending}
            aria-label={`Archive ${idea.title}`}
            title="Archive idea"
          >
            <Archive size={14} aria-hidden="true" />
            <span>Archive</span>
          </button>
        ) : null}

        {isArchived && onRestore ? (
          <button
            type="button"
            className="btn-card-action btn-card-restore"
            onClick={() => onRestore(idea)}
            disabled={isPending}
            aria-label={`Restore ${idea.title}`}
            title="Restore idea"
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>Restore</span>
          </button>
        ) : null}

        <button
          type="button"
          className="btn-card-action btn-card-delete"
          onClick={() => onDelete(idea)}
          disabled={isPending}
          aria-label={`Delete ${idea.title}`}
          title="Delete idea"
        >
          <Trash2 size={14} aria-hidden="true" />
          <span>Delete</span>
        </button>
      </div>
    </article>
  );
};
