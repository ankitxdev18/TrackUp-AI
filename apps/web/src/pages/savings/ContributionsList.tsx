import { ArrowDownLeft, Clock, History } from "lucide-react";
import { formatSavingsPaise, type SavingsContribution } from "../../api/savings";

interface ContributionsListProps {
  contributions: SavingsContribution[];
  loading: boolean;
  total: number;
}

export function ContributionsList({
  contributions,
  loading,
  total,
}: ContributionsListProps) {
  const formatContributionDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return "Unknown Date";
    }
  };

  return (
    <div className="savings-ledger-card" role="region" aria-label="Savings Contribution History">
      <div className="ledger-header">
        <div className="ledger-title-wrap">
          <History size={18} className="ledger-icon" aria-hidden="true" />
          <h3 className="ledger-title">Deposit History</h3>
          <span className="ledger-count-pill" aria-label={`Total deposits: ${total}`}>
            {total} {total === 1 ? "deposit" : "deposits"}
          </span>
        </div>
        <span className="ledger-immutable-tag" title="Contributions are permanently recorded in the immutable financial ledger">
          Immutable Ledger
        </span>
      </div>

      {loading && contributions.length === 0 ? (
        <div className="ledger-skeleton-list" role="status" aria-label="Loading contributions">
          <div className="ledger-skeleton-row" />
          <div className="ledger-skeleton-row" />
          <div className="ledger-skeleton-row" />
        </div>
      ) : contributions.length === 0 ? (
        <div className="ledger-empty-state">
          <div className="ledger-empty-icon" aria-hidden="true">
            <ArrowDownLeft size={24} />
          </div>
          <h4 className="ledger-empty-title">No Deposits Yet</h4>
          <p className="ledger-empty-text">
            Start saving by clicking <strong>Add Deposit</strong> above. Every deposit is safely recorded in your ledger.
          </p>
        </div>
      ) : (
        <div className="ledger-table-container">
          <table className="ledger-table">
            <thead>
              <tr>
                <th scope="col" className="col-date">
                  Date & Time
                </th>
                <th scope="col" className="col-note">
                  Note / Context
                </th>
                <th scope="col" className="col-amount">
                  Deposit Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {contributions.map((c) => (
                <tr key={c.id} className="ledger-row">
                  <td className="cell-date">
                    <div className="date-wrap">
                      <Clock size={13} className="text-muted" aria-hidden="true" />
                      <span>{formatContributionDate(c.createdAt)}</span>
                    </div>
                  </td>
                  <td className="cell-note">
                    {c.note ? (
                      <span className="note-text" title={c.note}>
                        {c.note}
                      </span>
                    ) : (
                      <span className="note-empty">—</span>
                    )}
                  </td>
                  <td className="cell-amount">
                    <span className="deposit-amount-badge">
                      +{formatSavingsPaise(c.amountCents)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
