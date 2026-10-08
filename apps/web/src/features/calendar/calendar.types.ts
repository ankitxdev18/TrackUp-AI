import type { CalendarColor, CalendarEvent } from "../../api/calendar";

export type { CalendarColor, CalendarEvent };

export type CalendarView = "month" | "week" | "day" | "agenda";

export interface CalendarRange {
  startIso: string;
  endIso: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  label: string;
}

export interface DayCalendarCell {
  dateStr: string;   // YYYY-MM-DD
  dayNumber: number; // 1-31
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
}

export interface WeekDayHeader {
  dateStr: string;   // YYYY-MM-DD
  dayName: string;   // "Mon", "Tue", etc.
  dayNumber: number; // 1-31
  isToday: boolean;
}

export interface PositionedTimedEvent {
  event: CalendarEvent;
  topMinutes: number;      // 0 to 1440
  durationMinutes: number; // e.g. 60
  column: number;          // 0-indexed column within overlap cluster
  totalColumns: number;    // total columns in cluster
  leftPercent: number;     // e.g. 0%, 50%
  widthPercent: number;    // e.g. 100%, 50%
}

export interface EventFormState {
  title: string;
  description: string;
  location: string;
  color: CalendarColor;
  isAllDay: boolean;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  timeZone: string;  // IANA identifier
}
