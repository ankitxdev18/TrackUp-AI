# Analytics Feature Specification & Operator Documentation

## 1. Feature Purpose & Domain Context

TrackUp is a personal Life Operating System (Life OS) structured around the core loop:

$$\text{Capture} \longrightarrow \text{Plan} \longrightarrow \text{Execute} \longrightarrow \text{Track} \longrightarrow \text{Review} \longrightarrow \text{Improve}$$

While Tasks, Habits, Goals, Projects, and Journal capture and facilitate execution on a daily basis, **Analytics** serves the **Review** and **Improve** phases. It provides an honest, period-bounded, and cross-domain reflection of real human execution.

### Core Philosophy
1. **Honest, Deterministic Metrics:** Analytics reports strictly what happened (tasks marked completed, habits checked off, journal reflections recorded).
2. **No Vanity Scores:** Arbitrary, gamified "productivity scores" and algorithmic grades are strictly prohibited.
3. **No LLM Hallucinations:** Metrics are derived from deterministic relational aggregations, not generative AI summaries.
4. **Privacy First:** Journal entry text/content is completely private and is never selected or exposed in analytics queries.
5. **Zero New Storage:** Analytics is a pure derived view layer. It introduces zero new database tables, migrations, caching layers, or background worker jobs.

---

## 2. Scope & Boundaries

### Included in V1
- **Tasks Execution:** Completed tasks count with prior period comparison (delta & % change), scheduled vs completed completion rate, current overdue backlog count, priority breakdown (high, medium, low).
- **Habits Consistency:** Overall period consistency rate, individual habit current streaks and longest streaks (reusing `calculateStreaks`), period completion count & rate, and daily completion heat grid.
- **Goals Horizon:** Active vs completed count, average progress across active goals, and individual target dates.
- **Projects Progress:** Active projects list with task counts, completed task counts, and completion percentage.
- **Journal Reflection Frequency:** Days journaled in current period vs prior period and consistency percentage (metadata/counts only; zero text content exposed).
- **Temporal Selectors:** 7-Day Trailing (`7d`), 30-Day Trailing (`30d`), and Month-to-Date (`month`).

### Deferred to V2
- **Expenses Module:** Financial analytics (spend vs budget, category breakdowns) are deferred to V2 until the Expenses domain is fully consolidated.
- **Historical Goal Progression Tables:** Because `goals` currently stores a single scalar `progress` column without a historical audit log, historical delta tracking for goals is deferred until an event-sourced progress log is introduced.

---

## 3. Architecture & Data Principles

```
                  ┌─────────────────────────────────────────┐
                  │          HTTP Request GET               │
                  │       /api/analytics/overview           │
                  └────────────────────┬────────────────────┘
                                       │
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │         Authentication Guard            │
                  │      Extracts req.user.id & tz          │
                  └────────────────────┬────────────────────┘
                                       │
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │       analytics.date Engine             │
                  │  Derives [startUtc, endUtc) & Dates     │
                  └────────────────────┬────────────────────┘
                                       │
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │       analytics.service Engine          │
                  │   Concurrent SQL Aggregations (Drizzle) │
                  └─────────┬──────────────┬──────────────┬─┘
                            │              │              │
                   Tasks    │     Habits   │    Goals     │  Projects & Journal
                   Aggs     │    Streaks   │  Snapshots   │     Aggs
                            ▼              ▼              ▼
                  ┌─────────────────────────────────────────┐
                  │    In-Memory Habit Matrix & Streaks     │
                  │       O(1) Set Completion Lookups       │
                  └────────────────────┬────────────────────┘
                                       │
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │        JSON Response Payload            │
                  │     Zod-Validated Multi-Domain DTO      │
                  └─────────────────────────────────────────┘
```

### Invariants & Non-Negotiables
1. **Multi-Tenant Isolation:** Every database query strictly filters by `where(eq(table.userId, userId))`.
2. **Parallel Query Execution:** All module queries execute concurrently via `Promise.all` in a single database round-trip pipeline.
3. **Half-Open UTC Boundary Invariant:** Tasks completed at instant `completedAt` are filtered using the half-open interval:
   $$\text{currentStartUtc} \le \text{completedAt} < \text{currentEndUtc}$$
4. **Timezone Authority:** If the client provides a valid IANA timezone in `?timeZone=`, it is used. Otherwise, the authenticated user's `user.timezone` is authoritative, falling back to `'UTC'`.
5. **Month Overflow Prevention:** When computing prior month-to-date intervals, the prior end date is capped by `daysInPriorMonth` to prevent day-31 queries from overflowing February or 30-day months into adjacent months.

---

## 4. API Specification

### Endpoint: `GET /api/analytics/overview`
*(Alias: `GET /api/analytics`)*

**Authentication:** Required (`Bearer <jwt>` or session cookie).

#### Query Parameters

| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `period` | `'7d' \| '30d' \| 'month'` | No | `'7d'` | Time period window for analytics. |
| `timeZone` | `string` | No | `user.timezone` | Optional IANA timezone override (e.g., `'America/New_York'`). |

#### Response Schema (`200 OK`)

```typescript
{
  period: {
    code: "7d" | "30d" | "month";
    startDate: string;       // YYYY-MM-DD
    endDate: string;         // YYYY-MM-DD
    timeZone: string;        // IANA identifier
    daysCount: number;
  };
  summary: {
    tasksCompleted: {
      current: number;
      prior: number | null;
      delta: number | null;
      deltaPercent: number | null;
    };
    taskCompletionRate: {
      rate: number | null;
      scheduledTotal: number;
      scheduledCompleted: number;
    };
    habitConsistency: {
      rate: number | null;
      totalCompletions: number;
      totalEligibleDays: number;
    };
    activeGoals: {
      activeCount: number;
      completedCount: number;
      averageProgress: number;
    };
    journalReflections: {
      daysJournaled: number;
      consistencyPercent: number;
      priorDaysJournaled: number | null;
    };
  };
  tasks: {
    byPriority: {
      high: number;
      medium: number;
      low: number;
    };
    currentOverdueCount: number;
  };
  habits: {
    habitsList: Array<{
      id: string;
      title: string;
      currentStreak: number;
      longestStreak: number;
      periodCompletions: number;
      periodRate: number | null;
    }>;
    dailyGrid: Array<{
      date: string;          // YYYY-MM-DD
      completedCount: number;
      totalActiveHabits: number;
    }>;
  };
  goals: Array<{
    id: string;
    title: string;
    status: "ACTIVE" | "COMPLETED" | "CANCELLED";
    progress: number;
    targetDate: string | null;
  }>;
  projects: Array<{
    id: string;
    name: string;
    taskCount: number;
    completedTaskCount: number;
    progressPercent: number;
  }>;
}
```

---

## 5. Frontend Architecture & Design System

The frontend is implemented without external charting libraries, maintaining TrackUp's dark-first design tokens, lightweight bundle footprint, and fast load times.

### Components Inventory ([`apps/web/src/pages/analytics/`](file:///d:/Projects/TrackUp-AI/apps/web/src/pages/analytics/))
1. **`AnalyticsHeader`:** Title, calm subtitle, temporal segmented button group (`7 Days`, `30 Days`, `This Month`), active timezone indicator, and refresh action.
2. **`ExecutionPulse`:** 4-card metric grid featuring Tasks Completed (with prior period delta badge), Task Completion Rate (with progress bar), Habit Consistency Rate, and Active Goals Progress.
3. **`TasksBreakdownCard`:** Priority distribution segmented bar (High in red/coral, Medium in amber, Low in emerald) and overdue task warning banner with direct deep link to `/tasks`.
4. **`HabitMatrixCard`:** Daily consistency heat grid (dots reflecting completion intensity) and per-habit list with current streak, best streak, and period rate.
5. **`GoalsHorizonCard`:** Snapshot of all active and completed goals with status badges, target dates, progress percentages, and links to `/goals`.
6. **`ProjectsProgressCard`:** Grid of active projects with task count ratios and progress meters, linking to `/projects`.
7. **`AnalyticsSkeleton`:** Accessible shimmer loading skeleton displayed during data fetches.

### Navigation & Discoverability
- **Dashboard Quick-Link:** Direct **"Analytics Overview"** action button in Dashboard Header.
- **Desktop Sidebar Navigation:** Accessible under the **Insights** nav group with the `TrendingUp` icon.
- **Mobile Navigation:** Full drawer support inside the **More** sheet on mobile viewports.

---

## 6. Operator Runbook & Verification Procedures

### Running the Test Suites

1. **Backend Analytics Suite (32 tests):**
   ```bash
   cd apps/api
   npx vitest run test/analytics
   ```
2. **Frontend Analytics & Navigation Suite (44 tests):**
   ```bash
   cd apps/web
   npx vitest run src/test/analytics.test.tsx src/test/shell.test.tsx src/test/calendar-integration.test.tsx
   ```
3. **Production Build Validation:**
   ```bash
   cd apps/web
   npm run build
   ```

### Troubleshooting & Common Invariants
- **Database Connection:** Backend relies on `DATABASE_URL` pointing to PostgreSQL with existing tables (`users`, `tasks`, `habits`, `habit_completions`, `goals`, `projects`, `journal_entries`). Zero migrations are required.
- **Timezone Validation:** Invalid timezone strings passed to `?timeZone=` safely fallback to `'UTC'`. Valid IANA identifiers (e.g. `'America/New_York'`, `'Asia/Kolkata'`, `'Europe/London'`) are resolved using `Intl.DateTimeFormat`.
- **Habit Eligibility:** Habits created partway through an analytics window calculate their consistency denominator from their creation date onward, preventing newly created habits from artificially penalizing historical consistency.
