import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  PiggyBank,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  fetchActiveSavingsGoal,
  fetchSavingsContributions,
  type ActiveSavingsGoal,
  type AddContributionResponse,
  type SavingsContribution,
  type UpdateGoalStatusResponse,
} from "../api/savings";
import { AddContributionModal } from "./savings/AddContributionModal";
import { CompleteGoalModal } from "./savings/CompleteGoalModal";
import { ContributionsList } from "./savings/ContributionsList";
import { CreateSavingsGoalModal } from "./savings/CreateSavingsGoalModal";
import { SavingsGoalCard } from "./savings/SavingsGoalCard";
import "./SavingsPage.css";

export function SavingsPage() {
  const [goal, setGoal] = useState<ActiveSavingsGoal | null>(null);
  const [contributions, setContributions] = useState<SavingsContribution[]>([]);
  const [contributionsTotal, setContributionsTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);

  // Feedback notifications
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const loadContributionsData = useCallback(async (goalId: string) => {
    try {
      setLedgerLoading(true);
      const data = await fetchSavingsContributions(goalId, { limit: 50, offset: 0 });
      setContributions(data.contributions);
      setContributionsTotal(data.total);
    } catch {
      // Non-fatal: if ledger fetch fails, preserve existing list
    } finally {
      setLedgerLoading(false);
    }
  }, []);

  const loadGoalData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const activeGoal = await fetchActiveSavingsGoal();
      setGoal(activeGoal);

      if (activeGoal) {
        await loadContributionsData(activeGoal.id);
      } else {
        setContributions([]);
        setContributionsTotal(0);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load savings goal. Please check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }, [loadContributionsData]);

  useEffect(() => {
    loadGoalData();
  }, [loadGoalData]);

  // Handle goal creation
  const handleGoalCreated = (newGoal: ActiveSavingsGoal) => {
    setGoal(newGoal);
    setContributions([]);
    setContributionsTotal(0);
    setSuccessBanner(`Savings goal "${newGoal.name}" created successfully!`);
    setTimeout(() => setSuccessBanner(null), 5000);
  };

  // Handle contribution recorded
  const handleContributionAdded = (res: AddContributionResponse) => {
    setGoal((prev) =>
      prev
        ? {
            ...prev,
            ...res.goal,
          }
        : null
    );

    // Prepend new contribution to visible ledger immediately
    setContributions((prev) => [res.contribution, ...prev]);
    setContributionsTotal((prev) => prev + 1);

    setSuccessBanner("Deposit recorded successfully towards your savings goal!");
    setTimeout(() => setSuccessBanner(null), 5000);
  };

  // Handle goal completed
  const handleGoalCompleted = (_res: UpdateGoalStatusResponse) => {
    setGoal(null);
    setContributions([]);
    setContributionsTotal(0);
    setSuccessBanner("Savings goal marked as completed! You can now create a new savings goal.");
    setTimeout(() => setSuccessBanner(null), 6000);
  };

  return (
    <div className="savings-page" role="main">
      {/* Page Header */}
      <header className="savings-page-header">
        <div className="savings-header-info">
          <div className="savings-header-title-row">
            <h1 className="savings-page-title">Savings Goals</h1>
            <span className="savings-badge-tag">
              <Sparkles size={13} aria-hidden="true" />
              Target Piggy Bank
            </span>
          </div>
          <p className="savings-page-subtitle">
            Dedicated target savings tracking with an immutable deposit ledger.
          </p>
        </div>

        <div className="savings-header-actions">
          {goal ? (
            <button
              id="btn-header-add-deposit"
              type="button"
              className="btn btn-primary"
              onClick={() => setIsDepositModalOpen(true)}
            >
              <Plus size={16} />
              <span>Add Deposit</span>
            </button>
          ) : (
            <button
              id="btn-header-create-goal"
              type="button"
              className="btn btn-primary"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <Plus size={16} />
              <span>New Goal</span>
            </button>
          )}
        </div>
      </header>

      {/* Success Notification Banner */}
      {successBanner && (
        <div className="savings-success-banner" role="status">
          <Sparkles size={16} />
          <span>{successBanner}</span>
        </div>
      )}

      {/* Error Banner with Retry */}
      {error && (
        <div className="savings-error-banner" role="alert">
          <AlertCircle size={18} />
          <div className="error-content">
            <strong>Unable to load savings:</strong> {error}
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={loadGoalData}
          >
            <RefreshCw size={13} />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div className="savings-loading-skeleton" role="status" aria-label="Loading savings goals">
          <div className="skeleton-hero-card" />
          <div className="skeleton-ledger-card" />
        </div>
      ) : goal ? (
        <div className="savings-content-layout">
          {/* Active Goal Hero Card */}
          <SavingsGoalCard
            goal={goal}
            onAddDeposit={() => setIsDepositModalOpen(true)}
            onCompleteGoal={() => setIsCompleteModalOpen(true)}
          />

          {/* Chronological Contribution Ledger */}
          <ContributionsList
            contributions={contributions}
            loading={ledgerLoading}
            total={contributionsTotal}
          />
        </div>
      ) : (
        /* Empty State: No Active Goal */
        <div className="savings-empty-state-card" role="region" aria-label="No Active Savings Goal">
          <div className="empty-icon-wrap" aria-hidden="true">
            <PiggyBank size={40} />
          </div>
          <h2 className="empty-title">No Active Savings Goal</h2>
          <p className="empty-description">
            TrackUp enforces one dedicated active savings goal at a time to keep you focused.
            Set a target for your emergency fund, equipment upgrade, vacation, or major milestone, and deposit funds over time.
          </p>
          <button
            id="btn-empty-create-goal"
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus size={18} />
            <span>Create Savings Goal</span>
          </button>
        </div>
      )}

      {/* Modals */}
      <CreateSavingsGoalModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onGoalCreated={handleGoalCreated}
        onConflict={loadGoalData}
      />

      {goal && (
        <>
          <AddContributionModal
            isOpen={isDepositModalOpen}
            goalId={goal.id}
            goalName={goal.name}
            remainingPaise={goal.remainingAmountCents}
            onClose={() => setIsDepositModalOpen(false)}
            onContributionAdded={handleContributionAdded}
          />

          <CompleteGoalModal
            isOpen={isCompleteModalOpen}
            goal={goal}
            onClose={() => setIsCompleteModalOpen(false)}
            onGoalCompleted={handleGoalCompleted}
          />
        </>
      )}
    </div>
  );
}
