import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AlertCircle, Calendar as CalendarIcon, Clock, MapPin } from "lucide-react";
import { listCalendarEvents, type CalendarEvent } from "../../api/calendar";
import {
  formatTimeDisplay,
  getTemporalBoundsForView,
  getTodayDateString,
  getUserTimeZone,
} from "../../features/calendar/calendarDateUtils";
import { Link, useRouter } from "../../router/Router";

export function TodayScheduleWidget() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { navigate } = useRouter();
  const userTz = useMemo(() => getUserTimeZone(), []);

  // Strictly user's local calendar date YYYY-MM-DD
  const todayStr = useMemo(() => getTodayDateString(userTz), [userTz]);
  const activeRequestId = useRef(0);

  const loadScheduleData = useCallback(async () => {
    const reqId = ++activeRequestId.current;
    try {
      setLoading(true);
      setError(null);

      // Compute day bounds for today's local date
      const dayBounds = getTemporalBoundsForView("day", todayStr, userTz);

      // Request strictly today's temporal range
      const data = await listCalendarEvents(dayBounds.startIso, dayBounds.endIso, userTz);
      if (reqId === activeRequestId.current) {
        setEvents(data);
      }
    } catch {
      // Safe, isolated failure without bubbling up or crashing Dashboard
      if (reqId === activeRequestId.current) {
        setError("Unable to load schedule");
      }
    } finally {
      if (reqId === activeRequestId.current) {
        setLoading(false);
      }
    }
  }, [todayStr, userTz]);

  useEffect(() => {
    loadScheduleData();
  }, [loadScheduleData]);

  // Sort events: All-day events first, then timed events chronologically
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      // 1. All-day events appear first
      if (a.isAllDay && !b.isAllDay) return -1;
      if (!a.isAllDay && b.isAllDay) return 1;

      // 2. Both all-day: sort alphabetically by title, then id
      if (a.isAllDay && b.isAllDay) {
        const cmp = a.title.localeCompare(b.title);
        return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
      }

      // 3. Both timed: sort chronologically by startTime, then endTime
      if (!a.isAllDay && !b.isAllDay) {
        const aStart = new Date(a.startTime).getTime();
        const bStart = new Date(b.startTime).getTime();
        if (aStart !== bStart) return aStart - bStart;

        const aEnd = new Date(a.endTime).getTime();
        const bEnd = new Date(b.endTime).getTime();
        if (aEnd !== bEnd) return aEnd - bEnd;

        return a.title.localeCompare(b.title);
      }

      return 0;
    });
  }, [events]);

  const MAX_DISPLAYED = 4;
  const displayedEvents = sortedEvents.slice(0, MAX_DISPLAYED);
  const remainingCount = Math.max(0, sortedEvents.length - MAX_DISPLAYED);

  return (
    <section className="dashboard-panel" aria-labelledby="today-schedule-heading">
      <div className="panel-title-bar">
        <div className="panel-title-left">
          <h2 id="today-schedule-heading" className="panel-heading">
            Today's Schedule
          </h2>
          {!loading && !error && events.length > 0 && (
            <span
              className="panel-counter-badge"
              aria-label={`${events.length} event${events.length === 1 ? "" : "s"} scheduled today`}
            >
              {events.length}
            </span>
          )}
        </div>
        <Link to="/calendar" className="panel-link-all" aria-label="View calendar">
          View calendar →
        </Link>
      </div>

      {loading ? (
        <div className="dash-skeleton-list" role="status" aria-label="Loading schedule">
          <div className="dash-skeleton-row" />
          <div className="dash-skeleton-row" />
        </div>
      ) : error ? (
        <div className="dash-error-box" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span className="dash-error-msg">{error}</span>
          <button
            type="button"
            className="btn-dash-retry"
            onClick={loadScheduleData}
            aria-label="Retry loading schedule"
          >
            Retry
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="dash-empty-compact">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <CalendarIcon size={16} className="dash-empty-icon" aria-hidden="true" />
            <p className="dash-empty-text">No events scheduled today.</p>
          </div>
          <Link to="/calendar" className="btn-dash-create-sm" aria-label="View Calendar">
            <span>View Calendar</span>
          </Link>
        </div>
      ) : (
        <div className="dash-schedule-list" role="list" aria-label="Today's events list">
          {displayedEvents.map((evt) => {
            const timeLabel = evt.isAllDay
              ? "All Day"
              : `${formatTimeDisplay(evt.startTime, userTz)} – ${formatTimeDisplay(evt.endTime, userTz)}`;

            return (
              <div
                key={evt.id}
                className="dash-schedule-item"
                role="listitem"
                tabIndex={0}
                onClick={() => navigate("/calendar")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate("/calendar");
                  }
                }}
                aria-label={`${evt.title}, ${timeLabel}${evt.location ? `, at ${evt.location}` : ""}`}
              >
                <div className={`dash-schedule-bar color-${evt.color}`} aria-hidden="true" />
                <div className="dash-schedule-content">
                  <div className="dash-schedule-main-row">
                    <span className="dash-schedule-title" title={evt.title}>
                      {evt.title}
                    </span>
                    <span className={`dash-schedule-time-badge ${evt.isAllDay ? "all-day" : ""}`}>
                      {evt.isAllDay ? (
                        "All Day"
                      ) : (
                        <>
                          <Clock size={11} aria-hidden="true" style={{ display: "inline-block", marginRight: "3px" }} />
                          {timeLabel}
                        </>
                      )}
                    </span>
                  </div>

                  {evt.location && (
                    <div className="dash-schedule-meta">
                      <MapPin size={11} aria-hidden="true" />
                      <span className="dash-schedule-location" title={evt.location}>
                        {evt.location}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {remainingCount > 0 && (
            <div className="dash-schedule-overflow">
              <Link to="/calendar" className="dash-schedule-overflow-link">
                +{remainingCount} more event{remainingCount === 1 ? "" : "s"} in calendar →
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
