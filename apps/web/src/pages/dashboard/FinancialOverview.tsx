import { SpendingWidget } from "./SpendingWidget";
import { SavingsWidget } from "./SavingsWidget";

export function FinancialOverview() {
  return (
    <section className="dashboard-financial-overview" aria-label="Financial Overview">
      <SpendingWidget />
      <SavingsWidget />
    </section>
  );
}
