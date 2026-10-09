import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { App } from "../App";
import { getLocalTodayDateString, type Habit, type HabitHistoryResponse } from "../api/habits";

describe("Milestone H01-D: Habits Frontend Vertical Slice", () => {
  const localToday = getLocalTodayDateString();

  const mockActiveHabit1: Habit = {
    id: "habit-1",
    userId: "user-1",
    title: "Read 20 pages",
    description: "Personal development routine before sleep",
    frequency: "DAILY",
    status: "ACTIVE",
    currentStreak: 3,
    longestStreak: 7,
    todayCompleted: false,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
  };

  const mockActiveHabit2: Habit = {
    id: "habit-2",
    userId: "user-1",
    title: "Morning 30m DSA Practice",
    description: "Solve 1 medium problem on LeetCode/TUF",
    frequency: "DAILY",
    status: "ACTIVE",
    currentStreak: 5,
    longestStreak: 12,
    todayCompleted: true,
    createdAt: "2026-10-02T10:00:00.000Z",
    updatedAt: "2026-10-02T10:00:00.000Z",
  };

  const mockArchivedHabit: Habit = {
    id: "habit-3",
    userId: "user-1",
    title: "Old archived habit",
    description: "Paused habit",
    frequency: "DAILY",
    status: "ARCHIVED",
    currentStreak: 0,
    longestStreak: 4,
    todayCompleted: false,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-15T10:00:00.000Z",
  };

  const mockHabits: Habit[] = [mockActiveHabit1, mockActiveHabit2, mockArchivedHabit];

  // Helper to generate a 7-day mock history for a habit
  const makeMockHistory = (habitId: string, todayCompleted: boolean = false): HabitHistoryResponse => {
    const dates: string[] = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      dates.push(`${year}-${month}-${day}`);
    }

    return {
      habitId,
      days: 7,
      startDate: dates[dates.length - 1],
      endDate: dates[0],
      currentStreak: todayCompleted ? 1 : 0,
      longestStreak: 5,
      eligibilityStartDate: "2026-10-01",
      history: dates.map((date, idx) => ({
        date,
        completed: idx === 0 ? todayCompleted : idx % 2 === 0, // Today is idx 0
        eligible: true,
        completedAt: (idx === 0 && todayCompleted) || (idx > 0 && idx % 2 === 0)
          ? "2026-10-06T10:00:00.000Z"
          : null,
      })),
    };
  };

  let mockHistoryMap: Record<string, HabitHistoryResponse>;
  let currentHabitsList: Habit[];

  beforeEach(() => {
    currentHabitsList = [...mockHabits];
    mockHistoryMap = {
      "habit-1": makeMockHistory("habit-1", false),
      "habit-2": makeMockHistory("habit-2", true),
      "habit-3": makeMockHistory("habit-3", false),
    };

    window.history.pushState({}, "", "/habits");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, options?: any) => {
        const urlStr = url.toString();

        // Auth endpoint
        if (urlStr.includes("/api/auth/me")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              user: {
                id: "user-1",
                name: "Alex Mercer",
                email: "alex@example.com",
              },
            }),
          };
        }

        // History endpoint: GET /api/habits/:id/history
        const historyMatch = urlStr.match(/\/api\/habits\/([^/?]+)\/history/);
        if (historyMatch) {
          const habitId = historyMatch[1];
          const hist = mockHistoryMap[habitId] || makeMockHistory(habitId, false);
          return {
            ok: true,
            status: 200,
            json: async () => hist,
          };
        }

        // Completions endpoint: POST or DELETE
        const completionMatch = urlStr.match(/\/api\/habits\/([^/?]+)\/completions(?:\/([^/?]+))?/);
        if (completionMatch) {
          const habitId = completionMatch[1];
          const dateParam = completionMatch[2];

          if (options?.method === "DELETE") {
            // Undo completion
            return {
              ok: true,
              status: 200,
              json: async () => ({
                success: true,
                habitId,
                completedDate: dateParam,
              }),
            };
          }

          if (options?.method === "POST") {
            const body = JSON.parse(options.body);
            return {
              ok: true,
              status: 201,
              json: async () => ({
                completion: {
                  id: "comp-1",
                  habitId,
                  userId: "user-1",
                  completedDate: body.date,
                  completedAt: new Date().toISOString(),
                  createdAt: new Date().toISOString(),
                },
              }),
            };
          }
        }

        // Single Habit PATCH or DELETE: /api/habits/:id
        const habitIdMatch = urlStr.match(/\/api\/habits\/([^/?]+)$/);
        if (habitIdMatch) {
          const habitId = habitIdMatch[1];

          if (options?.method === "PATCH") {
            const body = JSON.parse(options.body);
            const found = currentHabitsList.find((h) => h.id === habitId);
            const updated: Habit = {
              ...(found || mockActiveHabit1),
              ...body,
              updatedAt: new Date().toISOString(),
            };
            currentHabitsList = currentHabitsList.map((h) =>
              h.id === habitId ? updated : h
            );
            return {
              ok: true,
              status: 200,
              json: async () => ({ habit: updated }),
            };
          }

          if (options?.method === "DELETE") {
            currentHabitsList = currentHabitsList.filter((h) => h.id !== habitId);
            return {
              ok: true,
              status: 200,
              json: async () => ({ success: true, id: habitId }),
            };
          }

          const single = currentHabitsList.find((h) => h.id === habitId);
          return {
            ok: Boolean(single),
            status: single ? 200 : 404,
            json: async () => ({ habit: single }),
          };
        }

        // Habit Creation: POST /api/habits
        if (urlStr.endsWith("/api/habits") && options?.method === "POST") {
          const body = JSON.parse(options.body);
          const newHabit: Habit = {
            id: `habit-${Date.now()}`,
            userId: "user-1",
            title: body.title,
            description: body.description ?? null,
            frequency: body.frequency ?? "DAILY",
            status: "ACTIVE",
            currentStreak: 0,
            longestStreak: 0,
            todayCompleted: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          currentHabitsList = [newHabit, ...currentHabitsList];
          return {
            ok: true,
            status: 201,
            json: async () => ({ habit: newHabit }),
          };
        }

        // Habits List: GET /api/habits
        if (urlStr.includes("/api/habits")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ habits: currentHabitsList }),
          };
        }

        return {
          ok: false,
          status: 404,
          json: async () => ({ error: "Not Found" }),
        };
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================
  // 1. PAGE RENDERING & INITIAL STATES
  // ==========================================

  it("1. renders Habits page with heading, description, and new habit button", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Habits" })).toBeInTheDocument();
    });

    expect(
      screen.getByText("Build consistent daily routines and track continuous execution.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create new habit" })).toBeInTheDocument();
  });

  it("2. shows loading state while fetching habits initially", () => {
    render(<App />);
    expect(screen.getByLabelText("Loading habits")).toBeInTheDocument();
  });

  it("3. renders intentional empty state when no active habits exist", async () => {
    currentHabitsList = [];
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Build your first daily habit")).toBeInTheDocument();
    });
    expect(screen.getByText(/Start small\. Anchor an intentional routine/i)).toBeInTheDocument();
  });

  it("4. renders error state with retry button when fetching habits fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/api/auth/me")) {
          return { ok: true, json: async () => ({ user: { id: "user-1" } }) };
        }
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: "Database connectivity error" }),
        };
      })
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Unable to load habits")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Try Again/i })).toBeInTheDocument();
  });

  it("5. renders active habits with titles and cadence tags", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
      expect(screen.getByText("Morning 30m DSA Practice")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Daily").length).toBeGreaterThan(0);
    // Archived habit should not be in the active tab by default
    expect(screen.queryByText("Old archived habit")).not.toBeInTheDocument();
  });

  it("6. switches to archived view and displays archived habits", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    // Click Archived tab
    const archivedTab = screen.getByRole("tab", { name: /Archived/i });
    fireEvent.click(archivedTab);

    await waitFor(() => {
      expect(screen.getByText("Old archived habit")).toBeInTheDocument();
    });

    // Active habits should no longer be visible in Archived tab
    expect(screen.queryByText("Read 20 pages")).not.toBeInTheDocument();
  });

  // ==========================================
  // 2. CREATE HABIT
  // ==========================================

  it("7. opens create modal upon clicking '+ New Habit'", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Habits" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Create new habit" }));

    expect(screen.getByRole("heading", { name: "Create New Habit" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Habit Title/i)).toBeInTheDocument();
  });

  it("8. valid habit creation succeeds and prepends new habit to list", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Create new habit" }));

    const titleInput = screen.getByLabelText(/Habit Title/i);
    const descInput = screen.getByLabelText(/Context & Motivation/i);

    fireEvent.change(titleInput, { target: { value: "Cold Shower & Breathing" } });
    fireEvent.change(descInput, { target: { value: "Build mental resilience" } });

    fireEvent.click(screen.getByRole("button", { name: "Create Habit" }));

    await waitFor(() => {
      expect(screen.getByText("Cold Shower & Breathing")).toBeInTheDocument();
    });
  });

  it("9. client-side validation prevents submitting empty title", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Habits" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Create new habit" }));

    const titleInput = screen.getByLabelText(/Habit Title/i);
    fireEvent.change(titleInput, { target: { value: "   " } });

    fireEvent.click(screen.getByRole("button", { name: "Create Habit" }));

    expect(screen.getByText("Habit title is required.")).toBeInTheDocument();
  });

  it("10. create failure surfaces error message in modal", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Habits" })).toBeInTheDocument();
    });

    // Mock failure on creation POST
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, options?: any) => {
        if (url.includes("/api/auth/me")) {
          return { ok: true, json: async () => ({ user: { id: "user-1" } }) };
        }
        if (options?.method === "POST" && url.endsWith("/api/habits")) {
          return {
            ok: false,
            status: 400,
            json: async () => ({ error: "Title already exists in active set" }),
          };
        }
        return { ok: true, json: async () => ({ habits: currentHabitsList }) };
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Create new habit" }));
    fireEvent.change(screen.getByLabelText(/Habit Title/i), { target: { value: "Duplicate Habit" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Habit" }));

    await waitFor(() => {
      expect(screen.getByText("Title already exists in active set")).toBeInTheDocument();
    });
  });

  // ==========================================
  // 3. EDIT HABIT
  // ==========================================

  it("11. edit modal opens with existing habit values pre-populated", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    // Open row menu for habit-1
    fireEvent.click(screen.getByLabelText("Options for Read 20 pages"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Edit/i }));

    expect(screen.getByRole("heading", { name: "Edit Habit" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Read 20 pages")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Personal development routine before sleep")).toBeInTheDocument();
  });

  it("12. update habit succeeds and updates the list item", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Options for Read 20 pages"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Edit/i }));

    const titleInput = screen.getByLabelText(/Habit Title/i);
    fireEvent.change(titleInput, { target: { value: "Read 30 pages" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(screen.getByText("Read 30 pages")).toBeInTheDocument();
    });
  });

  // ==========================================
  // 4. ARCHIVE AND RESTORE
  // ==========================================

  it("14. archive action archives active habit and removes from Active view", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Options for Read 20 pages"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Archive/i }));

    await waitFor(() => {
      expect(screen.queryByText("Read 20 pages")).not.toBeInTheDocument();
    });

    // Verify it is now present in Archived view
    fireEvent.click(screen.getByRole("tab", { name: /Archived/i }));
    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });
  });

  it("15. restore action restores archived habit back to Active view", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /Archived/i })).toBeInTheDocument();
    });

    // Go to Archived tab
    fireEvent.click(screen.getByRole("tab", { name: /Archived/i }));

    await waitFor(() => {
      expect(screen.getByText("Old archived habit")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Options for Old archived habit"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Restore/i }));

    // Switch back to Active tab
    fireEvent.click(screen.getByRole("tab", { name: /Active/i }));

    await waitFor(() => {
      expect(screen.getByText("Old archived habit")).toBeInTheDocument();
    });
  });

  // ==========================================
  // 5. DESTRUCTIVE DELETION
  // ==========================================

  it("16. delete confirmation modal appears with habit title and permanent warning", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Options for Read 20 pages"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete/i }));

    expect(screen.getByRole("heading", { name: "Delete Habit" })).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/i)).toBeInTheDocument();
    expect(screen.getByText('"Read 20 pages"')).toBeInTheDocument();
    expect(screen.getByText(/All completion history for this habit will be permanently deleted/i)).toBeInTheDocument();
  });

  it("17. confirm delete removes habit from the UI permanently", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Options for Read 20 pages"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete/i }));

    fireEvent.click(screen.getByRole("button", { name: "Delete Habit" }));

    await waitFor(() => {
      expect(screen.queryByText("Read 20 pages")).not.toBeInTheDocument();
    });
  });

  it("18. cancel delete preserves the habit", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Options for Read 20 pages"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete/i }));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
  });

  // ==========================================
  // 6. COMPLETION TOGGLE & DATE CONTRACT
  // ==========================================

  it("20. today's completion state renders accurately based on history", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
      expect(screen.getByText("Morning 30m DSA Practice")).toBeInTheDocument();
    });

    // habit-1 was mocked uncompleted
    const toggle1 = screen.getByLabelText('Mark "Read 20 pages" as complete');
    expect(toggle1).toBeInTheDocument();
    expect(toggle1).toHaveAttribute("aria-pressed", "false");

    // habit-2 was mocked completed
    const toggle2 = screen.getByLabelText('Mark "Morning 30m DSA Practice" as incomplete');
    expect(toggle2).toBeInTheDocument();
    expect(toggle2).toHaveAttribute("aria-pressed", "true");

    // Summary reflects 1 of 2 completed
    expect(screen.getByLabelText("Today's progress")).toHaveTextContent("1 of 2 completed");
  });

  it("21. checking a habit sends today's local YYYY-MM-DD date in POST body", async () => {
    let capturedBody: any = null;
    let capturedUrl: string = "";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, options?: any) => {
        const urlStr = url.toString();
        if (urlStr.includes("/api/auth/me")) {
          return { ok: true, json: async () => ({ user: { id: "user-1" } }) };
        }
        if (urlStr.includes("/history")) {
          return { ok: true, json: async () => makeMockHistory("habit-1", false) };
        }
        if (urlStr.includes("/completions") && options?.method === "POST") {
          capturedUrl = urlStr;
          capturedBody = JSON.parse(options.body);
          return {
            ok: true,
            status: 201,
            json: async () => ({
              completion: {
                id: "comp-1",
                habitId: "habit-1",
                userId: "user-1",
                completedDate: capturedBody.date,
                completedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
              },
            }),
          };
        }
        return { ok: true, json: async () => ({ habits: [mockActiveHabit1] }) };
      })
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    const toggle = screen.getByLabelText('Mark "Read 20 pages" as complete');
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(capturedUrl).toContain("/api/habits/habit-1/completions");
      expect(capturedBody).toEqual({ date: localToday });
    });
  });

  it("22. unchecking a habit sends DELETE request for today's local date", async () => {
    let capturedDeleteUrl: string = "";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, options?: any) => {
        const urlStr = url.toString();
        if (urlStr.includes("/api/auth/me")) {
          return { ok: true, json: async () => ({ user: { id: "user-1" } }) };
        }
        if (urlStr.includes("/history")) {
          return { ok: true, json: async () => makeMockHistory("habit-2", true) };
        }
        if (options?.method === "DELETE" && urlStr.includes("/completions/")) {
          capturedDeleteUrl = urlStr;
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, habitId: "habit-2", completedDate: localToday }),
          };
        }
        return { ok: true, json: async () => ({ habits: [mockActiveHabit2] }) };
      })
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Morning 30m DSA Practice")).toBeInTheDocument();
    });

    const toggle = screen.getByLabelText('Mark "Morning 30m DSA Practice" as incomplete');
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(capturedDeleteUrl).toContain(`/api/habits/habit-2/completions/${localToday}`);
    });
  });

  it("23. optimistic completion updates UI immediately before server returns", async () => {
    let resolvePost: () => void;
    const postPromise = new Promise<void>((resolve) => {
      resolvePost = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, options?: any) => {
        const urlStr = url.toString();
        if (urlStr.includes("/api/auth/me")) {
          return { ok: true, json: async () => ({ user: { id: "user-1" } }) };
        }
        if (urlStr.includes("/history")) {
          return { ok: true, json: async () => makeMockHistory("habit-1", false) };
        }
        if (urlStr.includes("/completions") && options?.method === "POST") {
          await postPromise;
          return {
            ok: true,
            status: 201,
            json: async () => ({ completion: { id: "c1", completedDate: localToday } }),
          };
        }
        return { ok: true, json: async () => ({ habits: [mockActiveHabit1] }) };
      })
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    const toggle = screen.getByLabelText('Mark "Read 20 pages" as complete');
    fireEvent.click(toggle);

    // Immediately shows loading/toggling or completed state optimistically
    expect(screen.getByLabelText('Mark "Read 20 pages" as incomplete')).toBeInTheDocument();

    // Now resolve the promise
    resolvePost!();
  });

  it("24. completion failure rolls back the optimistic state and displays error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, options?: any) => {
        const urlStr = url.toString();
        if (urlStr.includes("/api/auth/me")) {
          return { ok: true, json: async () => ({ user: { id: "user-1" } }) };
        }
        if (urlStr.includes("/history")) {
          return { ok: true, json: async () => makeMockHistory("habit-1", false) };
        }
        if (urlStr.includes("/completions") && options?.method === "POST") {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: "Server connection failed" }),
          };
        }
        return { ok: true, json: async () => ({ habits: [mockActiveHabit1] }) };
      })
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    const toggle = screen.getByLabelText('Mark "Read 20 pages" as complete');
    fireEvent.click(toggle);

    // Error banner appears
    await waitFor(() => {
      expect(screen.getByText(/Could not update "Read 20 pages": Server connection failed/i)).toBeInTheDocument();
    });

    // Rolled back to incomplete
    expect(screen.getByLabelText('Mark "Read 20 pages" as complete')).toBeInTheDocument();
  });

  // ==========================================
  // 7. COMPACT 7-DAY HISTORY
  // ==========================================

  it("26. renders 7-day compact history chips with day letters", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    const historySection = screen.getAllByLabelText("7-day completion history");
    expect(historySection.length).toBeGreaterThan(0);
    expect(screen.getAllByText("Last 7 Days").length).toBeGreaterThan(0);
  });

  it("28. today's history chip has distinct visual indicator class", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    const todayChips = document.querySelectorAll(".history-day-chip.is-today");
    expect(todayChips.length).toBeGreaterThan(0);
  });

  it("29. history request failure does not break habits page rendering", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        const urlStr = url.toString();
        if (urlStr.includes("/api/auth/me")) {
          return { ok: true, json: async () => ({ user: { id: "user-1" } }) };
        }
        if (urlStr.includes("/history")) {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: "History database failed" }),
          };
        }
        return { ok: true, json: async () => ({ habits: [mockActiveHabit1] }) };
      })
    );

    render(<App />);

    // Habits page still renders cleanly and allows interactions
    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Create new habit" })).toBeInTheDocument();
  });

  // ==========================================
  // 8. ACCESSIBILITY & KEYBOARD INTERACTION
  // ==========================================

  it("31. all interactive controls have accessible names and aria attributes", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Mark "Read 20 pages" as complete')).toBeInTheDocument();
    expect(screen.getByLabelText("Options for Read 20 pages")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Active/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Archived/i })).toBeInTheDocument();
  });

  it("32. ESC key closes the create modal", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Habits" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Create new habit" }));
    expect(screen.getByRole("dialog", { name: "Create New Habit" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Create New Habit" })).not.toBeInTheDocument();
  });

  // ==========================================
  // 9. CRITICAL USER-LOCAL DATE CONTRACT TEST
  // ==========================================

  it("33. STRICT DATE CONTRACT: completion request uses local calendar date instead of UTC conversion", async () => {
    let capturedDateInPayload: string = "";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, options?: any) => {
        const urlStr = url.toString();
        if (urlStr.includes("/api/auth/me")) {
          return { ok: true, json: async () => ({ user: { id: "user-1" } }) };
        }
        if (urlStr.includes("/history")) {
          return { ok: true, json: async () => makeMockHistory("habit-1", false) };
        }
        if (options?.method === "POST" && urlStr.includes("/completions")) {
          const body = JSON.parse(options.body);
          capturedDateInPayload = body.date;
          return {
            ok: true,
            status: 201,
            json: async () => ({ completion: { id: "c1", completedDate: body.date } }),
          };
        }
        if (urlStr.match(/\/api\/habits\/[^/?]+$/)) {
          return { ok: true, json: async () => ({ habit: mockActiveHabit1 }) };
        }
        return { ok: true, json: async () => ({ habits: [mockActiveHabit1] }) };
      })
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Mark "Read 20 pages" as complete'));

    await waitFor(() => {
      expect(capturedDateInPayload).not.toBe("");
    });

    // Compute expected local calendar date directly from browser's local date
    const now = new Date();
    const expectedLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    expect(capturedDateInPayload).toBe(expectedLocal);
    // Explicitly verify it matches getLocalTodayDateString()
    expect(capturedDateInPayload).toBe(localToday);
  });

  // ==========================================
  // 10. H04 STREAK & ACCESSIBILITY TESTS
  // ==========================================

  it("34. displays current streak and longest streak supporting metrics on habit cards", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    // mockActiveHabit1 has currentStreak: 3, longestStreak: 7
    expect(screen.getByText("3 days streak")).toBeInTheDocument();
    expect(screen.getByText("Best: 7 days")).toBeInTheDocument();

    // mockActiveHabit2 has currentStreak: 5, longestStreak: 12
    expect(screen.getByText("5 days streak")).toBeInTheDocument();
    expect(screen.getByText("Best: 12 days")).toBeInTheDocument();
  });

  it("35. completion toggle has role='checkbox' and accessible aria-checked state", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    const uncheckedToggle = screen.getByLabelText('Mark "Read 20 pages" as complete');
    expect(uncheckedToggle).toHaveAttribute("role", "checkbox");
    expect(uncheckedToggle).toHaveAttribute("aria-checked", "false");

    const checkedToggle = screen.getByLabelText('Mark "Morning 30m DSA Practice" as incomplete');
    expect(checkedToggle).toHaveAttribute("role", "checkbox");
    expect(checkedToggle).toHaveAttribute("aria-checked", "true");
  });

  it("36. handles 204 No Content for deleteHabit and undoHabitCompletion safely", async () => {
    const { deleteHabit, undoHabitCompletion } = await import("../api/habits");

    // Test deleteHabit with 204
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 204,
      })
    );

    const deleteResult = await deleteHabit("habit-123");
    expect(deleteResult).toEqual({ success: true, id: "habit-123" });

    // Test undoHabitCompletion with 204
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 204,
      })
    );

    const undoResult = await undoHabitCompletion("habit-123", "2026-10-09");
    expect(undoResult).toEqual({
      success: true,
      habitId: "habit-123",
      completedDate: "2026-10-09",
    });
  });

  it("37. prevents duplicate archive/restore transitions while transition is in progress", async () => {
    let patchCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, options?: any) => {
        const urlStr = url.toString();
        if (urlStr.includes("/api/auth/me")) {
          return { ok: true, json: async () => ({ user: { id: "user-1" } }) };
        }
        if (urlStr.includes("/history")) {
          return { ok: true, json: async () => makeMockHistory("habit-1", false) };
        }
        if (options?.method === "PATCH") {
          patchCount++;
          // simulate delayed response
          await new Promise((r) => setTimeout(r, 100));
          return {
            ok: true,
            status: 200,
            json: async () => ({
              habit: { ...mockActiveHabit1, status: "ARCHIVED" },
            }),
          };
        }
        return { ok: true, json: async () => ({ habits: [mockActiveHabit1] }) };
      })
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Read 20 pages")).toBeInTheDocument();
    });

    // Open dropdown menu
    fireEvent.click(screen.getByLabelText("Options for Read 20 pages"));

    const archiveBtn = screen.getByRole("menuitem", { name: /Archive/i });
    fireEvent.click(archiveBtn);

    // Click again while transition is in flight
    fireEvent.click(archiveBtn);

    await waitFor(() => {
      expect(patchCount).toBe(1);
    });
  });
});
