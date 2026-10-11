export function AnalyticsSkeleton() {
  return (
    <div
      className="analytics-skeleton-wrap"
      role="status"
      aria-label="Loading analytics data"
    >
      {/* 4 Pulse Card Skeletons */}
      <div className="skeleton-pulse-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton-pulse-card">
            <div className="skeleton-line skeleton-title" />
            <div className="skeleton-line skeleton-metric" />
            <div className="skeleton-line skeleton-sub" />
          </div>
        ))}
      </div>

      {/* 2-Column Main Breakdown Skeleton */}
      <div className="skeleton-main-grid">
        <div className="skeleton-col">
          <div className="skeleton-card skeleton-card-large" />
          <div className="skeleton-card skeleton-card-large" />
        </div>
        <div className="skeleton-col">
          <div className="skeleton-card skeleton-card-medium" />
          <div className="skeleton-card skeleton-card-medium" />
        </div>
      </div>
    </div>
  );
}
