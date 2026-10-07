import { useState, useEffect, useCallback, useMemo } from "react";
import { AlertCircle, BookOpen, PenLine } from "lucide-react";
import {
  fetchJournalEntryByDate,
  getLocalTodayDateString,
  type JournalEntry,
} from "../../api/journal";
import { Link, useRouter } from "../../router/Router";

export function TodayJournalWidget() {
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { navigate } = useRouter();

  // Strictly user's local calendar date YYYY-MM-DD
  const todayStr = useMemo(() => getLocalTodayDateString(), []);

  const loadJournalData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Single focused request for today's entry
      const todayEntry = await fetchJournalEntryByDate(todayStr);
      setEntry(todayEntry);
    } catch {
      // Safe, human-readable isolated failure without exposing raw errors
      setError("Journal unavailable");
    } finally {
      setLoading(false);
    }
  }, [todayStr]);

  useEffect(() => {
    loadJournalData();
  }, [loadJournalData]);

  // Plain-text preview generation: strip excessive whitespace and truncate to max 90 characters
  const previewSnippet = useMemo(() => {
    if (!entry?.content) return "";
    const clean = entry.content.replace(/\s+/g, " ").trim();
    return clean.length > 90 ? `${clean.slice(0, 90)}…` : clean;
  }, [entry]);

  return (
    <section className="dashboard-panel" aria-labelledby="today-journal-heading">
      <div className="panel-title-bar">
        <h2 id="today-journal-heading" className="panel-heading">
          Today's Journal
        </h2>
        <Link to="/journal" className="panel-link-all" aria-label="View all journal entries">
          View all →
        </Link>
      </div>

      {loading ? (
        <div className="dash-skeleton-list" role="status" aria-label="Loading journal">
          <div className="dash-skeleton-row" />
        </div>
      ) : error ? (
        <div className="dash-error-box" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span className="dash-error-msg">{error}</span>
          <button
            type="button"
            className="btn-dash-retry"
            onClick={loadJournalData}
            aria-label="Retry loading journal"
          >
            Retry
          </button>
        </div>
      ) : entry ? (
        <div
          className="dash-journal-card"
          onClick={() => navigate("/journal")}
          role="link"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navigate("/journal");
            }
          }}
          aria-label={`Open today's journal entry: ${entry.title?.trim() || "Untitled entry"}`}
        >
          <div className="dash-journal-header">
            <span className="dash-journal-title">
              {entry.title?.trim() || "Untitled entry"}
            </span>
            <span className="dash-journal-status-pill">Written</span>
          </div>

          <p className="dash-journal-preview">
            {previewSnippet || "No preview text"}
          </p>

          <div className="dash-journal-footer">
            <Link
              to="/journal"
              className="dash-journal-action-link"
              onClick={(e) => e.stopPropagation()}
            >
              View journal
            </Link>
          </div>
        </div>
      ) : (
        <div className="dash-empty-compact dash-journal-empty">
          <div className="dash-journal-empty-content">
            <BookOpen size={16} className="dash-empty-icon" aria-hidden="true" />
            <p className="dash-empty-text">You haven't written anything today.</p>
          </div>
          <Link
            to="/journal"
            className="btn-dash-create-sm"
            aria-label="Write today's entry"
          >
            <PenLine size={12} aria-hidden="true" />
            <span>Write today's entry</span>
          </Link>
        </div>
      )}
    </section>
  );
}
