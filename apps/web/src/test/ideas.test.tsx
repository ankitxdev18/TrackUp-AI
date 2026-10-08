import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { App } from "../App";
import { type Idea } from "../api/ideas";

describe("Milestone I04: Ideas Frontend Vertical Slice", () => {
  const mockActiveIdeas: Idea[] = [
    {
      id: "idea-1",
      userId: "user-1",
      title: "Local-first sync engine with SQLite and CRDTs",
      description: "Explore whether CRDT state convergence satisfies offline constraints without ballooning tombstone storage.",
      status: "ACTIVE",
      createdAt: "2026-10-07T12:00:00.000Z",
      updatedAt: "2026-10-07T12:00:00.000Z",
    },
    {
      id: "idea-2",
      userId: "user-1",
      title: "Ambient noise generator for focus sessions",
      description: null,
      status: "ACTIVE",
      createdAt: "2026-10-06T15:30:00.000Z",
      updatedAt: "2026-10-06T15:30:00.000Z",
    },
  ];

  const mockArchivedIdeas: Idea[] = [
    {
      id: "idea-archived-1",
      userId: "user-1",
      title: "Self-hosted bookmark syncing plugin",
      description: "Archived thought after finding standard browser bookmarks suffice.",
      status: "ARCHIVED",
      createdAt: "2026-09-20T10:00:00.000Z",
      updatedAt: "2026-09-25T11:00:00.000Z",
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, "", "/ideas");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setupDefaultFetchMock = (
    activeList: Idea[] = mockActiveIdeas,
    archivedList: Idea[] = mockArchivedIdeas
  ) => {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method || "GET").toUpperCase();

      if (url.includes("/api/ideas")) {
        if (method === "GET") {
          if (url.includes("status=ARCHIVED")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({ ideas: archivedList }),
            } as Response;
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ ideas: activeList }),
          } as Response;
        }

        if (method === "POST") {
          const body = JSON.parse(String(init?.body || "{}"));
          const created: Idea = {
            id: `idea-${Date.now()}`,
            userId: "user-1",
            title: body.title,
            description: body.description ?? null,
            status: "ACTIVE",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          return {
            ok: true,
            status: 201,
            json: async () => ({ idea: created }),
          } as Response;
        }

        if (method === "PATCH") {
          const body = JSON.parse(String(init?.body || "{}"));
          const parts = url.split("/");
          const id = parts[parts.length - 1].split("?")[0];
          const existing = [...activeList, ...archivedList].find((i) => i.id === id) || {
            id,
            userId: "user-1",
            title: "Existing Title",
            description: null,
            status: "ACTIVE",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          const updated: Idea = {
            ...existing,
            ...body,
            updatedAt: new Date().toISOString(),
          };
          return {
            ok: true,
            status: 200,
            json: async () => ({ idea: updated }),
          } as Response;
        }

        if (method === "DELETE") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, message: "Idea deleted successfully" }),
          } as Response;
        }
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response;
    });
  };

  // --------------------------------------------------
  // PAGE
  // --------------------------------------------------
  describe("PAGE", () => {
    it("1. /ideas renders successfully with heading and calm subtitle", async () => {
      setupDefaultFetchMock();
      render(<App />);

      expect(screen.getByRole("heading", { level: 1, name: "Ideas" })).toBeInTheDocument();
      expect(screen.getByText("A quiet space for thoughts worth keeping.")).toBeInTheDocument();
    });

    it("2. active tab is selected by default", async () => {
      setupDefaultFetchMock();
      render(<App />);

      const activeTab = screen.getByRole("tab", { name: /Active/i });
      expect(activeTab).toHaveAttribute("aria-selected", "true");
      expect(activeTab).toHaveClass("active");
    });

    it("3. archived tab works and switches selection", async () => {
      setupDefaultFetchMock();
      render(<App />);

      const archivedTab = screen.getByRole("tab", { name: /Archived/i });
      expect(archivedTab).toHaveAttribute("aria-selected", "false");

      fireEvent.click(archivedTab);

      await waitFor(() => {
        expect(archivedTab).toHaveAttribute("aria-selected", "true");
        expect(screen.getByText("Self-hosted bookmark syncing plugin")).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------
  // LOAD
  // --------------------------------------------------
  describe("LOAD", () => {
    it("4. active ideas are loaded on mount", async () => {
      setupDefaultFetchMock();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Local-first sync engine with SQLite and CRDTs")).toBeInTheDocument();
        expect(screen.getByText("Ambient noise generator for focus sessions")).toBeInTheDocument();
      });
    });

    it("5. archived ideas are loaded when switching to Archived tab", async () => {
      setupDefaultFetchMock();
      render(<App />);

      fireEvent.click(screen.getByRole("tab", { name: /Archived/i }));

      await waitFor(() => {
        expect(screen.getByText("Self-hosted bookmark syncing plugin")).toBeInTheDocument();
      });
    });

    it("6. loading state shows skeleton placeholders while fetching", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {})); // Never resolves
      render(<App />);

      expect(screen.getByLabelText("Loading ideas")).toBeInTheDocument();
      expect(document.querySelectorAll(".idea-skeleton-card").length).toBeGreaterThanOrEqual(2);
    });

    it("7. empty active state displays calm encouraging message", async () => {
      setupDefaultFetchMock([], []);
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("No ideas yet.")).toBeInTheDocument();
        expect(screen.getByText("Capture a thought before it disappears.")).toBeInTheDocument();
      });
    });

    it("8. empty archived state displays no archived ideas message", async () => {
      setupDefaultFetchMock([], []);
      render(<App />);

      fireEvent.click(screen.getByRole("tab", { name: /Archived/i }));

      await waitFor(() => {
        expect(screen.getByText("No archived ideas.")).toBeInTheDocument();
      });
    });

    it("9. load error displays friendly error state and provides retry", async () => {
      let callCount = 0;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/ideas")) {
          callCount++;
          if (callCount === 1) {
            return {
              ok: false,
              status: 500,
              json: async () => ({ error: "Server unavailable", code: "INTERNAL_SERVER_ERROR" }),
            } as Response;
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ ideas: mockActiveIdeas }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Unable to load your ideas")).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole("button", { name: /Retry loading ideas/i });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByText("Local-first sync engine with SQLite and CRDTs")).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------
  // CREATE
  // --------------------------------------------------
  describe("CREATE", () => {
    it("10. title is required for fast capture", async () => {
      setupDefaultFetchMock();
      render(<App />);

      const input = screen.getByPlaceholderText("What's on your mind?");
      fireEvent.change(input, { target: { value: "   " } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

      expect(screen.getByText("Title is required")).toBeInTheDocument();
    });

    it("11. successful creation immediately adds idea to Active list", async () => {
      setupDefaultFetchMock();
      render(<App />);

      const input = screen.getByPlaceholderText("What's on your mind?");
      fireEvent.change(input, { target: { value: "Graph visualization of user notes" } });

      const addBtn = screen.getByRole("button", { name: /Add idea/i });
      fireEvent.click(addBtn);

      await waitFor(() => {
        expect(screen.getByText("Graph visualization of user notes")).toBeInTheDocument();
        expect(input).toHaveValue("");
      });
    });

    it("12. description is optional and can be captured via expanded form", async () => {
      setupDefaultFetchMock();
      render(<App />);

      const addDetailsBtn = screen.getByRole("button", { name: /Add details/i });
      fireEvent.click(addDetailsBtn);

      expect(screen.getByLabelText(/Title/i)).toBeInTheDocument();
      const descInput = screen.getByLabelText(/Description/i);
      expect(descInput).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: "Detailed Idea" } });
      fireEvent.change(descInput, { target: { value: "Here is extra context for this thought." } });

      fireEvent.click(screen.getByRole("button", { name: /Save idea/i }));

      await waitFor(() => {
        expect(screen.getByText("Detailed Idea")).toBeInTheDocument();
        expect(screen.getByText("Here is extra context for this thought.")).toBeInTheDocument();
      });
    });

    it("13. title length validation enforces 255 character limit", async () => {
      setupDefaultFetchMock();
      render(<App />);

      const longTitle = "A".repeat(256);
      const input = screen.getByPlaceholderText("What's on your mind?");
      // Trigger validation
      fireEvent.change(input, { target: { value: longTitle } });
      fireEvent.click(screen.getByRole("button", { name: /Add details/i }));

      fireEvent.click(screen.getByRole("button", { name: /Save idea/i }));

      expect(screen.getByText("Title must not exceed 255 characters")).toBeInTheDocument();
    });

    it("14. description length validation enforces 5000 character limit", async () => {
      setupDefaultFetchMock();
      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: /Add details/i }));

      fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: "Valid Title" } });
      fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: "D".repeat(5001) } });

      fireEvent.click(screen.getByRole("button", { name: /Save idea/i }));

      expect(screen.getByText("Description must not exceed 5,000 characters")).toBeInTheDocument();
    });

    it("15. surfaces create API error without dropping form input", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = (init?.method || "GET").toUpperCase();
        if (url.includes("/api/ideas")) {
          if (method === "GET") {
            return {
              ok: true,
              status: 200,
              json: async () => ({ ideas: [] }),
            } as Response;
          }
          if (method === "POST") {
            return {
              ok: false,
              status: 400,
              json: async () => ({
                error: "Title cannot be empty after trimming",
                code: "VALIDATION_ERROR",
              }),
            } as Response;
          }
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      const input = screen.getByPlaceholderText("What's on your mind?");
      fireEvent.change(input, { target: { value: "Test idea" } });
      fireEvent.click(screen.getByRole("button", { name: /Add idea/i }));

      await waitFor(() => {
        expect(screen.getByText("Title cannot be empty after trimming")).toBeInTheDocument();
        expect(input).toHaveValue("Test idea");
      });
    });

    it("16. duplicate submission is prevented while submitting", async () => {
      let resolvePost: (value: Response) => void;
      const postPromise = new Promise<Response>((resolve) => {
        resolvePost = resolve;
      });

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = (init?.method || "GET").toUpperCase();
        if (url.includes("/api/ideas")) {
          if (method === "GET") {
            return {
              ok: true,
              status: 200,
              json: async () => ({ ideas: [] }),
            } as Response;
          }
          if (method === "POST") {
            return postPromise;
          }
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      const input = screen.getByPlaceholderText("What's on your mind?");
      fireEvent.change(input, { target: { value: "Concurrent test" } });

      const submitBtn = screen.getByRole("button", { name: /Add idea/i });
      fireEvent.click(submitBtn);

      expect(submitBtn).toBeDisabled();

      resolvePost!({
        ok: true,
        status: 201,
        json: async () => ({
          idea: {
            id: "concurrent-1",
            userId: "user-1",
            title: "Concurrent test",
            description: null,
            status: "ACTIVE",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
      } as Response);

      await waitFor(() => {
        expect(screen.getByText("Concurrent test")).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------
  // DISPLAY
  // --------------------------------------------------
  describe("DISPLAY", () => {
    it("17. title is rendered properly in card", async () => {
      setupDefaultFetchMock();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Local-first sync engine with SQLite and CRDTs")).toBeInTheDocument();
      });
    });

    it("18. description preview is rendered when present and omitted when null", async () => {
      setupDefaultFetchMock();
      render(<App />);

      await waitFor(() => {
        expect(
          screen.getByText(
            "Explore whether CRDT state convergence satisfies offline constraints without ballooning tombstone storage."
          )
        ).toBeInTheDocument();
      });

      const cardWithoutDesc = screen.getByRole("article", {
        name: "Ambient noise generator for focus sessions",
      });
      expect(cardWithoutDesc.querySelector(".idea-card-description")).toBeNull();
    });

    it("19. server-created createdAt date is rendered", async () => {
      setupDefaultFetchMock();
      render(<App />);

      await waitFor(() => {
        const timeElement = document.querySelector("time.idea-card-date");
        expect(timeElement).toBeInTheDocument();
        expect(timeElement?.textContent).toMatch(/Oct 7, 2026|7 Oct 2026|2026/);
      });
    });

    it("20. Unicode characters render safely", async () => {
      const unicodeIdea: Idea = {
        id: "unicode-1",
        userId: "user-1",
        title: "✨ 思想 Spark: 日本語 and Arabic العربية and emojis 🚀",
        description: "Testing UTF-8 encoding: π ≈ 3.14159, ñ, é, ü, 🧠💡",
        status: "ACTIVE",
        createdAt: "2026-10-07T12:00:00.000Z",
        updatedAt: "2026-10-07T12:00:00.000Z",
      };

      setupDefaultFetchMock([unicodeIdea]);
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("✨ 思想 Spark: 日本語 and Arabic العربية and emojis 🚀")).toBeInTheDocument();
        expect(screen.getByText("Testing UTF-8 encoding: π ≈ 3.14159, ñ, é, ü, 🧠💡")).toBeInTheDocument();
      });
    });

    it("21. HTML tags render strictly as plain text without execution", async () => {
      const maliciousIdea: Idea = {
        id: "xss-1",
        userId: "user-1",
        title: "<script>alert('xss-title')</script><b>Bold Title</b>",
        description: "<img src='x' onerror='alert(\"xss-desc\")'><i>Italic</i>",
        status: "ACTIVE",
        createdAt: "2026-10-07T12:00:00.000Z",
        updatedAt: "2026-10-07T12:00:00.000Z",
      };

      setupDefaultFetchMock([maliciousIdea]);
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("<script>alert('xss-title')</script><b>Bold Title</b>")).toBeInTheDocument();
        expect(
          screen.getByText("<img src='x' onerror='alert(\"xss-desc\")'><i>Italic</i>")
        ).toBeInTheDocument();
      });

      // Verify no script or img tags were injected into DOM
      expect(document.querySelector("script[src*='xss']")).toBeNull();
      expect(document.querySelector("img[onerror]")).toBeNull();
    });
  });

  // --------------------------------------------------
  // EDIT
  // --------------------------------------------------
  describe("EDIT", () => {
    it("22. edit button opens compact editor with populated values", async () => {
      setupDefaultFetchMock();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Local-first sync engine with SQLite and CRDTs")).toBeInTheDocument();
      });

      const editBtn = screen.getByRole("button", {
        name: "Edit Local-first sync engine with SQLite and CRDTs",
      });
      fireEvent.click(editBtn);

      expect(screen.getByRole("heading", { name: "Edit Idea" })).toBeInTheDocument();
      expect(screen.getByLabelText(/Title/i)).toHaveValue(
        "Local-first sync engine with SQLite and CRDTs"
      );
      expect(screen.getByLabelText(/Description/i)).toHaveValue(
        "Explore whether CRDT state convergence satisfies offline constraints without ballooning tombstone storage."
      );
    });

    it("23. can update title in editor", async () => {
      setupDefaultFetchMock();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Ambient noise generator for focus sessions")).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole("button", { name: "Edit Ambient noise generator for focus sessions" })
      );

      const titleInput = screen.getByLabelText(/Title/i);
      fireEvent.change(titleInput, { target: { value: "Brown noise soundscape engine" } });
      fireEvent.click(screen.getByRole("button", { name: /Save Changes/i }));

      await waitFor(() => {
        expect(screen.getByText("Brown noise soundscape engine")).toBeInTheDocument();
      });
    });

    it("24. can update description in editor", async () => {
      setupDefaultFetchMock();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Ambient noise generator for focus sessions")).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole("button", { name: "Edit Ambient noise generator for focus sessions" })
      );

      const descInput = screen.getByLabelText(/Description/i);
      fireEvent.change(descInput, { target: { value: "Synthesize pink and brown noise using Web Audio API." } });
      fireEvent.click(screen.getByRole("button", { name: /Save Changes/i }));

      await waitFor(() => {
        expect(screen.getByText("Synthesize pink and brown noise using Web Audio API.")).toBeInTheDocument();
      });
    });

    it("25. successful save updates local record and closes modal", async () => {
      setupDefaultFetchMock();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Ambient noise generator for focus sessions")).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole("button", { name: "Edit Ambient noise generator for focus sessions" })
      );

      fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: "Updated Title" } });
      fireEvent.click(screen.getByRole("button", { name: /Save Changes/i }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.getByText("Updated Title")).toBeInTheDocument();
      });
    });

    it("26. handles save error and surfaces friendly message in modal", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = (init?.method || "GET").toUpperCase();
        if (url.includes("/api/ideas")) {
          if (method === "GET") {
            return {
              ok: true,
              status: 200,
              json: async () => ({ ideas: mockActiveIdeas }),
            } as Response;
          }
          if (method === "PATCH") {
            return {
              ok: false,
              status: 500,
              json: async () => ({ error: "Database timeout", code: "DB_ERROR" }),
            } as Response;
          }
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Ambient noise generator for focus sessions")).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole("button", { name: "Edit Ambient noise generator for focus sessions" })
      );

      fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: "New Title" } });
      fireEvent.click(screen.getByRole("button", { name: /Save Changes/i }));

      await waitFor(() => {
        expect(screen.getByText("Database timeout")).toBeInTheDocument();
      });
    });

    it("27. shows pending state while save is in-flight", async () => {
      let resolvePatch: (value: Response) => void;
      const patchPromise = new Promise<Response>((resolve) => {
        resolvePatch = resolve;
      });

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = (init?.method || "GET").toUpperCase();
        if (url.includes("/api/ideas")) {
          if (method === "GET") {
            return {
              ok: true,
              status: 200,
              json: async () => ({ ideas: mockActiveIdeas }),
            } as Response;
          }
          if (method === "PATCH") {
            return patchPromise;
          }
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Ambient noise generator for focus sessions")).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole("button", { name: "Edit Ambient noise generator for focus sessions" })
      );

      fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: "Saving test" } });
      const saveBtn = screen.getByRole("button", { name: /Save Changes/i });
      fireEvent.click(saveBtn);

      expect(screen.getByText("Saving...")).toBeInTheDocument();
      expect(saveBtn).toBeDisabled();

      resolvePatch!({
        ok: true,
        status: 200,
        json: async () => ({
          idea: { ...mockActiveIdeas[1], title: "Saving test" },
        }),
      } as Response);

      await waitFor(() => {
        expect(screen.getByText("Saving test")).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------
  // ARCHIVE
  // --------------------------------------------------
  describe("ARCHIVE", () => {
    it("28. archive action sends PATCH with status ARCHIVED", async () => {
      let patchPayload: any = null;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = (init?.method || "GET").toUpperCase();
        if (url.includes("/api/ideas")) {
          if (method === "GET") {
            return {
              ok: true,
              status: 200,
              json: async () => ({ ideas: mockActiveIdeas }),
            } as Response;
          }
          if (method === "PATCH") {
            patchPayload = JSON.parse(String(init?.body || "{}"));
            return {
              ok: true,
              status: 200,
              json: async () => ({
                idea: { ...mockActiveIdeas[1], status: "ARCHIVED" },
              }),
            } as Response;
          }
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Ambient noise generator for focus sessions")).toBeInTheDocument();
      });

      const archiveBtn = screen.getByRole("button", {
        name: "Archive Ambient noise generator for focus sessions",
      });
      fireEvent.click(archiveBtn);

      await waitFor(() => {
        expect(patchPayload).toEqual({ status: "ARCHIVED" });
      });
    });

    it("29. archived item is removed from active list without page reload", async () => {
      setupDefaultFetchMock();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Ambient noise generator for focus sessions")).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole("button", {
          name: "Archive Ambient noise generator for focus sessions",
        })
      );

      await waitFor(() => {
        expect(
          screen.queryByText("Ambient noise generator for focus sessions")
        ).toBeNull();
      });
    });

    it("30. archive failure displays user-friendly error banner", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = (init?.method || "GET").toUpperCase();
        if (url.includes("/api/ideas")) {
          if (method === "GET") {
            return {
              ok: true,
              status: 200,
              json: async () => ({ ideas: mockActiveIdeas }),
            } as Response;
          }
          if (method === "PATCH") {
            return {
              ok: false,
              status: 500,
              json: async () => ({ error: "Server archive error" }),
            } as Response;
          }
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Ambient noise generator for focus sessions")).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole("button", {
          name: "Archive Ambient noise generator for focus sessions",
        })
      );

      await waitFor(() => {
        expect(screen.getByText("Server archive error")).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------
  // RESTORE
  // --------------------------------------------------
  describe("RESTORE", () => {
    it("31. restore action sends PATCH with status ACTIVE", async () => {
      let patchPayload: any = null;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = (init?.method || "GET").toUpperCase();
        if (url.includes("/api/ideas")) {
          if (method === "GET") {
            return {
              ok: true,
              status: 200,
              json: async () => ({ ideas: mockArchivedIdeas }),
            } as Response;
          }
          if (method === "PATCH") {
            patchPayload = JSON.parse(String(init?.body || "{}"));
            return {
              ok: true,
              status: 200,
              json: async () => ({
                idea: { ...mockArchivedIdeas[0], status: "ACTIVE" },
              }),
            } as Response;
          }
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      fireEvent.click(screen.getByRole("tab", { name: /Archived/i }));

      await waitFor(() => {
        expect(screen.getByText("Self-hosted bookmark syncing plugin")).toBeInTheDocument();
      });

      const restoreBtn = screen.getByRole("button", {
        name: "Restore Self-hosted bookmark syncing plugin",
      });
      fireEvent.click(restoreBtn);

      await waitFor(() => {
        expect(patchPayload).toEqual({ status: "ACTIVE" });
      });
    });

    it("32. restored item is removed from archived list", async () => {
      setupDefaultFetchMock();
      render(<App />);

      fireEvent.click(screen.getByRole("tab", { name: /Archived/i }));

      await waitFor(() => {
        expect(screen.getByText("Self-hosted bookmark syncing plugin")).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole("button", {
          name: "Restore Self-hosted bookmark syncing plugin",
        })
      );

      await waitFor(() => {
        expect(
          screen.queryByText("Self-hosted bookmark syncing plugin")
        ).toBeNull();
      });
    });

    it("33. restore failure displays friendly error banner", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = (init?.method || "GET").toUpperCase();
        if (url.includes("/api/ideas")) {
          if (method === "GET") {
            return {
              ok: true,
              status: 200,
              json: async () => ({ ideas: mockArchivedIdeas }),
            } as Response;
          }
          if (method === "PATCH") {
            return {
              ok: false,
              status: 500,
              json: async () => ({ error: "Server restore failure" }),
            } as Response;
          }
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      fireEvent.click(screen.getByRole("tab", { name: /Archived/i }));

      await waitFor(() => {
        expect(screen.getByText("Self-hosted bookmark syncing plugin")).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole("button", {
          name: "Restore Self-hosted bookmark syncing plugin",
        })
      );

      await waitFor(() => {
        expect(screen.getByText("Server restore failure")).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------
  // DELETE
  // --------------------------------------------------
  describe("DELETE", () => {
    it("34. delete button opens confirmation modal with title and permanent warning", async () => {
      setupDefaultFetchMock();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Ambient noise generator for focus sessions")).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole("button", {
          name: "Delete Ambient noise generator for focus sessions",
        })
      );

      expect(screen.getByRole("heading", { name: "Delete Idea" })).toBeInTheDocument();
      expect(screen.getByText(/This permanently deletes this idea/i)).toBeInTheDocument();
      expect(
        screen.getByText('"Ambient noise generator for focus sessions"')
      ).toBeInTheDocument();
    });

    it("35. cancel deletion closes modal without deleting", async () => {
      setupDefaultFetchMock();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Ambient noise generator for focus sessions")).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole("button", {
          name: "Delete Ambient noise generator for focus sessions",
        })
      );

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.getByText("Ambient noise generator for focus sessions")).toBeInTheDocument();
      });
    });

    it("36. confirm deletion calls DELETE API endpoint", async () => {
      let deletedId: string | null = null;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = (init?.method || "GET").toUpperCase();
        if (url.includes("/api/ideas")) {
          if (method === "GET") {
            return {
              ok: true,
              status: 200,
              json: async () => ({ ideas: mockActiveIdeas }),
            } as Response;
          }
          if (method === "DELETE") {
            const parts = url.split("/");
            deletedId = parts[parts.length - 1];
            return {
              ok: true,
              status: 200,
              json: async () => ({ success: true }),
            } as Response;
          }
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Ambient noise generator for focus sessions")).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole("button", {
          name: "Delete Ambient noise generator for focus sessions",
        })
      );

      fireEvent.click(screen.getByRole("button", { name: "Delete Idea" }));

      await waitFor(() => {
        expect(deletedId).toBe("idea-2");
      });
    });

    it("37. deleted item is removed from current list and closes confirmation", async () => {
      setupDefaultFetchMock();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Ambient noise generator for focus sessions")).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole("button", {
          name: "Delete Ambient noise generator for focus sessions",
        })
      );

      fireEvent.click(screen.getByRole("button", { name: "Delete Idea" }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(
          screen.queryByText("Ambient noise generator for focus sessions")
        ).toBeNull();
      });
    });

    it("38. delete failure surfaces error message in confirmation dialog", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = (init?.method || "GET").toUpperCase();
        if (url.includes("/api/ideas")) {
          if (method === "GET") {
            return {
              ok: true,
              status: 200,
              json: async () => ({ ideas: mockActiveIdeas }),
            } as Response;
          }
          if (method === "DELETE") {
            return {
              ok: false,
              status: 500,
              json: async () => ({ error: "Database locked", code: "LOCKED" }),
            } as Response;
          }
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Ambient noise generator for focus sessions")).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole("button", {
          name: "Delete Ambient noise generator for focus sessions",
        })
      );

      fireEvent.click(screen.getByRole("button", { name: "Delete Idea" }));

      await waitFor(() => {
        expect(screen.getByText("Database locked")).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------
  // SECURITY
  // --------------------------------------------------
  describe("SECURITY", () => {
    it("39. contains no dangerouslySetInnerHTML attributes in source or DOM", async () => {
      setupDefaultFetchMock();
      const { container } = render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Local-first sync engine with SQLite and CRDTs")).toBeInTheDocument();
      });

      expect(container.querySelectorAll("[dangerouslysetinnerhtml]").length).toBe(0);
    });

    it("40. does not execute raw HTML or scripts in user input", async () => {
      const malicious: Idea = {
        id: "evil-1",
        userId: "user-1",
        title: "<script>window.__xssRun = true;</script>",
        description: "<img src='invalid' onerror='window.__imgXss = true;'>",
        status: "ACTIVE",
        createdAt: "2026-10-07T12:00:00.000Z",
        updatedAt: "2026-10-07T12:00:00.000Z",
      };

      setupDefaultFetchMock([malicious]);
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("<script>window.__xssRun = true;</script>")).toBeInTheDocument();
      });

      expect((window as any).__xssRun).toBeUndefined();
      expect((window as any).__imgXss).toBeUndefined();
    });
  });

  // --------------------------------------------------
  // ACCESSIBILITY
  // --------------------------------------------------
  describe("ACCESSIBILITY", () => {
    it("41. keyboard-accessible fast capture submits with Enter key", async () => {
      setupDefaultFetchMock();
      render(<App />);

      const input = screen.getByPlaceholderText("What's on your mind?");
      fireEvent.change(input, { target: { value: "Keyboard captured idea" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

      await waitFor(() => {
        expect(screen.getByText("Keyboard captured idea")).toBeInTheDocument();
      });
    });

    it("42. modal accessibility: Escape key dismisses modals", async () => {
      setupDefaultFetchMock();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Ambient noise generator for focus sessions")).toBeInTheDocument();
      });

      // Open Edit modal
      fireEvent.click(
        screen.getByRole("button", { name: "Edit Ambient noise generator for focus sessions" })
      );
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      // Press Escape
      fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
    });

    it("43. action buttons have descriptive accessible names", async () => {
      setupDefaultFetchMock();
      render(<App />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", {
            name: "Edit Local-first sync engine with SQLite and CRDTs",
          })
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", {
            name: "Archive Local-first sync engine with SQLite and CRDTs",
          })
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", {
            name: "Delete Local-first sync engine with SQLite and CRDTs",
          })
        ).toBeInTheDocument();
      });
    });

    it("44. empty state focus action focuses the capture input", async () => {
      setupDefaultFetchMock([], []);
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("No ideas yet.")).toBeInTheDocument();
      });

      const captureBtn = screen.getByRole("button", { name: /Capture a thought/i });
      fireEvent.click(captureBtn);

      const input = screen.getByPlaceholderText("What's on your mind?");
      await waitFor(() => {
        expect(document.activeElement).toBe(input);
      });
    });
  });

  // --------------------------------------------------
  // RESPONSIVE & NAVIGATION
  // --------------------------------------------------
  describe("RESPONSIVE & NAVIGATION", () => {
    it("45. mobile layout provides Ideas inside More navigation drawer", async () => {
      setupDefaultFetchMock();
      render(<App />);

      // Find Mobile More trigger button
      const moreBtn = document.querySelector(".btn-more-trigger") as HTMLElement;
      expect(moreBtn).toBeInTheDocument();
      fireEvent.click(moreBtn);

      // Verify Ideas link in drawer
      const drawerIdeasLink = document.querySelector(".more-drawer-nav .drawer-nav-item[href='/ideas']");
      expect(drawerIdeasLink).toBeInTheDocument();
      expect(drawerIdeasLink).toHaveTextContent("Ideas");

      // Clicking link closes drawer
      fireEvent.click(drawerIdeasLink!);
      expect(document.querySelector(".more-drawer-backdrop")).toBeNull();
    });

    it("46. desktop sidebar renders Ideas link with active highlight on /ideas", async () => {
      setupDefaultFetchMock();
      render(<App />);

      // Breadcrumb in header shows Ideas
      expect(screen.getByText("Ideas", { selector: ".breadcrumb-current" })).toBeInTheDocument();

      // Sidebar link for Ideas is active
      const sidebarIdeasLink = document.querySelector(".shell-sidebar .nav-item[href='/ideas']");
      expect(sidebarIdeasLink).toBeInTheDocument();
      expect(sidebarIdeasLink).toHaveClass("active");
      expect(sidebarIdeasLink).toHaveAttribute("aria-current", "page");

      // Verify persistent mobile bottom nav STILL has exactly 5 items
      const mobileNav = document.querySelector(".mobile-nav");
      expect(mobileNav).toBeInTheDocument();
      expect(mobileNav?.children.length).toBe(5);
    });
  });

  // --------------------------------------------------
  // HARDENING & CONCURRENCY
  // --------------------------------------------------
  describe("HARDENING & CONCURRENCY", () => {
    it("47. double-clicking archive action does not produce duplicate PATCH requests", async () => {
      let patchCount = 0;
      let resolvePatch: (value: Response) => void;
      const patchPromise = new Promise<Response>((resolve) => {
        resolvePatch = resolve;
      });

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = (init?.method || "GET").toUpperCase();
        if (url.includes("/api/ideas")) {
          if (method === "GET") {
            return {
              ok: true,
              status: 200,
              json: async () => ({ ideas: mockActiveIdeas }),
            } as Response;
          }
          if (method === "PATCH") {
            patchCount++;
            return patchPromise;
          }
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Ambient noise generator for focus sessions")).toBeInTheDocument();
      });

      const archiveBtn = screen.getByRole("button", {
        name: "Archive Ambient noise generator for focus sessions",
      });

      // Rapid double click
      fireEvent.click(archiveBtn);
      fireEvent.click(archiveBtn);

      expect(patchCount).toBe(1);

      resolvePatch!({
        ok: true,
        status: 200,
        json: async () => ({
          idea: { ...mockActiveIdeas[1], status: "ARCHIVED" },
        }),
      } as Response);

      await waitFor(() => {
        expect(
          screen.queryByText("Ambient noise generator for focus sessions")
        ).toBeNull();
      });
    });

    it("48. double-clicking confirm delete does not trigger duplicate DELETE requests", async () => {
      let deleteCount = 0;
      let resolveDelete: (value: Response) => void;
      const deletePromise = new Promise<Response>((resolve) => {
        resolveDelete = resolve;
      });

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        const method = (init?.method || "GET").toUpperCase();
        if (url.includes("/api/ideas")) {
          if (method === "GET") {
            return {
              ok: true,
              status: 200,
              json: async () => ({ ideas: mockActiveIdeas }),
            } as Response;
          }
          if (method === "DELETE") {
            deleteCount++;
            return deletePromise;
          }
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Ambient noise generator for focus sessions")).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole("button", {
          name: "Delete Ambient noise generator for focus sessions",
        })
      );

      const confirmDeleteBtn = screen.getByRole("button", { name: "Delete Idea" });

      // Rapid double click
      fireEvent.click(confirmDeleteBtn);
      fireEvent.click(confirmDeleteBtn);

      expect(deleteCount).toBe(1);

      resolveDelete!({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as Response);

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
    });

    it("49. rapid tab switching settles cleanly on currently selected tab without race conditions", async () => {
      setupDefaultFetchMock();
      render(<App />);

      const activeTab = screen.getByRole("tab", { name: /Active/i });
      const archivedTab = screen.getByRole("tab", { name: /Archived/i });

      // Click rapidly back and forth
      fireEvent.click(archivedTab);
      fireEvent.click(activeTab);
      fireEvent.click(archivedTab);

      await waitFor(() => {
        expect(archivedTab).toHaveAttribute("aria-selected", "true");
        expect(screen.getByText("Self-hosted bookmark syncing plugin")).toBeInTheDocument();
      });
    });

    it("50. unauthenticated session error (HTTP 401) surfaces friendly error without crashing page", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/ideas")) {
          return {
            ok: false,
            status: 401,
            json: async () => ({ error: "Authentication required", code: "UNAUTHENTICATED" }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Unable to load your ideas")).toBeInTheDocument();
        expect(screen.getByText("Authentication required")).toBeInTheDocument();
      });
    });
  });
});
