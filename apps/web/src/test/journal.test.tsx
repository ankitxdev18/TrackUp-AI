import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { App } from "../App";
import {
  getLocalTodayDateString,
  getLocalYesterdayDateString,
  type JournalEntry,
} from "../api/journal";

describe("Milestone H02-D: Journal Frontend Vertical Slice", () => {
  const localToday = getLocalTodayDateString();
  const localYesterday = getLocalYesterdayDateString();

  const mockTodayEntry: JournalEntry = {
    id: "journal-entry-1",
    userId: "user-1",
    entryDate: localToday,
    title: "Reflections on Architecture",
    content: "Today was a productive day exploring system design.\n\nKey takeaways:\n- Keep state local\n- Security first",
    createdAt: "2026-10-07T10:00:00.000Z",
    updatedAt: "2026-10-07T10:30:00.000Z",
  };

  const mockYesterdayEntry: JournalEntry = {
    id: "journal-entry-2",
    userId: "user-1",
    entryDate: localYesterday,
    title: "Yesterday's Focus",
    content: "Deep work session on backend endpoints.\nAll tests passing.",
    createdAt: "2026-10-06T09:00:00.000Z",
    updatedAt: "2026-10-06T09:00:00.000Z",
  };

  const mockPastEntry: JournalEntry = {
    id: "journal-entry-3",
    userId: "user-1",
    entryDate: "2026-10-01",
    title: null, // Untitled entry
    content: "October begins with renewed focus and clarity.",
    createdAt: "2026-10-01T08:00:00.000Z",
    updatedAt: "2026-10-01T08:00:00.000Z",
  };

  const mockEntries: JournalEntry[] = [
    mockTodayEntry,
    mockYesterdayEntry,
    mockPastEntry,
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, "", "/journal");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------
  // 1. RENDERING & TODAY SELECTION
  // --------------------------------------------------
  describe("Rendering & Today Experience", () => {
    it("renders journal page with heading, subtitle, and New Entry button", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/journal")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: mockEntries }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      expect(screen.getByRole("heading", { name: "Journal" })).toBeInTheDocument();
      expect(screen.getByText("A quiet space for daily reflection and clarity")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "New Entry" })).toBeInTheDocument();
    });

    it("renders loading state while entries are being retrieved", async () => {
      let resolveFetch: (value: Response) => void;
      const fetchPromise = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/journal")) {
          return fetchPromise;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      expect(screen.getByLabelText("Loading journal")).toBeInTheDocument();
      expect(screen.getByText("Loading journal...")).toBeInTheDocument();

      // Resolve the fetch
      resolveFetch!({
        ok: true,
        status: 200,
        json: async () => ({ entries: mockEntries }),
      } as Response);

      await waitFor(() => {
        expect(screen.queryByLabelText("Loading journal")).not.toBeInTheDocument();
      });
    });

    it("displays deliberate empty state when no entries exist at all", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/journal")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: [] }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Your journal is empty." })).toBeInTheDocument();
      });

      expect(screen.getByText("Start by writing about today.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Write today's entry" })).toBeInTheDocument();
    });

    it("auto-selects today's entry by default when it exists", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/journal")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: mockEntries }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Reflections on Architecture", level: 1 })).toBeInTheDocument();
      });

      // Today's content is displayed in reader
      expect(document.querySelector(".reader-content-text")?.textContent).toContain("Today was a productive day exploring system design.");
      // Timeline displays 3 entries
      expect(screen.getByText("3 entries")).toBeInTheDocument();
    });

    it("shows 'Nothing written today.' state when today's entry is missing without auto-creating", async () => {
      const entriesWithoutToday = [mockYesterdayEntry, mockPastEntry];

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/journal")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: entriesWithoutToday }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Nothing written today." })).toBeInTheDocument();
      });

      expect(screen.getByText("Take a moment to pause, reflect, and capture your day.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Write today's entry" })).toBeInTheDocument();
    });
  });

  // --------------------------------------------------
  // 2. CREATE ENTRY FLOW
  // --------------------------------------------------
  describe("Create Entry Flow", () => {
    it("opens editor when clicking New Entry, defaults date to local today, and shows character counts", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/journal")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: [] }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "New Entry" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "New Entry" }));

      // Editor mode indicator should now be visible
      expect(screen.getByText("New Entry", { selector: ".editor-mode-badge" })).toBeInTheDocument();
      const dateInput = screen.getByLabelText("Date") as HTMLInputElement;
      expect(dateInput.value).toBe(localToday);

      expect(screen.getByLabelText("Title")).toBeInTheDocument();
      expect(screen.getByLabelText("Content")).toBeInTheDocument();

      // Subtle character counters
      expect(screen.getByText("0 / 255")).toBeInTheDocument();
      expect(screen.getByText("0 / 20,000")).toBeInTheDocument();
    });

    it("rejects future dates with validation error", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/journal")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: [] }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "New Entry" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "New Entry" }));

      const dateInput = screen.getByLabelText("Date");
      fireEvent.change(dateInput, { target: { value: "2099-12-31" } });

      expect(screen.getByText("Date cannot be in the future")).toBeInTheDocument();

      // Save button should be disabled
      const saveBtn = screen.getByRole("button", { name: "Create entry" });
      expect(saveBtn).toBeDisabled();
    });

    it("validates empty content on submission", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/journal")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: [] }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "New Entry" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "New Entry" }));

      // Type only spaces
      const contentTextarea = screen.getByLabelText("Content");
      fireEvent.change(contentTextarea, { target: { value: "    " } });

      const form = contentTextarea.closest("form")!;
      fireEvent.submit(form);

      expect(screen.getByText("Content cannot be empty")).toBeInTheDocument();
    });

    it("successfully creates a new entry and selects it in the reader", async () => {
      const createdEntry: JournalEntry = {
        id: "journal-new-1",
        userId: "user-1",
        entryDate: localToday,
        title: "Fresh Morning Thoughts",
        content: "Crisp autumn morning, ready to build.",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method || "GET";

        if (url.includes("/api/journal") && method === "GET") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: [mockYesterdayEntry] }),
          } as Response;
        }

        if (url.includes("/api/journal") && method === "POST") {
          return {
            ok: true,
            status: 201,
            json: async () => ({ entry: createdEntry }),
          } as Response;
        }

        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "New Entry" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "New Entry" }));

      fireEvent.change(screen.getByLabelText("Title"), {
        target: { value: "Fresh Morning Thoughts" },
      });
      fireEvent.change(screen.getByLabelText("Content"), {
        target: { value: "Crisp autumn morning, ready to build." },
      });

      fireEvent.click(screen.getByRole("button", { name: "Create entry" }));

      // After creation, should be in reader view with the new entry
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Fresh Morning Thoughts", level: 1 })).toBeInTheDocument();
      });
      expect(document.querySelector(".reader-content-text")?.textContent).toContain("Crisp autumn morning, ready to build.");
    });

    it("handles 409 DUPLICATE_ENTRY_DATE gracefully with friendly message", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method || "GET";

        if (url.includes("/api/journal") && method === "GET") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: [mockTodayEntry] }),
          } as Response;
        }

        if (url.includes("/api/journal") && method === "POST") {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              error: "Journal entry already exists for this date",
              code: "DUPLICATE_ENTRY_DATE",
            }),
          } as Response;
        }

        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "New Entry" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "New Entry" }));

      fireEvent.change(screen.getByLabelText("Content"), {
        target: { value: "Trying to submit duplicate today" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Create entry" }));

      await waitFor(() => {
        expect(screen.getByText("An entry already exists for this date.")).toBeInTheDocument();
      });

      // Switch to existing date button
      expect(screen.getByRole("button", { name: "View entry for this date" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "View entry for this date" }));

      // Should return to today's existing entry reader
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Reflections on Architecture", level: 1 })).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------
  // 3. READ & TIMELINE NAVIGATION
  // --------------------------------------------------
  describe("Read Entry & Timeline Navigation", () => {
    it("switches reader when selecting an entry from timeline", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/journal")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: mockEntries }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Reflections on Architecture", level: 1 })).toBeInTheDocument();
      });

      // Click yesterday's entry in timeline
      const yesterdayBtn = screen.getByRole("button", {
        name: /View entry for Yesterday: Yesterday's Focus/i,
      });
      fireEvent.click(yesterdayBtn);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Yesterday's Focus", level: 1 })).toBeInTheDocument();
      });
      expect(document.querySelector(".reader-content-text")?.textContent).toContain("Deep work session on backend endpoints.");
    });

    it("displays untitled entries gracefully with fallback", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/journal")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: [mockPastEntry] }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Untitled Entry", level: 3 })).toBeInTheDocument();
      });

      // Click timeline item to display in reader
      const pastEntryBtn = screen.getByRole("button", {
        name: /View entry for .*: Untitled Entry/i,
      });
      fireEvent.click(pastEntryBtn);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Untitled Entry", level: 1 })).toBeInTheDocument();
      });
      expect(document.querySelector(".reader-content-text")?.textContent).toContain("October begins with renewed focus and clarity.");
    });
  });

  // --------------------------------------------------
  // 4. EDIT ENTRY FLOW
  // --------------------------------------------------
  describe("Edit Entry Flow", () => {
    it("opens editor with current title and content prefilled and date immutable", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/journal")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: [mockTodayEntry] }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Edit journal entry" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Edit journal entry" }));

      expect(screen.getByText("Editing Entry")).toBeInTheDocument();
      const titleInput = screen.getByLabelText("Title") as HTMLInputElement;
      expect(titleInput.value).toBe("Reflections on Architecture");

      const contentTextarea = screen.getByLabelText("Content") as HTMLTextAreaElement;
      expect(contentTextarea.value).toContain("Today was a productive day");

      // Date is immutable badge, not an editable input
      expect(screen.getByText("Immutable", { exact: false })).toBeInTheDocument();
      expect(screen.queryByLabelText("Date")?.tagName).not.toBe("INPUT");
    });

    it("successfully updates entry via PATCH and updates reader", async () => {
      const updatedEntry: JournalEntry = {
        ...mockTodayEntry,
        title: "Updated Title for Architecture",
        content: "Updated content with additional insights.",
        updatedAt: "2026-10-07T12:00:00.000Z",
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method || "GET";

        if (url.includes("/api/journal") && method === "GET") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: [mockTodayEntry] }),
          } as Response;
        }

        if (url.includes(`/api/journal/${mockTodayEntry.id}`) && method === "PATCH") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entry: updatedEntry }),
          } as Response;
        }

        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Edit journal entry" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Edit journal entry" }));

      fireEvent.change(screen.getByLabelText("Title"), {
        target: { value: "Updated Title for Architecture" },
      });
      fireEvent.change(screen.getByLabelText("Content"), {
        target: { value: "Updated content with additional insights." },
      });

      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Updated Title for Architecture", level: 1 })).toBeInTheDocument();
      });
      expect(document.querySelector(".reader-content-text")?.textContent).toContain("Updated content with additional insights.");
    });

    it("cancel button discards edit and returns to reader view", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/journal")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: [mockTodayEntry] }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Edit journal entry" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Edit journal entry" }));
      expect(screen.getByText("Editing Entry")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Cancel editing" }));

      expect(screen.queryByText("Editing Entry")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Reflections on Architecture", level: 1 })).toBeInTheDocument();
    });
  });

  // --------------------------------------------------
  // 5. DELETE ENTRY FLOW
  // --------------------------------------------------
  describe("Delete Entry Flow", () => {
    it("opens delete confirmation modal with clear permanent deletion warning", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/journal")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: [mockTodayEntry] }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Delete journal entry" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Delete journal entry" }));

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Delete Journal Entry" })).toBeInTheDocument();
      expect(screen.getByText("This permanently deletes this journal entry.")).toBeInTheDocument();
    });

    it("cancels deletion preserves entry and closes modal", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/journal")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: [mockTodayEntry] }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Delete journal entry" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Delete journal entry" }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Reflections on Architecture", level: 1 })).toBeInTheDocument();
    });

    it("confirms deletion, removes entry from list, and updates selected entry", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method || "GET";

        if (url.includes("/api/journal") && method === "GET") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: [mockTodayEntry, mockYesterdayEntry] }),
          } as Response;
        }

        if (url.includes(`/api/journal/${mockTodayEntry.id}`) && method === "DELETE") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, message: "Deleted successfully" }),
          } as Response;
        }

        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Delete journal entry" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Delete journal entry" }));
      fireEvent.click(screen.getByRole("button", { name: "Delete Entry" }));

      // Today entry deleted, should now select yesterday's entry
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Yesterday's Focus", level: 1 })).toBeInTheDocument();
      });

      expect(screen.queryByRole("heading", { name: "Reflections on Architecture", level: 1 })).not.toBeInTheDocument();
    });
  });

  // --------------------------------------------------
  // 6. ERROR STATES & RECOVERY
  // --------------------------------------------------
  describe("Error States & Recovery", () => {
    it("displays error container on initial fetch failure and allows retry", async () => {
      let callCount = 0;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/journal")) {
          callCount++;
          if (callCount === 1) {
            return {
              ok: false,
              status: 500,
              json: async () => ({ error: "Internal Server Error", code: "INTERNAL_SERVER_ERROR" }),
            } as Response;
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: [mockTodayEntry] }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Unable to load journal" })).toBeInTheDocument();
      });
      expect(screen.getByText("Internal Server Error")).toBeInTheDocument();

      // Click retry
      fireEvent.click(screen.getByRole("button", { name: "Try Again" }));

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Reflections on Architecture", level: 1 })).toBeInTheDocument();
      });
    });

    it("handles delete failure gracefully displaying error in modal", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method || "GET";

        if (url.includes("/api/journal") && method === "GET") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: [mockTodayEntry] }),
          } as Response;
        }

        if (url.includes(`/api/journal/${mockTodayEntry.id}`) && method === "DELETE") {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: "Database lock error", code: "DELETE_FAILED" }),
          } as Response;
        }

        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Delete journal entry" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Delete journal entry" }));
      fireEvent.click(screen.getByRole("button", { name: "Delete Entry" }));

      await waitFor(() => {
        expect(screen.getByText("Database lock error")).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------
  // 7. SECURITY & CONTENT INTEGRITY
  // --------------------------------------------------
  describe("Security & Content Integrity", () => {
    it("renders malicious HTML and script tags strictly as plain text", async () => {
      const maliciousEntry: JournalEntry = {
        id: "journal-xss-1",
        userId: "user-1",
        entryDate: localToday,
        title: "<script>alert('xss')</script>",
        content: "<img src=x onerror=alert(1)><strong>bold content</strong>\n<script>window.pwned=true</script>",
        createdAt: "2026-10-07T10:00:00.000Z",
        updatedAt: "2026-10-07T10:00:00.000Z",
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/journal")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: [maliciousEntry] }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "<script>alert('xss')</script>", level: 1 })).toBeInTheDocument();
      });

      // Check text is rendered directly as text node
      const readerBodyText = document.querySelector(".reader-content-text")?.textContent;
      expect(readerBodyText).toContain("<img src=x onerror=alert(1)>");
      expect(readerBodyText).toContain("<script>window.pwned=true</script>");

      // No executable elements inserted
      expect(document.querySelector("img[src='x']")).not.toBeInTheDocument();
      expect((window as any).pwned).toBeUndefined();
    });

    it("preserves line breaks in multi-line journal content", async () => {
      const multiLineEntry: JournalEntry = {
        id: "journal-multiline-1",
        userId: "user-1",
        entryDate: localToday,
        title: "Multi-line formatting",
        content: "Paragraph 1\n\nParagraph 2\nLine 3 after single break",
        createdAt: "2026-10-07T10:00:00.000Z",
        updatedAt: "2026-10-07T10:00:00.000Z",
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/journal")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: [multiLineEntry] }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Multi-line formatting", level: 1 })).toBeInTheDocument();
      });

      const bodyText = document.querySelector(".reader-content-text");
      expect(bodyText).toBeInTheDocument();
      expect(bodyText).toHaveClass("reader-content-text");
      expect(bodyText?.textContent).toBe("Paragraph 1\n\nParagraph 2\nLine 3 after single break");
    });
  });

  // --------------------------------------------------
  // 8. ACCESSIBILITY
  // --------------------------------------------------
  describe("Accessibility", () => {
    it("provides accessible form controls with proper labels in editor", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/journal")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: [] }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "New Entry" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "New Entry" }));

      // Labels associated with form controls
      expect(screen.getByLabelText("Date")).toHaveAttribute("id", "journal-entry-date");
      expect(screen.getByLabelText("Title")).toHaveAttribute("id", "journal-entry-title");
      expect(screen.getByLabelText("Content")).toHaveAttribute("id", "journal-entry-content");
    });

    it("closes delete modal on Escape key press", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/journal")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: [mockTodayEntry] }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Delete journal entry" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Delete journal entry" }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });
  });
});
