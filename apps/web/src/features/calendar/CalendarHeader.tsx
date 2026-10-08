import React from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { CalendarView } from "./calendar.types";

interface CalendarHeaderProps {
  label: string;
  activeView: CalendarView;
  onViewChange: (view: CalendarView) => void;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  onNavigateToday: () => void;
  onCreateEvent: () => void;
}

export const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  label,
  activeView,
  onViewChange,
  onNavigatePrev,
  onNavigateNext,
  onNavigateToday,
  onCreateEvent,
}) => {
  return (
    <header className="calendar-header" aria-label="Calendar Navigation and Controls">
      <div className="calendar-header-left">
        <div className="calendar-title-wrap">
          <h1 className="calendar-page-title">Calendar</h1>
          <span className="calendar-period-label" aria-live="polite">
            {label}
          </span>
        </div>

        <div className="calendar-nav-group" role="group" aria-label="Date navigation">
          <button
            type="button"
            className="btn-calendar-nav btn-calendar-today"
            onClick={onNavigateToday}
            aria-label="Navigate to current date"
          >
            Today
          </button>
          <button
            type="button"
            className="btn-calendar-nav"
            onClick={onNavigatePrev}
            aria-label="Previous period"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn-calendar-nav"
            onClick={onNavigateNext}
            aria-label="Next period"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="calendar-header-right">
        <div className="calendar-view-switcher" role="tablist" aria-label="Calendar views">
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "month"}
            className={`btn-view-toggle ${activeView === "month" ? "active" : ""}`}
            onClick={() => onViewChange("month")}
          >
            Month
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "week"}
            className={`btn-view-toggle ${activeView === "week" ? "active" : ""}`}
            onClick={() => onViewChange("week")}
          >
            Week
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "day"}
            className={`btn-view-toggle ${activeView === "day" ? "active" : ""}`}
            onClick={() => onViewChange("day")}
          >
            Day
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "agenda"}
            className={`btn-view-toggle ${activeView === "agenda" ? "active" : ""}`}
            onClick={() => onViewChange("agenda")}
          >
            Agenda
          </button>
        </div>

        <button
          type="button"
          className="btn-create-event"
          onClick={onCreateEvent}
          aria-label="Create new calendar event"
        >
          <Plus size={16} aria-hidden="true" />
          <span>New Event</span>
        </button>
      </div>
    </header>
  );
};
