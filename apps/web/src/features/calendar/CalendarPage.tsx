import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import type {
  CalendarEvent,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
} from "../../api/calendar";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent,
} from "../../api/calendar";
import { CalendarHeader } from "./CalendarHeader";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { DayView } from "./DayView";
import { AgendaView } from "./AgendaView";
import { EventModal } from "./EventModal";
import { DeleteEventDialog } from "./DeleteEventDialog";
import type { CalendarView } from "./calendar.types";
import {
  getTemporalBoundsForView,
  getTodayDateString,
  getUserTimeZone,
  shiftAnchorDate,
} from "./calendarDateUtils";
import "./Calendar.css";

export const CalendarPage: React.FC = () => {
  const timeZone = getUserTimeZone();
  const [activeView, setActiveView] = useState<CalendarView>(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      return "day";
    }
    return "week";
  });

  const [anchorDate, setAnchorDate] = useState<string>(() => getTodayDateString(timeZone));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<CalendarEvent | null>(null);
  const [modalInitialDate, setModalInitialDate] = useState<string | undefined>();
  const [modalInitialTime, setModalInitialTime] = useState<string | undefined>();

  // Deletion modal state
  const [deleteCandidate, setDeleteCandidate] = useState<CalendarEvent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Request counter to avoid stale response race conditions
  const activeRequestId = useRef(0);

  // Compute temporal range bounds and title label
  const range = getTemporalBoundsForView(activeView, anchorDate, timeZone);

  const fetchEvents = useCallback(async () => {
    const reqId = ++activeRequestId.current;
    try {
      setIsLoading(true);
      setFetchError(null);

      const data = await listCalendarEvents(range.startIso, range.endIso, timeZone);
      if (reqId === activeRequestId.current) {
        setEvents(data);
      }
    } catch (err: unknown) {
      if (reqId === activeRequestId.current) {
        setFetchError(
          err instanceof Error ? err.message : "Failed to load calendar events."
        );
      }
    } finally {
      if (reqId === activeRequestId.current) {
        setIsLoading(false);
      }
    }
  }, [range.startIso, range.endIso, timeZone]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Navigation Handlers
  const handleNavigatePrev = () => {
    setAnchorDate((prev) => shiftAnchorDate(prev, activeView, -1));
  };

  const handleNavigateNext = () => {
    setAnchorDate((prev) => shiftAnchorDate(prev, activeView, 1));
  };

  const handleNavigateToday = () => {
    setAnchorDate(getTodayDateString(timeZone));
  };

  const handleViewChange = (newView: CalendarView) => {
    setActiveView(newView);
  };

  // Creation & Editing Handlers
  const handleOpenCreateModal = (dateStr?: string, timeStr?: string) => {
    setEventToEdit(null);
    setModalInitialDate(dateStr || anchorDate);
    setModalInitialTime(timeStr);
    setIsModalOpen(true);
  };

  const handleSelectEvent = (event: CalendarEvent) => {
    setEventToEdit(event);
    setModalInitialDate(undefined);
    setModalInitialTime(undefined);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEventToEdit(null);
  };

  const handleSaveEvent = async (
    payload: CreateCalendarEventInput | UpdateCalendarEventInput
  ) => {
    if (eventToEdit) {
      await updateCalendarEvent(eventToEdit.id, payload as UpdateCalendarEventInput);
    } else {
      await createCalendarEvent(payload as CreateCalendarEventInput);
    }
    await fetchEvents();
  };

  // Deletion Handlers
  const handleRequestDelete = (event: CalendarEvent) => {
    setDeleteCandidate(event);
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteCandidate) return;
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await deleteCalendarEvent(deleteCandidate.id);
      setDeleteCandidate(null);
      setIsModalOpen(false);
      await fetchEvents();
    } catch (err: unknown) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete event. Please try again."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenDayView = (dateStr: string) => {
    setAnchorDate(dateStr);
    setActiveView("day");
  };

  return (
    <div className="calendar-page-container">
      {/* Top Controls Header */}
      <CalendarHeader
        label={range.label}
        activeView={activeView}
        onViewChange={handleViewChange}
        onNavigatePrev={handleNavigatePrev}
        onNavigateNext={handleNavigateNext}
        onNavigateToday={handleNavigateToday}
        onCreateEvent={() => handleOpenCreateModal()}
      />

      {/* Error Banner if loading failed */}
      {fetchError && (
        <div className="calendar-error-banner" role="alert">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <AlertCircle size={16} />
            <span>{fetchError}</span>
          </div>
          <button type="button" onClick={() => fetchEvents()}>
            Retry
          </button>
        </div>
      )}

      {/* Main View Area */}
      {isLoading && events.length === 0 ? (
        <div className="calendar-state-container" aria-live="polite">
          <Loader2 size={36} className="spinner calendar-state-icon" aria-hidden="true" />
          <h3 className="calendar-state-title">Loading Calendar</h3>
          <p className="calendar-state-desc">Synchronizing your scheduled attention timeline...</p>
        </div>
      ) : activeView === "month" ? (
        <MonthView
          anchorDate={anchorDate}
          timeZone={timeZone}
          events={events}
          onSelectEvent={handleSelectEvent}
          onCreateOnDate={(dateStr) => handleOpenCreateModal(dateStr)}
          onOpenDayView={handleOpenDayView}
        />
      ) : activeView === "week" ? (
        <WeekView
          anchorDate={anchorDate}
          timeZone={timeZone}
          events={events}
          onSelectEvent={handleSelectEvent}
          onCreateSlot={(dateStr, timeStr) => handleOpenCreateModal(dateStr, timeStr)}
          onOpenDayView={handleOpenDayView}
        />
      ) : activeView === "day" ? (
        <DayView
          anchorDate={anchorDate}
          timeZone={timeZone}
          events={events}
          onSelectEvent={handleSelectEvent}
          onCreateSlot={(dateStr, timeStr) => handleOpenCreateModal(dateStr, timeStr)}
        />
      ) : (
        <AgendaView
          events={events}
          timeZone={timeZone}
          onSelectEvent={handleSelectEvent}
          onCreateEvent={() => handleOpenCreateModal()}
        />
      )}

      {/* Create / Edit Modal */}
      <EventModal
        isOpen={isModalOpen}
        eventToEdit={eventToEdit}
        initialDate={modalInitialDate}
        initialTime={modalInitialTime}
        timeZone={timeZone}
        onClose={handleCloseModal}
        onSave={handleSaveEvent}
        onRequestDelete={handleRequestDelete}
      />

      {/* Permanent Delete Confirmation Dialog */}
      <DeleteEventDialog
        isOpen={Boolean(deleteCandidate)}
        event={deleteCandidate}
        loading={isDeleting}
        error={deleteError}
        onClose={() => setDeleteCandidate(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};
