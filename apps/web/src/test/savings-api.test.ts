import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addSavingsContribution,
  createSavingsGoal,
  fetchActiveSavingsGoal,
  fetchSavingsContributions,
  formatSavingsPaise,
  isPaiseSafeInteger,
  SavingsApiError,
  toSafePaise,
  updateSavingsGoalStatus,
  type ActiveSavingsGoal,
  type AddContributionResponse,
  type ListContributionsResponse,
  type UpdateGoalStatusResponse,
} from "../api/savings";

describe("Savings Frontend API Client (Milestone 5.4C)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ========================================================
  // 1. ACTIVE GOAL RETRIEVAL
  // ========================================================
  describe("fetchActiveSavingsGoal", () => {
    it("returns the active savings goal when one exists", async () => {
      const mockGoal: ActiveSavingsGoal = {
        id: "goal-1",
        name: "Emergency Fund",
        targetAmountCents: 5000000,
        status: "ACTIVE",
        savedAmountCents: 1500000,
        remainingAmountCents: 3500000,
        progressPercent: 30.0,
        contributionCount: 1,
        createdAt: "2026-10-12T10:00:00.000Z",
        updatedAt: "2026-10-12T10:00:00.000Z",
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ goal: mockGoal }),
      } as Response);

      const result = await fetchActiveSavingsGoal();

      expect(globalThis.fetch).toHaveBeenCalledWith("/api/savings/active", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      expect(result).toEqual(mockGoal);
    });

    it("returns null when user has no active savings goal", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ goal: null }),
      } as Response);

      const result = await fetchActiveSavingsGoal();
      expect(result).toBeNull();
    });

    it("throws SavingsApiError on HTTP 401 unauthenticated", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Authentication required", code: "UNAUTHENTICATED" }),
      } as Response);

      await expect(fetchActiveSavingsGoal()).rejects.toThrow(SavingsApiError);
      await expect(fetchActiveSavingsGoal()).rejects.toMatchObject({
        statusCode: 401,
        code: "UNAUTHENTICATED",
        message: "Authentication required",
      });
    });

    it("handles non-JSON error response from server", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error("Invalid JSON");
        },
      } as unknown as Response);

      await expect(fetchActiveSavingsGoal()).rejects.toThrow(
        "Failed to retrieve active savings goal"
      );
    });
  });

  // ========================================================
  // 2. SAVINGS GOAL CREATION
  // ========================================================
  describe("createSavingsGoal", () => {
    it("creates a new active savings goal successfully", async () => {
      const mockCreated: ActiveSavingsGoal = {
        id: "goal-new",
        name: "Goa Trip",
        targetAmountCents: 2000000,
        status: "ACTIVE",
        savedAmountCents: 0,
        remainingAmountCents: 2000000,
        progressPercent: 0,
        contributionCount: 0,
        createdAt: "2026-10-12T12:00:00.000Z",
        updatedAt: "2026-10-12T12:00:00.000Z",
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ goal: mockCreated }),
      } as Response);

      const result = await createSavingsGoal({
        name: "Goa Trip",
        targetAmountCents: 2000000,
      });

      expect(globalThis.fetch).toHaveBeenCalledWith("/api/savings", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ name: "Goa Trip", targetAmountCents: 2000000 }),
      });
      expect(result).toEqual(mockCreated);
    });

    it("throws SavingsApiError with ACTIVE_GOAL_EXISTS on 409 conflict", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: "An active savings goal already exists. Complete or archive it before creating a new one.",
          code: "ACTIVE_GOAL_EXISTS",
        }),
      } as Response);

      await expect(
        createSavingsGoal({ name: "Duplicate Goal", targetAmountCents: 100000 })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "ACTIVE_GOAL_EXISTS",
      });
    });

    it("surfaces validation error details from 400 response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: "Invalid savings goal data",
          code: "VALIDATION_ERROR",
          details: [{ field: "name", message: "Name cannot be empty" }],
        }),
      } as Response);

      await expect(
        createSavingsGoal({ name: "", targetAmountCents: 100000 })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Name cannot be empty",
      });
    });
  });

  // ========================================================
  // 3. ADD CONTRIBUTION
  // ========================================================
  describe("addSavingsContribution", () => {
    it("submits contribution and returns updated goal summary", async () => {
      const mockResponse: AddContributionResponse = {
        contribution: {
          id: "contrib-1",
          savingsGoalId: "goal-1",
          userId: "user-1",
          amountCents: 50000,
          note: "Weekly deposit",
          createdAt: "2026-10-12T14:00:00.000Z",
        },
        goal: {
          id: "goal-1",
          name: "Emergency Fund",
          targetAmountCents: 5000000,
          status: "ACTIVE",
          savedAmountCents: 50000,
          remainingAmountCents: 4950000,
          progressPercent: 1.0,
          contributionCount: 1,
          updatedAt: "2026-10-12T14:00:00.000Z",
        },
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const result = await addSavingsContribution("goal-1", {
        amountCents: 50000,
        note: "Weekly deposit",
      });

      expect(globalThis.fetch).toHaveBeenCalledWith("/api/savings/goal-1/contributions", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ amountCents: 50000, note: "Weekly deposit" }),
      });
      expect(result).toEqual(mockResponse);
    });

    it("handles 400 INVALID_GOAL_STATUS when contributing to completed/archived goal", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: "Cannot contribute to a completed savings goal",
          code: "INVALID_GOAL_STATUS",
        }),
      } as Response);

      await expect(
        addSavingsContribution("goal-1", { amountCents: 1000 })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "INVALID_GOAL_STATUS",
      });
    });

    it("handles 404 NOT_FOUND for non-existent or unowned goal", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          error: "Savings goal not found",
          code: "NOT_FOUND",
        }),
      } as Response);

      await expect(
        addSavingsContribution("foreign-goal", { amountCents: 1000 })
      ).rejects.toMatchObject({
        statusCode: 404,
        code: "NOT_FOUND",
      });
    });
  });

  // ========================================================
  // 4. CONTRIBUTION HISTORY
  // ========================================================
  describe("fetchSavingsContributions", () => {
    it("retrieves paginated contribution list with query parameters", async () => {
      const mockList: ListContributionsResponse = {
        contributions: [
          {
            id: "contrib-2",
            savingsGoalId: "goal-1",
            userId: "user-1",
            amountCents: 100000,
            note: "Second deposit",
            createdAt: "2026-10-12T15:00:00.000Z",
          },
          {
            id: "contrib-1",
            savingsGoalId: "goal-1",
            userId: "user-1",
            amountCents: 50000,
            note: "First deposit",
            createdAt: "2026-10-12T14:00:00.000Z",
          },
        ],
        total: 2,
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockList,
      } as Response);

      const result = await fetchSavingsContributions("goal-1", { limit: 10, offset: 0 });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/savings/goal-1/contributions?limit=10&offset=0",
        {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
        }
      );
      expect(result).toEqual(mockList);
    });

    it("retrieves contribution history without query parameters", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ contributions: [], total: 0 }),
      } as Response);

      await fetchSavingsContributions("goal-1");

      expect(globalThis.fetch).toHaveBeenCalledWith("/api/savings/goal-1/contributions", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
    });
  });

  // ========================================================
  // 5. UPDATE GOAL STATUS (COMPLETE / ARCHIVE)
  // ========================================================
  describe("updateSavingsGoalStatus", () => {
    it("completes a savings goal", async () => {
      const mockUpdated: UpdateGoalStatusResponse = {
        goal: {
          id: "goal-1",
          userId: "user-1",
          name: "Emergency Fund",
          targetAmountCents: 5000000,
          status: "COMPLETED",
          createdAt: "2026-10-12T10:00:00.000Z",
          updatedAt: "2026-10-12T16:00:00.000Z",
        },
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockUpdated,
      } as Response);

      const result = await updateSavingsGoalStatus("goal-1", "COMPLETED");

      expect(globalThis.fetch).toHaveBeenCalledWith("/api/savings/goal-1/status", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      expect(result).toEqual(mockUpdated);
    });

    it("archives a savings goal", async () => {
      const mockUpdated: UpdateGoalStatusResponse = {
        goal: {
          id: "goal-1",
          userId: "user-1",
          name: "Old Goal",
          targetAmountCents: 1000000,
          status: "ARCHIVED",
          createdAt: "2026-10-12T10:00:00.000Z",
          updatedAt: "2026-10-12T16:00:00.000Z",
        },
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockUpdated,
      } as Response);

      const result = await updateSavingsGoalStatus("goal-1", "ARCHIVED");
      expect(result.goal.status).toBe("ARCHIVED");
    });
  });

  // ========================================================
  // 6. MONETARY PRECISION & FORMATTING HELPERS
  // ========================================================
  describe("Monetary precision and formatting utilities", () => {
    it("toSafePaise converts numbers and strings accurately to BigInt", () => {
      expect(toSafePaise(15000)).toBe(15000n);
      expect(toSafePaise("15000")).toBe(15000n);
      expect(toSafePaise(0)).toBe(0n);
      expect(toSafePaise("-500")).toBe(-500n);
      expect(toSafePaise("9007199254740992")).toBe(9007199254740992n);
    });

    it("toSafePaise rejects invalid numeric strings", () => {
      expect(() => toSafePaise("abc")).toThrow(TypeError);
      expect(() => toSafePaise("12.34")).toThrow(TypeError);
    });

    it("isPaiseSafeInteger detects JavaScript safe integer range boundary", () => {
      expect(isPaiseSafeInteger(Number.MAX_SAFE_INTEGER)).toBe(true);
      expect(isPaiseSafeInteger("9007199254740991")).toBe(true);
      expect(isPaiseSafeInteger("9007199254740992")).toBe(false); // Above MAX_SAFE_INTEGER
      expect(isPaiseSafeInteger("10000000000000000")).toBe(false);
    });

    it("formatSavingsPaise formats paise with Indian numbering and 2 decimal places", () => {
      expect(formatSavingsPaise(15000)).toBe("₹150.00");
      expect(formatSavingsPaise(15050)).toBe("₹150.50");
      expect(formatSavingsPaise(12500000)).toBe("₹1,25,000.00");
      expect(formatSavingsPaise(1)).toBe("₹0.01");
      expect(formatSavingsPaise(0)).toBe("₹0.00");
      expect(formatSavingsPaise(-5000)).toBe("-₹50.00");
    });

    it("formatSavingsPaise safely formats string paise exceeding MAX_SAFE_INTEGER without precision loss", () => {
      // 9,007,199,254,740,992 paise
      const largePaise = "9007199254740992";
      const formatted = formatSavingsPaise(largePaise);
      expect(formatted).toBe("₹9,00,71,99,25,47,409.92");
    });
  });

  // ========================================================
  // 7. NETWORK & UNEXPECTED SERVER RESPONSES
  // ========================================================
  describe("Network errors", () => {
    it("propagates native fetch network errors cleanly", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

      await expect(fetchActiveSavingsGoal()).rejects.toThrow("Failed to fetch");
    });
  });
});
