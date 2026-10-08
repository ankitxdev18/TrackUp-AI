import React, { useEffect, useRef, useState } from "react";
import type { CalendarEvent } from "../../api/calendar";
import {
  calculateWeekDays,
  formatTimeDisplay,
  getTodayDateString,
  utcIsoToLocalDate,
} from "./calendarDateUtils";
import { calculateTimedEventPositions } from "./calendarOverlap";

interface WeekViewProps {
  anchorDate: string;
  timeZone: string;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  onCreateSlot: (dateStr: string, timeStr: string) => void;
  onOpenDayView: (dateStr: string) => void;
}

export const WeekView: React.FC<WeekViewProps> = ({
  anchorDate,
  timeZone,
  events,
  onSelectEvent,
  onCreateSlot,
  onOpenDayView,
}) => {
  const weekDays = calculateWeekDays(anchorDate, timeZone);
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayStr = getTodayDateString(timeZone);

  // Current time minute tracker
  const [currentMinutes, setCurrentMinutes] = useState<number>(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentMinutes(now.getHours() * 60 + now.getMinutes());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Initial scroll to 08:00 (480px)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 480;
    }
  }, []);

  // Separate all-day events vs timed events per day
  const allDayEventsByDay = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const day of weekDays) {
      map.set(day.dateStr, []);
    }

    for (const event of events) {
      if (event.isAllDay) {
        for (const day of weekDays) {
          if (day.dateStr >= event.startDate && day.dateStr <= event.endDate) {
            map.get(day.dateStr)?.push(event);
          }
        }
      }
    }
    return map;
  }, [events, weekDays]);

  const timedEventsByDay = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const day of weekDays) {
      map.set(day.dateStr, []);
    }

    for (const event of events) {
      if (!event.isAllDay && event.startTime) {
        const localDate = utcIsoToLocalDate(event.startTime, timeZone);
        if (map.has(localDate)) {
          map.get(localDate)?.push(event);
        }
      }
    }
    return map;
  }, [events, weekDays, timeZone]);

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="timegrid-container" role="region" aria-label="Week Calendar View">
      {/* Week Day Headers */}
      <div className="timegrid-header-row">
        <div className="timegrid-gutter-header" aria-hidden="true" />
        <div className="timegrid-day-headers">
          {weekDays.map((day) => (
            <div
              key={day.dateStr}
              className={`timegrid-day-header-cell ${day.isToday ? "is-today" : ""}`}
              onClick={() => onOpenDayView(day.dateStr)}
              role="button"
              tabIndex={0}
              aria-label={`${day.dayName} ${day.dayNumber}, View Day`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  onOpenDayView(day.dateStr);
                }
              }}
            >
              <div className="timegrid-day-name">{day.dayName}</div>
              <div className="timegrid-day-number">{day.dayNumber}</div>
            </div>
          ))}
        </div>
      </div>

      {/* All-Day Events Strip */}
      <div className="timegrid-allday-row">
        <div className="timegrid-allday-label">all-day</div>
        <div className="timegrid-allday-columns">
          {weekDays.map((day) => {
            const dayAllDay = allDayEventsByDay.get(day.dateStr) || [];
            return (
              <div key={day.dateStr} className="timegrid-allday-cell">
                {dayAllDay.map((event) => (
                  <div
                    key={`allday-${day.dateStr}-${event.id}`}
                    role="button"
                    tabIndex={0}
                    className={`allday-event-chip event-color-${event.color}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEvent(event);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        onSelectEvent(event);
                      }
                    }}
                    aria-label={`All-day event: ${event.title}`}
                  >
                    {event.title}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* 24-Hour Scrollable Timeline Grid */}
      <div className="timegrid-scroll-area" ref={scrollRef}>
        {/* Time Axis */}
        <div className="timegrid-time-axis" aria-hidden="true">
          {hours.map((hour) => {
            const formatted = hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`;
            return (
              <div key={hour} className="timegrid-hour-label">
                {formatted}
              </div>
            );
          })}
        </div>

        {/* 7 Columns for Days */}
        <div className="timegrid-columns-container">
          {weekDays.map((day) => {
            const dayTimedEvents = timedEventsByDay.get(day.dateStr) || [];
            const positionedEvents = calculateTimedEventPositions(dayTimedEvents, timeZone);
            const isToday = day.dateStr === todayStr;

            return (
              <div
                key={day.dateStr}
                className="timegrid-day-column"
                data-testid={`week-column-${day.dateStr}`}
              >
                {/* Hourly Gridlines */}
                <div className="timegrid-hour-gridlines" aria-hidden="true">
                  {hours.map((hour) => (
                    <div key={hour} className="timegrid-hour-line" />
                  ))}
                </div>

                {/* Clickable 30-min capture slots */}
                <div className="timegrid-clickable-slots">
                  {Array.from({ length: 48 }, (_, i) => {
                    const h = Math.floor(i / 2);
                    const m = (i % 2) * 30;
                    const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

                    return (
                      <div
                        key={i}
                        className="timegrid-slot"
                        onClick={() => onCreateSlot(day.dateStr, timeStr)}
                        title={`Create event at ${timeStr}`}
                        aria-label={`Create event on ${day.dateStr} at ${timeStr}`}
                      />
                    );
                  })}
                </div>

                {/* Current Time Indicator */}
                {isToday && (
                  <div
                    className="current-time-indicator"
                    style={{ top: `${currentMinutes}px` }}
                    aria-label="Current Time Indicator"
                  >
                    <div className="current-time-dot" />
                  </div>
                )}

                {/* Positioned Timed Events */}
                {positionedEvents.map((pos) => (
                  <div
                    key={pos.event.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${pos.event.title}, ${formatTimeDisplay(pos.event.startTime!, timeZone)}`}
                    className={`timed-event-block event-color-${pos.event.color}`}
                    style={{
                      top: `${pos.topMinutes}px`,
                      height: `${pos.durationMinutes}px`,
                      left: `${pos.leftPercent}%`,
                      width: `calc(${pos.widthPercent}% - 3px)`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEvent(pos.event);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        onSelectEvent(pos.event);
                      }
                    }}
                  >
                    <div className="timed-event-title">{pos.event.title}</div>
                    <div className="timed-event-time">
                      {formatTimeDisplay(pos.event.startTime!, timeZone)}
                    </div>
                    {pos.event.location && (
                      <div className="timed-event-location">{pos.event.location}</div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
