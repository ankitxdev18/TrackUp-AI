import React, { useEffect, useState } from "react";
import { AlertCircle, Loader2, Trash2, X } from "lucide-react";
import type { CalendarColor, CalendarEvent, CreateCalendarEventInput, UpdateCalendarEventInput } from "../../api/calendar";
import {
  getTodayDateString,
  localDateTimeToUtcIso,
  utcIsoToLocalDate,
  utcIsoToLocalTime,
} from "./calendarDateUtils";

interface EventModalProps {
  isOpen: boolean;
  eventToEdit: CalendarEvent | null;
  initialDate?: string;
  initialTime?: string;
  timeZone: string;
  onClose: () => void;
  onSave: (payload: CreateCalendarEventInput | UpdateCalendarEventInput) => Promise<void>;
  onRequestDelete?: (event: CalendarEvent) => void;
}

const COLOR_OPTIONS: { value: CalendarColor; label: string; className: string }[] = [
  { value: "indigo", label: "Indigo", className: "swatch-indigo" },
  { value: "emerald", label: "Emerald", className: "swatch-emerald" },
  { value: "amber", label: "Amber", className: "swatch-amber" },
  { value: "rose", label: "Rose", className: "swatch-rose" },
  { value: "cyan", label: "Cyan", className: "swatch-cyan" },
  { value: "slate", label: "Slate", className: "swatch-slate" },
];

