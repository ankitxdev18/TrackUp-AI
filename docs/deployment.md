# TrackUp Deployment & Infrastructure Architecture

This document defines the production deployment topology, security policies, database configuration, migration lifecycle, and operational procedures for TrackUp.

---

## 1. Production Architecture & Topology

```
┌───────────────────────────┐         HTTPS / WSS          ┌───────────────────────────────────┐
│     Vercel Edge CDN       │ ────────────────────────────▶│         Render Web Service         │
│   (TrackUp Web - SPA)     │    Credentials: Include      │        (TrackUp API - Fastify)    │
│  app.trackup.com (or Vercel)│   Origin: app.trackup.com    │     api.trackup.com (or onrender) │
└───────────────────────────┘                              └─────────────────┬─────────────────┘
              │                                                              │
        vercel.json                                                          │ Managed TLS
      SPA Rewrites (/*)                                                      │ rejectUnauthorized: true
                                                                             ▼
                                                           ┌───────────────────────────────────┐
                                                           │     Render PostgreSQL (v16)       │
                                                           │        (Encrypted at rest)        │
                                                           └───────────────────────────────────┘
```

- **Frontend (Web):** Deployed to **Vercel** as a static single-page application (SPA). Client-side deep linking and direct page refreshes (`/login`, `/dashboard`, `/tasks`, `/projects`) are routed to `index.html` via `apps/web/vercel.json`.
- **Backend (API):** Deployed to **Render** as a Node.js Web Service running Fastify (`0.0.0.0:10000`). Reverse-proxy headers from Render's edge load balancer are validated via `TRUST_PROXY=true`.
- **Database:** Managed **Render PostgreSQL** (PostgreSQL 16).

---

## 2. Database Connection Security & TLS Policy

### Strict Certificate Verification
- When connecting to remote/production databases, TLS with full certificate verification (`rejectUnauthorized: true`) is strictly enforced in `apps/api/src/db/index.ts`.
- **No Silent Degradation:** TrackUp explicitly prohibits setting `rejectUnauthorized: false`. If certificate verification fails, the connection aborts rather than silently exposing database traffic to man-in-the-middle attacks.
- **Custom / Private CAs:** If connecting to an enterprise or self-hosted PostgreSQL instance with an internal Certificate Authority, the CA certificate can be provided via `DATABASE_SSL_CA` in PEM format.
- **Local Development Compatibility:** Plaintext local PostgreSQL connections on `localhost` / `127.0.0.1` remain unencrypted by default when `DATABASE_SSL` is omitted or set to `false`.

### Credential Protection & Safe Logging
- All operational logging passes database connection strings through `sanitizeConnectionString()`.
- Passwords in connection URIs (e.g. `postgres://user:secret@host:5432/db`) are automatically redacted to `postgres://user:******@host:5432/db` before output to console or logs.

---

## 3. Database Migration Lifecycle

### Asset Packaging
1. Drizzle ORM maintains migrations in `apps/api/src/db/migrations/` along with the metadata journal `meta/_journal.json`.
2. When the API is built (`npm run build:api`), `scripts/copy-migrations.js` copies all `.sql` migration files and `_journal.json` into `dist/db/migrations/`.
3. Stale or removed migrations in `dist/` are automatically cleaned up to prevent orphaned SQL execution.

### Production Execution Procedure
- **Command:** `npm run db:migrate:api:prod` executes `node dist/db/migrate.js`.
- **Render Start Hook:** The Render blueprint configures `startCommand: npm run db:migrate:api:prod && npm run start --workspace=apps/api`.
- Migrations run in a dedicated step before the HTTP server binds to the network port.
- If a migration fails, the process exits with status code 1, preventing the application server from starting with an incompatible schema.

### Rollback & Forward Recovery Strategy
- **Forward Fix (Recommended):** Drizzle ORM does not support automated arbitrary downward rollbacks. Schema modifications should be additive and backwards-compatible (expand-and-contract pattern). Schema fixes are deployed via forward migrations (`npm run db:generate`).
- **Disaster Recovery:** If an unrecoverable migration failure occurs, restore the database from the most recent point-in-time backup before re-deploying the corrected codebase.

---

## 4. Environment Variables Matrix

| Variable | Scope | Development | Production (Render/Vercel) | Description |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | API | `development` | `production` | Runtime mode. Enforces strict cookie & secret policies in production. |
| `PORT` | API | `4000` | `10000` (Render default) | Port Fastify listens on. |
| `HOST` | API | `0.0.0.0` | `0.0.0.0` | Host binding interface. |
| `DATABASE_URL` | API | `postgres://postgres@localhost:5432/TrackUp` | `postgres://...` (Render DB) | PostgreSQL connection URI. |
| `DATABASE_SSL` | API | `false` | `true` | Enforces TLS with certificate verification. |
| `DATABASE_SSL_CA` | API | *(Unset)* | *(Optional PEM string)* | Custom root CA certificate for private databases. |
| `COOKIE_SECRET` | API | `trackup-session-cookie-secret-dev` | *(Generated random 32+ char secret)* | Cryptographic key for cookie signing. Mandatory in prod. |
| `CORS_ORIGIN` | API | `http://localhost:5173,http://127.0.0.1:5173` | `https://app.trackup.com` | Trusted frontend origin allowlist. Wildcards forbidden. |
| `TRUST_PROXY` | API | `false` | `true` | Trust Render load balancer headers (`x-forwarded-for`). |
| `AUTH_RATE_LIMIT_MAX` | API | `10` | `10` | Maximum login/register attempts per minute per IP. |
| `AUTH_RATE_LIMIT_WINDOW_MS`| API | `60000` | `60000` | Rate limiting sliding window (1 minute). |

---

## 5. Health Checks & Zero-Downtime Deployment

- **Endpoint:** `GET /health`
- **Behavior:** Executes a non-destructive `SELECT 1` query via `checkDatabaseHealth()` on the connection pool.
  - Returns `200 OK` (`status: "ok", db: "connected"`) when PostgreSQL is responsive.
  - Returns `503 Service Unavailable` (`status: "degraded", db: "disconnected"`) if PostgreSQL is unreachable.
- **Render Integration:** Configured via `healthCheckPath: /health` in `render.yaml`. Render monitors this endpoint and ensures the new deployment instance is healthy before routing incoming traffic away from the previous container.
- **Graceful Shutdown:** The Fastify server catches `SIGINT` and `SIGTERM`, draining in-flight HTTP requests, stopping periodic cleanup intervals, and closing database pool connections before exiting.
