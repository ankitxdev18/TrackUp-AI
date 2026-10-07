import React from "react";
import { formatJournalDate, type JournalEntry } from "../../api/journal";

interface JournalTimelineItemProps {
  entry: JournalEntry;
  isSelected: boolean;
  onSelect: (entry: JournalEntry) => void;
  todayStr: string;
}

export const JournalTimelineItem: React.FC<JournalTimelineItemProps> = ({
  entry,
  isSelected,
  onSelect,
  todayStr,
}) => {
  const displayTitle = entry.title?.trim() || "Untitled Entry";
  const dateLabel = formatJournalDate(entry.entryDate, todayStr);
  const isToday = entry.entryDate === todayStr;

  // Generate plain text preview without excessive line breaks
  const previewSnippet = entry.content.replace(/\s+/g, " ").trim();

  return (
    <button
      type="button"
      className={`journal-timeline-item ${isSelected ? "is-selected" : ""} ${
        isToday ? "is-today" : ""
      }`}
      onClick={() => onSelect(entry)}
      aria-current={isSelected ? "true" : undefined}
      aria-label={`View entry for ${dateLabel}: ${displayTitle}`}
    >
      <div className="item-header-row">
        <span className={`item-date-badge ${isToday ? "today-badge" : ""}`}>
          {dateLabel}
        </span>
        <span className="item-calendar-date">{entry.entryDate}</span>
      </div>

      <h3 className="item-title" title={displayTitle}>
        {displayTitle}
      </h3>

      <p className="item-preview">
        {previewSnippet || "No additional text"}
      </p>
    </button>
  );
};
