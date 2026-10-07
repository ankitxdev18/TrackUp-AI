import React from "react";
import { PenLine, Sparkles } from "lucide-react";
import { type JournalEntry } from "../../api/journal";
import { JournalTimelineItem } from "./JournalTimelineItem";

interface JournalTimelineProps {
  entries: JournalEntry[];
  selectedEntryId: string | null;
  onSelectEntry: (entry: JournalEntry) => void;
  onNewEntry: () => void;
  todayStr: string;
  hasTodayEntry: boolean;
}

export const JournalTimeline: React.FC<JournalTimelineProps> = ({
  entries,
  selectedEntryId,
  onSelectEntry,
  onNewEntry,
  todayStr,
  hasTodayEntry,
}) => {
  return (
    <aside className="journal-timeline-sidebar" aria-label="Journal Entry Timeline">
      <div className="timeline-header">
        <div className="timeline-title-wrap">
          <h2 className="timeline-heading">Timeline</h2>
          <span className="timeline-counter">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </span>
        </div>
      </div>

      {/* Subtle reminder if today's entry is missing */}
      {!hasTodayEntry && entries.length > 0 && (
        <div className="timeline-today-reminder" role="region" aria-label="Today prompt">
          <div className="today-reminder-content">
            <Sparkles size={14} className="reminder-icon" aria-hidden="true" />
            <div className="reminder-text">
              <span className="reminder-title">Today</span>
              <span className="reminder-sub">Nothing written yet</span>
            </div>
          </div>
          <button
            type="button"
            className="btn-reminder-write"
            onClick={onNewEntry}
            aria-label="Write today from timeline"
          >
            <PenLine size={12} aria-hidden="true" />
            <span>Write</span>
          </button>
        </div>
      )}

      {/* Timeline entries list */}
      <div className="timeline-list" role="feed" aria-label="Journal entries list">
        {entries.length === 0 ? (
          <div className="timeline-empty-hint">
            <p>No entries recorded yet.</p>
          </div>
        ) : (
          entries.map((entry) => (
            <JournalTimelineItem
              key={entry.id}
              entry={entry}
              isSelected={entry.id === selectedEntryId}
              onSelect={onSelectEntry}
              todayStr={todayStr}
            />
          ))
        )}
      </div>
    </aside>
  );
};
