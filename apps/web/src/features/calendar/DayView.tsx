import React, { useEffect, useRef, useState } from "react";
import type { CalendarEvent } from "../../api/calendar";
import {
  formatDateHeading,
  formatTimeDisplay,
  getTodayDateString,
  utcIsoToLocalDate,
} from "./calendarDateUtils";
import { calculateTimedEventPositions } from "./calendarOverlap";

interface DayViewProps {
  anchorDate: string;
  timeZone: string;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  onCreateSlot: (dateStr: string, timeStr: string) => void;
}

export const DayView: React.FC<DayViewProps> = ({
  anchorDate,
  timeZone,
  events,
  onSelectEvent,
  onCreateSlot,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayStr = getTodayDateString(timeZone);
  const isToday = anchorDate === todayStr;

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

  // Scroll to 08:00 (480px) on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 480;
    }
  }, [anchorDate]);

  // Filter events for this single day
  const allDayEvents = events.filter((e) => {
    return e.isAllDay && anchorDate >= e.startDate && anchorDate <= e.endDate;
  });

  const timedEvents = events.filter((e) => {
    if (e.isAllDay || !e.startTime) return false;
    const localDate = utcIsoToLocalDate(e.startTime, timeZone);
    return localDate === anchorDate;
  });

  const positionedEvents = calculateTimedEventPositions(timedEvents, timeZone);
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="timegrid-container" role="region" aria-label="Day Schedule View">
      {/* Day Title Header */}
      <div className="timegrid-header-row">
        <div className="timegrid-gutter-header" aria-hidden="true" />
        <div className="timegrid-day-headers" style={{ padding: "8px 16px" }}>
          <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary, #f4f4f5)" }}>
            {formatDateHeading(anchorDate, timeZone)}
            {isToday && (
              <span className="agenda-today-badge" style={{ marginLeft: "8px" }}>
                Today
              </span>
            )}
          </div>
        </div>
      </div>

      {/* All-Day Region */}
      {allDayEvents.length > 0 && (
        <div className="timegrid-allday-row">
          <div className="timegrid-allday-label">all-day</div>
          <div className="timegrid-allday-columns" style={{ padding: "4px 8px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {allDayEvents.map((event) => (
                <div
                  key={`day-allday-${event.id}`}
                  role="button"
                  tabIndex={0}
                  className={`allday-event-chip event-color-${event.color}`}
                  onClick={() => onSelectEvent(event)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      onSelectEvent(event);
                    }
                  }}
                  aria-label={`All-day: ${event.title}`}
                >
                  {event.title}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 24-Hour Timeline */}
      <div className="timegrid-scroll-area" ref={scrollRef}>
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

        <div className="timegrid-columns-container">
          <div className="timegrid-day-column" style={{ width: "100%" }}>
            {/* Hour lines */}
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
                    onClick={() => onCreateSlot(anchorDate, timeStr)}
                    title={`Create event at ${timeStr}`}
                    aria-label={`Create event on ${anchorDate} at ${timeStr}`}
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

            {/* Positioned Events */}
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
                  width: `calc(${pos.widthPercent}% - 4px)`,
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
                <div className="timed-event-title" style={{ fontSize: "0.85rem" }}>
                  {pos.event.title}
                </div>
                <div className="timed-event-time">
                  {formatTimeDisplay(pos.event.startTime!, timeZone)}
                </div>
                {pos.event.location && (
                  <div className="timed-event-location">{pos.event.location}</div>
                )}
                {pos.event.description && (
                  <div style={{ fontSize: "0.68rem", opacity: 0.7, marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {pos.event.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
