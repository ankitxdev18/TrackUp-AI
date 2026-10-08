import React from "react";
import { Calendar, Clock, MapPin } from "lucide-react";
import type { CalendarEvent } from "../../api/calendar";
import {
  formatDateHeading,
  formatTimeDisplay,
  getTodayDateString,
  utcIsoToLocalDate,
} from "./calendarDateUtils";

interface AgendaViewProps {
  events: CalendarEvent[];
  timeZone: string;
  onSelectEvent: (event: CalendarEvent) => void;
  onCreateEvent: () => void;
}

export const AgendaView: React.FC<AgendaViewProps> = ({
  events,
  timeZone,
  onSelectEvent,
  onCreateEvent,
}) => {
  const todayStr = getTodayDateString(timeZone);

  // Group events chronologically by local date
  const groupedEvents = React.useMemo(() => {
    const map = new Map<string, { allDay: CalendarEvent[]; timed: CalendarEvent[] }>();

    for (const event of events) {
      if (event.isAllDay) {
        let cur = event.startDate;
        while (cur <= event.endDate) {
          if (!map.has(cur)) {
            map.set(cur, { allDay: [], timed: [] });
          }
          map.get(cur)?.allDay.push(event);

          const [y, m, d] = cur.split("-").map(Number);
          const nextDate = new Date(Date.UTC(y, m - 1, d + 1));
          cur = nextDate.toISOString().slice(0, 10);
        }
      } else if (event.startTime) {
        const localDate = utcIsoToLocalDate(event.startTime, timeZone);
        if (!map.has(localDate)) {
          map.set(localDate, { allDay: [], timed: [] });
        }
        map.get(localDate)?.timed.push(event);
      }
    }

    // Sort dates
    const sortedDates = Array.from(map.keys()).sort();

    return sortedDates.map((dateStr) => {
      const group = map.get(dateStr)!;
      // Sort timed events by start time
      group.timed.sort((a, b) => {
        return (a.startTime || "").localeCompare(b.startTime || "");
      });
      return {
        dateStr,
        allDay: group.allDay,
        timed: group.timed,
      };
    });
  }, [events, timeZone]);

  if (groupedEvents.length === 0) {
    return (
      <div className="calendar-state-container" role="region" aria-label="Agenda View">
        <Calendar size={36} className="calendar-state-icon" aria-hidden="true" />
        <h3 className="calendar-state-title">No events in this period</h3>
        <p className="calendar-state-desc">
          Your schedule is clear. Plan ahead by adding dedicated focus blocks or meetings.
        </p>
        <button
          type="button"
          className="btn-create-event"
          onClick={onCreateEvent}
          aria-label="Add event to agenda"
        >
          Add Event
        </button>
      </div>
    );
  }

  return (
    <div className="agenda-view-container" role="feed" aria-label="Chronological Agenda Feed">
      {groupedEvents.map(({ dateStr, allDay, timed }) => {
        const isToday = dateStr === todayStr;

        return (
          <article key={dateStr} className="agenda-day-group" aria-label={formatDateHeading(dateStr, timeZone)}>
            <div className="agenda-day-header">
              <h2 className="agenda-day-title">{formatDateHeading(dateStr, timeZone)}</h2>
              {isToday && <span className="agenda-today-badge">Today</span>}
            </div>

            <div className="agenda-events-list">
              {/* All-Day Events First */}
              {allDay.map((event) => (
                <div
                  key={`agenda-${dateStr}-${event.id}`}
                  role="button"
                  tabIndex={0}
                  className={`agenda-event-card event-color-${event.color}`}
                  onClick={() => onSelectEvent(event)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      onSelectEvent(event);
                    }
                  }}
                  aria-label={`All day event: ${event.title}`}
                >
                  <div className="agenda-card-left">
                    <span className="agenda-card-title">{event.title}</span>
                    <div className="agenda-card-meta">
                      <span className="agenda-card-time">All Day</span>
                      {event.location && (
                        <span className="agenda-card-location">
                          <MapPin size={12} aria-hidden="true" />
                          <span>{event.location}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Timed Events Chronologically */}
              {timed.map((event) => (
                <div
                  key={`agenda-${event.id}`}
                  role="button"
                  tabIndex={0}
                  className={`agenda-event-card event-color-${event.color}`}
                  onClick={() => onSelectEvent(event)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      onSelectEvent(event);
                    }
                  }}
                  aria-label={`${event.title}, at ${formatTimeDisplay(event.startTime!, timeZone)}`}
                >
                  <div className="agenda-card-left">
                    <span className="agenda-card-title">{event.title}</span>
                    <div className="agenda-card-meta">
                      <span className="agenda-card-time">
                        <Clock size={12} aria-hidden="true" style={{ display: "inline", marginRight: "3px" }} />
                        {formatTimeDisplay(event.startTime!, timeZone)}
                        {event.endTime && ` – ${formatTimeDisplay(event.endTime, timeZone)}`}
                      </span>
                      {event.location && (
                        <span className="agenda-card-location">
                          <MapPin size={12} aria-hidden="true" />
                          <span>{event.location}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
};
