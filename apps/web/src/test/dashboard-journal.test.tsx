import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { App } from "../App";
import { TodayJournalWidget } from "../pages/dashboard/TodayJournalWidget";
import { RouterProvider } from "../router/Router";
import { getLocalTodayDateString, type JournalEntry } from "../api/journal";
import { getTodayDateString, type Task } from "../api/tasks";

describe("Milestone H02-E: Dashboard Journal Widget Integration", () => {
  const localToday = getLocalTodayDateString();
  const taskToday = getTodayDateString();

  const mockTasks: Task[] = [
    {
      id: "t-1",
      userId: "user-1",
      title: "Review quarterly goals",
      status: "TODO",
      priority: "HIGH",
      dueDate: taskToday,
      completedAt: null,
      createdAt: "2026-10-06T08:00:00.000Z",
      updatedAt: "2026-10-06T08:00:00.000Z",
    },
  ];

  const mockTodayEntry: JournalEntry = {
    id: "journal-today-1",
    userId: "user-1",
    entryDate: localToday,
    title: "Morning Clarity & Strategy",
    content:
      "Started the day with a focused walk and planned the weekly milestones. Making steady progress on the core architecture.",
    createdAt: "2026-10-07T08:30:00.000Z",
    updatedAt: "2026-10-07T08:30:00.000Z",
  };

  let journalByDateResponse: { ok: boolean; status: number; body: any };
  let requestedJournalUrls: string[];

  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, "", "/dashboard");
    requestedJournalUrls = [];

    // Default response: entry exists
    journalByDateResponse = {
      ok: true,
      status: 200,
      body: { entry: mockTodayEntry },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        const urlStr = url.toString();

        if (urlStr.includes("/api/auth/me")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              user: { id: "user-1", name: "Alex Mercer", email: "alex@example.com" },
            }),
          };
        }

        if (urlStr.includes("/api/tasks")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ tasks: mockTasks }),
          };
        }

        if (urlStr.includes("/api/projects")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ projects: [] }),
          };
        }

        if (urlStr.includes("/api/goals")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ goals: [] }),
          };
        }

        if (urlStr.includes("/api/habits")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ habits: [], history: [] }),
          };
        }

        if (urlStr.includes("/api/journal/by-date/")) {
          requestedJournalUrls.push(urlStr);
          if (!journalByDateResponse.ok) {
            return {
              ok: false,
              status: journalByDateResponse.status,
              json: async () => journalByDateResponse.body,
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => journalByDateResponse.body,
          };
        }

        if (urlStr.includes("/api/journal")) {
          requestedJournalUrls.push(urlStr);
          return {
            ok: true,
            status: 200,
            json: async () => ({ entries: [mockTodayEntry] }),
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        };
      })
    );
  });

  describe("Loading State", () => {
    it("renders an isolated loading skeleton while journal data is fetching without blocking dashboard", async () => {
      let resolveJournalFetch!: (val: any) => void;
      const deferredPromise = new Promise((resolve) => {
        resolveJournalFetch = resolve;
      });

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string) => {
          const urlStr = url.toString();
          if (urlStr.includes("/api/journal/by-date/")) {
            await deferredPromise;
            return {
              ok: true,
              status: 200,
              json: async () => ({ entry: mockTodayEntry }),
            };
          }
          if (urlStr.includes("/api/tasks")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({ tasks: mockTasks }),
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              user: { id: "user-1", name: "Alex Mercer", email: "alex@example.com" },
              projects: [],
              goals: [],
              habits: [],
            }),
          };
        })
      );

      render(<App />);

      // Dashboard tasks load and display immediately
      await waitFor(() => {
        expect(screen.getByText("Review quarterly goals")).toBeInTheDocument();
      });

      // Journal widget displays isolated skeleton loading state
      const loadingSkeleton = screen.getByRole("status", { name: "Loading journal" });
      expect(loadingSkeleton).toBeInTheDocument();

      // Resolve journal request
      resolveJournalFetch(null);

      // Widget transitions to loaded content
      await waitFor(() => {
        expect(screen.getByText("Morning Clarity & Strategy")).toBeInTheDocument();
      });
      expect(screen.queryByRole("status", { name: "Loading journal" })).not.toBeInTheDocument();
    });
  });

  describe("Entry Exists State", () => {
    it("displays title, short preview, and View journal CTA when today's entry exists", async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Today's Journal" })).toBeInTheDocument();
      });

      // Entry title appears
      expect(screen.getByText("Morning Clarity & Strategy")).toBeInTheDocument();

      // Written badge appears
      expect(screen.getByText("Written")).toBeInTheDocument();

      // Content preview appears
      const preview = document.querySelector(".dash-journal-preview");
      expect(preview).toBeInTheDocument();
      expect(preview?.textContent).toContain("Started the day with a focused walk");

      // View journal CTA exists
      const viewLink = screen.getByRole("link", { name: "View journal" });
      expect(viewLink).toBeInTheDocument();
      expect(viewLink).toHaveAttribute("href", "/journal");

      // Clicking View journal navigates to /journal
      fireEvent.click(viewLink);
      expect(window.location.pathname).toBe("/journal");
    });

    it("displays 'Untitled entry' when entry title is null or whitespace", async () => {
      journalByDateResponse = {
        ok: true,
        status: 200,
        body: {
          entry: {
            ...mockTodayEntry,
            title: null,
            content: "Just writing some quiet thoughts for the day without any specific header.",
          },
        },
      };

      render(
        <RouterProvider>
          <TodayJournalWidget />
        </RouterProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("Untitled entry")).toBeInTheDocument();
      });
      expect(screen.getByRole("link", { name: "View journal" })).toBeInTheDocument();
    });

    it("clicking the journal card itself navigates to /journal", async () => {
      render(
        <RouterProvider>
          <TodayJournalWidget />
        </RouterProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("Morning Clarity & Strategy")).toBeInTheDocument();
      });

      const card = document.querySelector(".dash-journal-card");
      expect(card).toBeInTheDocument();

      fireEvent.click(card!);
      expect(window.location.pathname).toBe("/journal");
    });
  });

  describe("No Entry State", () => {
    beforeEach(() => {
      journalByDateResponse = {
        ok: true,
        status: 200,
        body: { entry: null },
      };
    });

    it("displays empty reflection prompt and 'Write today's entry' CTA when entry does not exist", async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("You haven't written anything today.")).toBeInTheDocument();
      });

      const writeLink = screen.getByRole("link", { name: "Write today's entry" });
      expect(writeLink).toBeInTheDocument();
      expect(writeLink).toHaveAttribute("href", "/journal");

      // Clicking CTA navigates to /journal
      fireEvent.click(writeLink);
      expect(window.location.pathname).toBe("/journal");
    });

    it("empty state remains compact without giant illustration or excessive whitespace", async () => {
      render(
        <RouterProvider>
          <TodayJournalWidget />
        </RouterProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("You haven't written anything today.")).toBeInTheDocument();
      });

      const emptyContainer = document.querySelector(".dash-journal-empty");
      expect(emptyContainer).toBeInTheDocument();
      expect(emptyContainer).toHaveClass("dash-empty-compact");
    });
  });

  describe("API Error & Isolation", () => {
    beforeEach(() => {
      journalByDateResponse = {
        ok: false,
        status: 500,
        body: { error: "Database timeout", code: "INTERNAL_ERROR" },
      };
    });

    it("displays compact isolated error and does not break other dashboard panels", async () => {
      render(<App />);

      // Dashboard tasks, goals, etc. remain loaded and fully usable
      await waitFor(() => {
        expect(screen.getByText("Review quarterly goals")).toBeInTheDocument();
      });

      // Journal widget shows isolated error
      expect(screen.getByText("Journal unavailable")).toBeInTheDocument();
      // Raw internal server error is NEVER exposed
      expect(screen.queryByText("Database timeout")).not.toBeInTheDocument();
      expect(screen.queryByText("INTERNAL_ERROR")).not.toBeInTheDocument();

      // Retry button is available
      const retryBtn = screen.getByRole("button", { name: "Retry loading journal" });
      expect(retryBtn).toBeInTheDocument();
    });

    it("recovers gracefully when Retry button is clicked", async () => {
      render(
        <RouterProvider>
          <TodayJournalWidget />
        </RouterProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("Journal unavailable")).toBeInTheDocument();
      });

      // Now server heals
      journalByDateResponse = {
        ok: true,
        status: 200,
        body: { entry: mockTodayEntry },
      };

      const retryBtn = screen.getByRole("button", { name: "Retry loading journal" });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByText("Morning Clarity & Strategy")).toBeInTheDocument();
      });
      expect(screen.queryByText("Journal unavailable")).not.toBeInTheDocument();
    });
  });

  describe("Privacy & Content Safety", () => {
    it("truncates content preview to a short excerpt (<= 90 chars) and appends ellipsis", async () => {
      const veryLongContent =
        "This is an extremely long personal journal entry containing lots of intimate thoughts and reflections that should never be shown in full on the overview dashboard. It goes on and on and contains more than two hundred characters of detailed text.";

      journalByDateResponse = {
        ok: true,
        status: 200,
        body: {
          entry: {
            ...mockTodayEntry,
            content: veryLongContent,
          },
        },
      };

      render(
        <RouterProvider>
          <TodayJournalWidget />
        </RouterProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("Morning Clarity & Strategy")).toBeInTheDocument();
      });

      const previewElem = document.querySelector(".dash-journal-preview");
      expect(previewElem).toBeInTheDocument();
      const previewText = previewElem?.textContent || "";

      // Must be truncated
      expect(previewText.length).toBeLessThanOrEqual(92); // 90 chars + '…'
      expect(previewText.endsWith("…")).toBe(true);
      expect(previewText).not.toContain("more than two hundred characters");
    });

    it("renders HTML content as safe plain text without executing or rendering HTML tags", async () => {
      const maliciousOrHtmlContent =
        "<script>alert('xss')</script><b>Bold reflection text</b> with <img src=x onerror=alert(1)> elements.";

      journalByDateResponse = {
        ok: true,
        status: 200,
        body: {
          entry: {
            ...mockTodayEntry,
            content: maliciousOrHtmlContent,
          },
        },
      };

      render(
        <RouterProvider>
          <TodayJournalWidget />
        </RouterProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("Morning Clarity & Strategy")).toBeInTheDocument();
      });

      const previewElem = document.querySelector(".dash-journal-preview");
      // Tags should not be rendered as DOM nodes
      expect(previewElem?.querySelector("script")).toBeNull();
      expect(previewElem?.querySelector("b")).toBeNull();
      expect(previewElem?.querySelector("img")).toBeNull();
      // Content is rendered as literal text string
      expect(previewElem?.textContent).toContain("<script>");
      expect(previewElem?.textContent).toContain("<b>Bold reflection text</b>");
    });
  });

  describe("Date Handling & API Efficiency", () => {
    it("requests user's local calendar date YYYY-MM-DD and makes only the single required by-date request", async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Morning Clarity & Strategy")).toBeInTheDocument();
      });

      // Verified exact endpoint requested
      const expectedUrl = `/api/journal/by-date/${encodeURIComponent(localToday)}`;
      const matchingCalls = requestedJournalUrls.filter((u) => u.includes(expectedUrl));
      expect(matchingCalls.length).toBe(1);

      // Verified it did NOT fetch the full /api/journal timeline list
      const listCalls = requestedJournalUrls.filter(
        (u) => u.endsWith("/api/journal") || u.includes("/api/journal?")
      );
      expect(listCalls.length).toBe(0);
    });
  });
});