export const EventModal: React.FC<EventModalProps> = ({
  isOpen,
  eventToEdit,
  initialDate,
  initialTime,
  timeZone,
  onClose,
  onSave,
  onRequestDelete,
}) => {
  const isEditing = Boolean(eventToEdit);
  const defaultDate = initialDate || getTodayDateString(timeZone);

  // Form Fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [color, setColor] = useState<CalendarColor>("indigo");
  const [isAllDay, setIsAllDay] = useState(false);

  // Timed fields
  const [eventDate, setEventDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState(initialTime || "09:00");
  const [endTime, setEndTime] = useState("10:00");

  // All-day fields
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Populate form on open or when eventToEdit changes
  useEffect(() => {
    if (!isOpen) return;

    if (eventToEdit) {
      setTitle(eventToEdit.title);
      setDescription(eventToEdit.description || "");
      setLocation(eventToEdit.location || "");
      setColor(eventToEdit.color);
      setIsAllDay(eventToEdit.isAllDay);

      if (eventToEdit.isAllDay) {
        setStartDate(eventToEdit.startDate);
        setEndDate(eventToEdit.endDate);
        setEventDate(eventToEdit.startDate);
        setStartTime("09:00");
        setEndTime("10:00");
      } else {
        const localDate = utcIsoToLocalDate(eventToEdit.startTime, timeZone);
        const sTime = utcIsoToLocalTime(eventToEdit.startTime, timeZone);
        const eTime = utcIsoToLocalTime(eventToEdit.endTime, timeZone);

        setEventDate(localDate);
        setStartTime(sTime);
        setEndTime(eTime);
        setStartDate(localDate);
        setEndDate(localDate);
      }
    } else {
      // Create mode
      setTitle("");
      setDescription("");
      setLocation("");
      setColor("indigo");
      setIsAllDay(false);

      const d = initialDate || getTodayDateString(timeZone);
      setEventDate(d);
      setStartDate(d);
      setEndDate(d);

      if (initialTime) {
        setStartTime(initialTime);
        const [h, m] = initialTime.split(":").map(Number);
        const endHour = (h + 1) % 24;
        setEndTime(`${String(endHour).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      } else {
        setStartTime("09:00");
        setEndTime("10:00");
      }
    }

    setValidationError(null);
  }, [isOpen, eventToEdit, initialDate, initialTime, timeZone]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  // Handle All-Day Toggle
  const handleToggleAllDay = (checked: boolean) => {
    setIsAllDay(checked);
    if (checked) {
      // Switching to all-day: use current eventDate
      setStartDate(eventDate);
      setEndDate(eventDate);
    } else {
      // Switching to timed: use current startDate
      setEventDate(startDate);
      if (!startTime || !endTime) {
        setStartTime("09:00");
        setEndTime("10:00");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setValidationError("Event title is required");
      return;
    }

    if (trimmedTitle.length > 255) {
      setValidationError("Title must not exceed 255 characters");
      return;
    }

    if (description.length > 5000) {
      setValidationError("Description must not exceed 5,000 characters");
      return;
    }

    if (location.length > 500) {
      setValidationError("Location must not exceed 500 characters");
      return;
    }

    try {
      setIsSubmitting(true);
      setValidationError(null);

      if (isAllDay) {
        if (!startDate || !endDate) {
          setValidationError("Start and end dates are required for all-day events");
          setIsSubmitting(false);
          return;
        }

        if (endDate < startDate) {
          setValidationError("End date cannot be earlier than start date");
          setIsSubmitting(false);
          return;
        }

        if (isEditing) {
          await onSave({
            title: trimmedTitle,
            description: description.trim() ? description : null,
            location: location.trim() ? location : null,
            color,
            isAllDay: true,
            startDate,
            endDate,
            startTime: null,
            endTime: null,
            timeZone: null,
          });
        } else {
          await onSave({
            title: trimmedTitle,
            description: description.trim() ? description : null,
            location: location.trim() ? location : null,
            color,
            isAllDay: true,
            startDate,
            endDate,
          });
        }
      } else {
        if (!eventDate || !startTime || !endTime) {
          setValidationError("Date, start time, and end time are required");
          setIsSubmitting(false);
          return;
        }

        const startIso = localDateTimeToUtcIso(eventDate, startTime, timeZone);
        const endIso = localDateTimeToUtcIso(eventDate, endTime, timeZone);

        const startMs = new Date(startIso).getTime();
        const endMs = new Date(endIso).getTime();

        if (endMs <= startMs) {
          setValidationError("End time must be strictly after start time");
          setIsSubmitting(false);
          return;
        }

        if (isEditing) {
          await onSave({
            title: trimmedTitle,
            description: description.trim() ? description : null,
            location: location.trim() ? location : null,
            color,
            isAllDay: false,
            startTime: startIso,
            endTime: endIso,
            timeZone,
            startDate: null,
            endDate: null,
          });
        } else {
          await onSave({
            title: trimmedTitle,
            description: description.trim() ? description : null,
            location: location.trim() ? location : null,
            color,
            isAllDay: false,
            startTime: startIso,
            endTime: endIso,
            timeZone,
          });
        }
      }

      onClose();
    } catch (err: unknown) {
      setValidationError(
        err instanceof Error ? err.message : "Failed to save event. Please check inputs."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="calendar-modal-backdrop"
      onClick={() => !isSubmitting && onClose()}
      role="presentation"
    >
      <div
        className="calendar-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-modal-title"
      >
        <div className="calendar-modal-header">
          <h2 id="event-modal-title" className="calendar-modal-title">
            {isEditing ? "Edit Event" : "New Event"}
          </h2>
          <button
            type="button"
            className="btn-calendar-nav"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="calendar-modal-body">
            {validationError && (
              <div className="calendar-error-banner" role="alert">
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <AlertCircle size={16} />
                  <span>{validationError}</span>
                </div>
              </div>
            )}

            {/* Title */}
            <div className="form-group">
              <label htmlFor="event-title" className="form-label">
                Event Title *
              </label>
              <input
                id="event-title"
                type="text"
                className="form-input"
                placeholder="Focus Session, Architecture Sync, Dentist..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={255}
                required
                autoFocus
                disabled={isSubmitting}
              />
            </div>

            {/* All Day Toggle */}
            <div className="form-toggle-row">
              <span className="form-toggle-label">All-day event</span>
              <label className="form-toggle-switch">
                <input
                  type="checkbox"
                  checked={isAllDay}
                  onChange={(e) => handleToggleAllDay(e.target.checked)}
                  disabled={isSubmitting}
                  aria-label="Toggle all-day event"
                />
                <span className="toggle-slider" />
              </label>
            </div>

            {/* Date & Time fields */}
            {isAllDay ? (
              <div className="form-dates-row">
                <div className="form-group">
                  <label htmlFor="all-day-start-date" className="form-label">
                    Start Date
                  </label>
                  <input
                    id="all-day-start-date"
                    type="date"
                    className="form-input"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (endDate < e.target.value) {
                        setEndDate(e.target.value);
                      }
                    }}
                    required
                    disabled={isSubmitting}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="all-day-end-date" className="form-label">
                    End Date (Inclusive)
                  </label>
                  <input
                    id="all-day-end-date"
                    type="date"
                    className="form-input"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label htmlFor="timed-event-date" className="form-label">
                    Date
                  </label>
                  <input
                    id="timed-event-date"
                    type="date"
                    className="form-input"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    required
                    disabled={isSubmitting}
                  />
                </div>

                <div className="form-dates-row">
                  <div className="form-group">
                    <label htmlFor="timed-start-time" className="form-label">
                      Start Time
                    </label>
                    <input
                      id="timed-start-time"
                      type="time"
                      className="form-input"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="timed-end-time" className="form-label">
                      End Time
                    </label>
                    <input
                      id="timed-end-time"
                      type="time"
                      className="form-input"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Location */}
            <div className="form-group">
              <label htmlFor="event-location" className="form-label">
                Location (Optional)
              </label>
              <input
                id="event-location"
                type="text"
                className="form-input"
                placeholder="Room 402, Zoom, Gym..."
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                maxLength={500}
                disabled={isSubmitting}
              />
            </div>

            {/* Color Palette */}
            <div className="form-group">
              <label className="form-label">Color Accent</label>
              <div className="color-picker-group" role="radiogroup" aria-label="Event color accent">
                {COLOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={color === opt.value}
                    aria-label={`Select color: ${opt.label}`}
                    className={`color-swatch-btn ${opt.className} ${
                      color === opt.value ? "selected" : ""
                    }`}
                    onClick={() => setColor(opt.value)}
                    disabled={isSubmitting}
                  />
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="form-group">
              <label htmlFor="event-description" className="form-label">
                Description / Notes (Optional)
              </label>
              <textarea
                id="event-description"
                className="form-textarea"
                placeholder="Meeting agenda, preparation checklist..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={5000}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="calendar-modal-footer">
            {isEditing && onRequestDelete && eventToEdit && (
              <button
                type="button"
                className="btn-calendar-nav"
                style={{ color: "var(--color-danger, #e35d6a)", gap: "6px" }}
                onClick={() => onRequestDelete(eventToEdit)}
                disabled={isSubmitting}
                aria-label="Delete event"
              >
                <Trash2 size={16} />
                <span>Delete</span>
              </button>
            )}

            <div className="modal-footer-actions">
              <button
                type="button"
                className="btn-calendar-nav"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-create-event"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="spinner" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>{isEditing ? "Save Changes" : "Save Event"}</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
