import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { App } from "../App";
import * as savingsApi from "../api/savings";
import { SavingsWidget } from "../pages/dashboard/SavingsWidget";
import { CreateSavingsGoalModal } from "../pages/savings/CreateSavingsGoalModal";
import { AddContributionModal } from "../pages/savings/AddContributionModal";
import { CompleteGoalModal } from "../pages/savings/CompleteGoalModal";

describe("Milestone 3B: Savings Goals UI & Dashboard Integration Suite", () => {
  const mockActiveGoal: savingsApi.ActiveSavingsGoal = {
    id: "goal-uuid-1",
    name: "Emergency Fund",
    targetAmountCents: 10000000, // ₹1,00,000.00
    status: "ACTIVE",
    savedAmountCents: 5000000, // ₹50,000.00
    remainingAmountCents: 5000000, // ₹50,000.00
    progressPercent: 50.0,
    contributionCount: 2,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-05T12:00:00.000Z",
  };

  const mockContributions: savingsApi.SavingsContribution[] = [
    {
      id: "contrib-2",
      savingsGoalId: "goal-uuid-1",
      userId: "user-1",
      amountCents: 3000000, // ₹30,000.00
      note: "October salary deposit",
      createdAt: "2026-10-05T12:00:00.000Z",
    },
    {
      id: "contrib-1",
      savingsGoalId: "goal-uuid-1",
      userId: "user-1",
      amountCents: 2000000, // ₹20,000.00
      note: "Initial deposit",
      createdAt: "2026-10-01T10:00:00.000Z",
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, "", "/savings");

    // Standard mock for authenticated user
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("/api/auth/me")) {
        return {
          ok: true,
          json: async () => ({
            user: { id: "user-1", email: "test@trackup.com", name: "Test User" },
          }),
        } as unknown as Response;
      }

      if (url.includes("/api/notifications")) {
        return {
          ok: true,
          json: async () => ({ notifications: [], unreadCount: 0 }),
        } as unknown as Response;
      }

      if (url.includes("/api/savings/active")) {
        return {
          ok: true,
          json: async () => ({ goal: mockActiveGoal }),
        } as unknown as Response;
      }

      if (url.includes("/contributions")) {
        return {
          ok: true,
          json: async () => ({
            contributions: mockContributions,
            total: mockContributions.length,
          }),
        } as unknown as Response;
      }

      return {
        ok: true,
        json: async () => ({}),
      } as unknown as Response;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. ROUTE & NAVIGATION
  // =========================================================================
  describe("1. Route Registration and Navigation", () => {
    it("renders the Savings page when navigating to /savings", async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Savings Goals" })).toBeInTheDocument();
      });

      expect(screen.getByText(/Target Piggy Bank/i)).toBeInTheDocument();
    });

    it("highlights Savings in desktop sidebar navigation when active", async () => {
      render(<App />);

      await waitFor(() => {
        const sidebar = document.querySelector(".shell-sidebar");
        expect(sidebar).toBeInTheDocument();
        const savingsLink = sidebar?.querySelector('a[href="/savings"]');
        expect(savingsLink).toBeInTheDocument();
        expect(savingsLink).toHaveClass("active");
      });
    });

    it("displays Savings section header in top navigation bar", async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Savings", { selector: ".breadcrumb-current" })).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 2. ACTIVE GOAL RENDERING
  // =========================================================================
  describe("2. Active Goal State", () => {
    it("renders active goal with name, formatted amounts, progress bar, and metrics", async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Emergency Fund")).toBeInTheDocument();
      });

      // Amounts formatted in INR
      expect(screen.getAllByText("₹50,000.00")).toHaveLength(2); // Saved amount & Remaining amount
      expect(screen.getByText(/of ₹1,00,000\.00 target/i)).toBeInTheDocument();
      expect(screen.getByText("50%")).toBeInTheDocument();

      // Progress bar accessibility
      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute("aria-valuenow", "50");
      expect(progressBar).toHaveAttribute("aria-valuemin", "0");
      expect(progressBar).toHaveAttribute("aria-valuemax", "100");

      // Metrics grid
      expect(screen.getByText("2 deposits")).toBeInTheDocument();

      // Action buttons
      expect(document.getElementById("btn-open-add-deposit")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Complete Goal/i })).toBeInTheDocument();
    });

    it("renders contribution history ledger with date, note, and green deposit amount", async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Deposit History")).toBeInTheDocument();
      });

      expect(screen.getByText("October salary deposit")).toBeInTheDocument();
      expect(screen.getByText("+₹30,000.00")).toBeInTheDocument();
      expect(screen.getByText("Initial deposit")).toBeInTheDocument();
      expect(screen.getByText("+₹20,000.00")).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 3. EMPTY STATE
  // =========================================================================
  describe("3. Empty State (No Active Goal)", () => {
    it("renders friendly empty state with CTA when no active goal exists", async () => {
      vi.spyOn(savingsApi, "fetchActiveSavingsGoal").mockResolvedValueOnce(null);

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "No Active Savings Goal" })).toBeInTheDocument();
      });

      expect(
        screen.getByText(/TrackUp enforces one dedicated active savings goal at a time/i)
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Create Savings Goal" })).toBeInTheDocument();
      expect(screen.queryByText("Deposit History")).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // 4. CREATE GOAL FLOW & VALIDATION
  // =========================================================================
  describe("4. Goal Creation Modal & Validation", () => {
    it("opens create goal modal and validates required fields", async () => {
      vi.spyOn(savingsApi, "fetchActiveSavingsGoal").mockResolvedValueOnce(null);

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Create Savings Goal" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Create Savings Goal" }));

      // Modal appears
      expect(screen.getByRole("heading", { name: "Create Savings Goal" })).toBeInTheDocument();
      const submitBtn = screen.getByRole("button", { name: "Create Goal" });

      // 1. Submit empty form
      fireEvent.click(submitBtn);
      expect(screen.getByRole("alert")).toHaveTextContent("Please enter a goal name.");

      // 2. Submit with valid name but missing amount
      fireEvent.change(screen.getByLabelText(/Goal Name/i), {
        target: { value: "New Laptop Fund" },
      });
      fireEvent.click(submitBtn);
      expect(screen.getByRole("alert")).toHaveTextContent("Please enter a valid target amount greater than zero.");

      // 3. Submit with invalid amount (0 or negative)
      fireEvent.change(screen.getByLabelText(/Target Amount/i), {
        target: { value: "0" },
      });
      fireEvent.click(submitBtn);
      expect(screen.getByRole("alert")).toHaveTextContent("Please enter a valid target amount greater than zero.");
    });

    it("successfully creates goal with exact rupee-to-paise conversion and updates UI", async () => {
      vi.spyOn(savingsApi, "fetchActiveSavingsGoal").mockResolvedValueOnce(null);
      const createSpy = vi.spyOn(savingsApi, "createSavingsGoal").mockResolvedValueOnce({
        id: "goal-uuid-2",
        name: "Europe Trip",
        targetAmountCents: 15000000, // ₹1,50,000.00
        status: "ACTIVE",
        savedAmountCents: 0,
        remainingAmountCents: 15000000,
        progressPercent: 0,
        contributionCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Create Savings Goal" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Create Savings Goal" }));

      fireEvent.change(screen.getByLabelText(/Goal Name/i), {
        target: { value: "Europe Trip" },
      });
      fireEvent.change(screen.getByLabelText(/Target Amount/i), {
        target: { value: "1,50,000" },
      });

      // Shows live preview pill
      expect(screen.getByText("= ₹1,50,000.00")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Create Goal" }));

      await waitFor(() => {
        expect(createSpy).toHaveBeenCalledWith({
          name: "Europe Trip",
          targetAmountCents: 15000000,
        });
      });

      // Modal closes and new goal renders
      await waitFor(() => {
        expect(screen.getByText("Europe Trip")).toBeInTheDocument();
        expect(screen.getByText("₹0.00")).toBeInTheDocument();
        expect(screen.getByText(/of ₹1,50,000\.00 target/i)).toBeInTheDocument();
      });
    });

    it("handles 409 ACTIVE_GOAL_EXISTS with informative conflict feedback", async () => {
      vi.spyOn(savingsApi, "createSavingsGoal").mockRejectedValueOnce(
        new savingsApi.SavingsApiError(
          409,
          "ACTIVE_GOAL_EXISTS",
          "An active savings goal already exists. Complete or archive it before creating a new one."
        )
      );

      const onClose = vi.fn();
      const onGoalCreated = vi.fn();
      const onConflict = vi.fn();

      render(
        <CreateSavingsGoalModal
          isOpen={true}
          onClose={onClose}
          onGoalCreated={onGoalCreated}
          onConflict={onConflict}
        />
      );

      fireEvent.change(screen.getByLabelText(/Goal Name/i), {
        target: { value: "Car Downpayment" },
      });
      fireEvent.change(screen.getByLabelText(/Target Amount/i), {
        target: { value: "2,00,000" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Create Goal" }));

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent(
          "An active savings goal already exists. Complete or archive it before creating a new one."
        );
      });
      expect(onConflict).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 5. CONTRIBUTION DEPOSIT FLOW & LEDGER
  // =========================================================================
  describe("5. Contribution Modal & Ledger Updates", () => {
    it("records a deposit, updates goal progress, and appends to contribution ledger", async () => {
      const addContributionSpy = vi
        .spyOn(savingsApi, "addSavingsContribution")
        .mockResolvedValueOnce({
          contribution: {
            id: "contrib-3",
            savingsGoalId: "goal-uuid-1",
            userId: "user-1",
            amountCents: 2500000, // ₹25,000.00
            note: "Mid-month bonus deposit",
            createdAt: new Date().toISOString(),
          },
          goal: {
            id: "goal-uuid-1",
            name: "Emergency Fund",
            targetAmountCents: 10000000,
            status: "ACTIVE",
            savedAmountCents: 7500000, // ₹75,000.00
            remainingAmountCents: 2500000, // ₹25,000.00
            progressPercent: 75.0,
            contributionCount: 3,
            updatedAt: new Date().toISOString(),
          },
        });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Emergency Fund")).toBeInTheDocument();
      });

      fireEvent.click(document.getElementById("btn-open-add-deposit")!);

      // Add Deposit modal opens
      expect(screen.getByRole("heading", { name: "Add Savings Deposit" })).toBeInTheDocument();
      expect(screen.getByText(/Remaining to reach target:/i)).toBeInTheDocument();

      // Enter deposit ₹25,000 with note
      fireEvent.change(screen.getByLabelText(/Deposit Amount/i), {
        target: { value: "25000" },
      });
      fireEvent.change(screen.getByLabelText(/Note/i), {
        target: { value: "Mid-month bonus deposit" },
      });

      fireEvent.click(document.getElementById("btn-add-contribution-submit")!);

      await waitFor(() => {
        expect(addContributionSpy).toHaveBeenCalledWith("goal-uuid-1", {
          amountCents: 2500000,
          note: "Mid-month bonus deposit",
        });
      });

      // Updated progress and saved amount visible in UI
      await waitFor(() => {
        expect(screen.getByText("₹75,000.00")).toBeInTheDocument();
        expect(screen.getByText("75%")).toBeInTheDocument();
        expect(screen.getByText("Mid-month bonus deposit")).toBeInTheDocument();
        expect(screen.getByText("+₹25,000.00")).toBeInTheDocument();
      });
    });

    it("rejects invalid contribution amounts and notes over 500 characters", () => {
      const onClose = vi.fn();
      const onAdded = vi.fn();

      render(
        <AddContributionModal
          isOpen={true}
          goalId="goal-1"
          goalName="Emergency Fund"
          remainingPaise={5000000}
          onClose={onClose}
          onContributionAdded={onAdded}
        />
      );

      const submitBtn = screen.getByRole("button", { name: "Add Deposit" });

      // Empty amount
      fireEvent.click(submitBtn);
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Please enter a valid deposit amount greater than zero."
      );

      // Overlong note (> 500 chars)
      fireEvent.change(screen.getByLabelText(/Deposit Amount/i), {
        target: { value: "500" },
      });
      const longNote = "a".repeat(501);
      fireEvent.change(screen.getByLabelText(/Note/i), {
        target: { value: longNote },
      });
      fireEvent.click(submitBtn);
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Note must not exceed 500 characters."
      );
    });
  });

  // =========================================================================
  // 6. EXACT MONETARY CONVERSION & PASTE TESTS
  // =========================================================================
  describe("6. Exact Monetary Rupee to Paise Conversion", () => {
    it("parses whole rupees and exact decimal paise without floating point drift", () => {
      expect(savingsApi.parseCurrencyInputToCents("150")).toBe(15000);
      expect(savingsApi.parseCurrencyInputToCents("150.5")).toBe(15050);
      expect(savingsApi.parseCurrencyInputToCents("150.50")).toBe(15050);
      expect(savingsApi.parseCurrencyInputToCents("0.01")).toBe(1);
      expect(savingsApi.parseCurrencyInputToCents("1,25,000.00")).toBe(12500000);
      expect(savingsApi.parseCurrencyInputToCents("21474836.47")).toBe(2147483647);
    });

    it("strictly rejects invalid numbers, negative values, and precision overflow", () => {
      expect(savingsApi.parseCurrencyInputToCents("-150")).toBeNull();
      expect(savingsApi.parseCurrencyInputToCents("0")).toBeNull();
      expect(savingsApi.parseCurrencyInputToCents("0.00")).toBeNull();
      expect(savingsApi.parseCurrencyInputToCents("150.505")).toBeNull(); // 3 decimal places rejected
      expect(savingsApi.parseCurrencyInputToCents("21474836.48")).toBeNull(); // Above signed 32-bit max
      expect(savingsApi.parseCurrencyInputToCents("abc")).toBeNull();
    });
  });

  // =========================================================================
  // 7. GOAL COMPLETION FLOW
  // =========================================================================
  describe("7. Goal Completion Flow", () => {
    it("confirms completion, calls status endpoint, and restores empty state", async () => {
      const updateStatusSpy = vi
        .spyOn(savingsApi, "updateSavingsGoalStatus")
        .mockResolvedValueOnce({
          goal: {
            id: "goal-uuid-1",
            userId: "user-1",
            name: "Emergency Fund",
            targetAmountCents: 10000000,
            status: "COMPLETED",
            createdAt: "2026-10-01T10:00:00.000Z",
            updatedAt: new Date().toISOString(),
          },
        });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Complete Goal/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /Complete Goal/i }));

      // Confirmation modal
      expect(screen.getByRole("heading", { name: "Complete Savings Goal" })).toBeInTheDocument();
      expect(
        screen.getByText(/Are you sure you want to complete this savings goal\?/i)
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Confirm Complete" }));

      await waitFor(() => {
        expect(updateStatusSpy).toHaveBeenCalledWith("goal-uuid-1", "COMPLETED");
      });

      // Emptied state displayed
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "No Active Savings Goal" })).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 8. ERROR & RETRY BEHAVIOR
  // =========================================================================
  describe("8. API Failure & Retry", () => {
    it("renders error banner on load failure with functional retry action", async () => {
      const fetchGoalSpy = vi
        .spyOn(savingsApi, "fetchActiveSavingsGoal")
        .mockRejectedValueOnce(new Error("Database connection timeout"))
        .mockResolvedValueOnce(mockActiveGoal);

      render(<App />);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("Database connection timeout");
      });

      // Click Retry
      fireEvent.click(screen.getByRole("button", { name: /Retry/i }));

      await waitFor(() => {
        expect(screen.getByText("Emergency Fund")).toBeInTheDocument();
      });

      expect(fetchGoalSpy).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // 9. DASHBOARD WIDGET INTEGRATION
  // =========================================================================
  describe("9. Dashboard SavingsWidget Integration", () => {
    it("renders active goal progress and metrics on Dashboard", async () => {
      vi.spyOn(savingsApi, "fetchActiveSavingsGoal").mockResolvedValueOnce(mockActiveGoal);

      render(<SavingsWidget />);

      await waitFor(() => {
        expect(screen.getByText("Emergency Fund")).toBeInTheDocument();
      });

      expect(screen.getByText("₹50,000.00 saved")).toBeInTheDocument();
      expect(screen.getByText(/Target: ₹1,00,000\.00/i)).toBeInTheDocument();
      expect(screen.getByText("50%")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "View all →" })).toHaveAttribute(
        "href",
        "/savings"
      );
    });

    it("renders compact prompt to set goal when no active goal exists", async () => {
      vi.spyOn(savingsApi, "fetchActiveSavingsGoal").mockResolvedValueOnce(null);

      render(<SavingsWidget />);

      await waitFor(() => {
        expect(screen.getByText("No active savings goal.")).toBeInTheDocument();
      });

      expect(screen.getByRole("link", { name: /Set goal/i })).toHaveAttribute(
        "href",
        "/savings"
      );
    });
  });

  // =========================================================================
  // 10. ACCESSIBILITY & FOCUS TRAP
  // =========================================================================
  describe("10. Modal Accessibility & Keyboard Navigation", () => {
    it("closes modal on Escape key press", () => {
      const onClose = vi.fn();
      render(
        <CreateSavingsGoalModal
          isOpen={true}
          onClose={onClose}
          onGoalCreated={vi.fn()}
        />
      );

      fireEvent.keyDown(window, { key: "Escape" });
      expect(onClose).toHaveBeenCalled();
    });

    it("does not close on Escape key while request is loading", async () => {
      vi.spyOn(savingsApi, "updateSavingsGoalStatus").mockImplementation(
        () => new Promise(() => {})
      );
      const onClose = vi.fn();
      render(
        <CompleteGoalModal
          isOpen={true}
          goal={mockActiveGoal}
          onClose={onClose}
          onGoalCompleted={vi.fn()}
        />
      );

      // Disable close when loading
      const confirmBtn = screen.getByRole("button", { name: "Confirm Complete" });
      fireEvent.click(confirmBtn); // Triggers loading

      fireEvent.keyDown(window, { key: "Escape" });
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
