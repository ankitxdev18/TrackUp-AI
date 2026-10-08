import React from "react";
import type { CalendarEvent } from "../../api/calendar";
import {
  calculateMonthDays,
  utcIsoToLocalDate,
  utcIsoToLocalTime,
} from "./calendarDateUtils";

interface MonthViewProps {
  anchorDate: string;
  timeZone: string;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  onCreateOnDate: (dateStr: string) => void;
  onOpenDayView: (dateStr: string) => void;
}

export const MonthView: React.FC<MonthViewProps> = ({
  anchorDate,
  timeZone,
  events,
  onSelectEvent,
  onCreateOnDate,
  onOpenDayView,
}) => {
  const cells = calculateMonthDays(anchorDate, timeZone);
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Group events by calendar date
  const eventsByDate = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();

    for (const event of events) {
      if (event.isAllDay) {
        // Multi-day inclusive range
        let cur = event.startDate;
        while (cur <= event.endDate) {
          const list = map.get(cur) || [];
          list.push(event);
          map.set(cur, list);
          // Advance 1 day in calendar date
          const [y, m, d] = cur.split("-").map(Number);
          const nextDate = new Date(Date.UTC(y, m - 1, d + 1));
          cur = nextDate.toISOString().slice(0, 10);
        }
      } else {
        const localDate = utcIsoToLocalDate(event.startTime, timeZone);
        const list = map.get(localDate) || [];
        list.push(event);
        map.set(localDate, list);
      }
    }

    return map;
  }, [events, timeZone]);

  return (
    <div className="month-view-grid" role="grid" aria-label="Month Calendar Grid">
      <div className="month-weekday-header-row" role="row">
        {weekdays.map((day) => (
          <div key={day} className="month-weekday-cell" role="columnheader">
            {day}
          </div>
        ))}
      </div>

      <div className="month-days-grid">
        {cells.map((cell) => {
          const dayEvents = eventsByDate.get(cell.dateStr) || [];
          const visibleEvents = dayEvents.slice(0, 3);
          const overflowCount = dayEvents.length - 3;

          return (
            <div
              key={cell.dateStr}
              role="gridcell"
              tabIndex={0}
              aria-label={`${cell.dateStr}, ${dayEvents.length} events`}
              className={`month-day-cell ${!cell.isCurrentMonth ? "outside-month" : ""} ${
                cell.isToday ? "is-today" : ""
              }`}
              onClick={(e) => {
                if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("month-day-cell-top")) {
                  onCreateOnDate(cell.dateStr);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenDayView(cell.dateStr);
                }
              }}
            >
              <div className="month-day-cell-top">
                <span
                  className="month-day-number"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDayView(cell.dateStr);
                  }}
                  title="View this day"
                >
                  {cell.dayNumber}
                </span>
              </div>

              <div className="month-events-list">
                {visibleEvents.map((event) => (
                  <div
                    key={`${cell.dateStr}-${event.id}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Event: ${event.title}`}
                    className={`month-event-chip event-color-${event.color} ${
                      event.isAllDay ? "is-allday" : ""
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEvent(event);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        e.preventDefault();
                        onSelectEvent(event);
                      }
                    }}
                  >
                    {!event.isAllDay && (
                      <span className="month-event-time">
                        {utcIsoToLocalTime(event.startTime, timeZone)}
                      </span>
                    )}
                    <span className="month-event-title">{event.title}</span>
                  </div>
                ))}

                {overflowCount > 0 && (
                  <div
                    role="button"
                    tabIndex={0}
                    className="month-more-badge"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDayView(cell.dateStr);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        onOpenDayView(cell.dateStr);
                      }
                    }}
                  >
                    +{overflowCount} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
