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
- **API Routing & Reverse Proxy:** Vercel edge rewrites proxy all relative `/api/*` requests directly to the Render backend service (`https://trackup-api.onrender.com/api/:path*`) before the SPA fallback rule catches other routes.
- **Backend (API):** Deployed to **Render** as a Node.js Web Service running Fastify (`0.0.0.0:10000`). Reverse-proxy headers from upstream load balancers are validated via `TRUST_PROXY=true`.
- **Database:** Managed **Render PostgreSQL** (PostgreSQL 16).

### Same-Origin Architecture & Cookie Security Model
1. **Public Origin Uniformity:** The browser communicates exclusively with the frontend's public origin (e.g., `https://app.trackup.com` or `https://trackup.vercel.app`), making all API requests to relative `/api/*` endpoints.
2. **RFC 6265bis `__Host-` Prefix Compliance:**
   - Production session cookies are named `__Host-trackup_session`.
   - Set with attributes: `Secure; HttpOnly; Path=/; SameSite=Lax; (Domain explicitly omitted)`.
   - Because the browser communicates with the same origin, the cookie is treated as first-party and is completely immune to third-party cookie deprecation in Safari (ITP), Firefox (ETP), and Chrome.
3. **Rewrite Order Precedence in `apps/web/vercel.json`:**
   - Rule 1 (`/api/:path*` -> `https://trackup-api.onrender.com/api/:path*`): Takes strict precedence. Relays HTTP methods, query strings, headers (`Origin`, `Cookie`), and JSON request bodies; forwards `Set-Cookie` and JSON error status codes (400, 401, 403, 404, 500) downstream without masking.
   - Rule 2 (`/(.*)` -> `/index.html`): Catch-all SPA fallback ensuring client-side routes render properly.
4. **CORS & CSRF Defense:**
   - Render's `CORS_ORIGIN` environment variable is configured to match the public frontend origin (`https://app.trackup.com`).
   - Fastify's CSRF hook (`createCsrfProtection`) strictly validates that `Origin` and `Referer` match `CORS_ORIGIN`. Cross-site requests (`Sec-Fetch-Site: cross-site`) or untrusted origins are rejected with 403 `CSRF_ORIGIN_INVALID`.
5. **Local Development Continuity:**
   - In local development, Vite's dev server (`apps/web/vite.config.ts`) proxies `/api` to `http://localhost:4000`.
   - Development cookies use `trackup_session` with `Secure=false` so plain HTTP `localhost:5173` functions seamlessly.

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

---

## 6. Staging Environment Architecture & Routing Topology

To guarantee that pre-release verification never mutates production data or exposes unverified features to public users, TrackUp maintains a fully isolated staging deployment.

### Topology Overview

```
┌───────────────────────────┐         HTTPS / WSS          ┌───────────────────────────────────┐
│     Vercel Staging CDN    │ ────────────────────────────▶│     Render Staging Web Service    │
│  (trackup-staging.vercel) │    Credentials: Include      │    (trackup-staging-api.onrender) │
│   Origin: *.vercel.app    │  Origin: trackup-staging...  │       Fastify Node.js Service     │
└───────────────────────────┘                              └─────────────────┬─────────────────┘
              │                                                              │
     vercel.staging.json                                                     │ Managed TLS
      SPA Rewrites (/*)                                                      │ rejectUnauthorized: true
                                                                             ▼
                                                           ┌───────────────────────────────────┐
                                                           │   Render Staging PostgreSQL (v16) │
                                                           │       (trackup-staging-db)        │
                                                           └───────────────────────────────────┘
```

### Staging Routing Invariants & Configuration Contract
1. **Dedicated Routing File (`apps/web/vercel.staging.json`):**
   - Staging edge routing is defined in `apps/web/vercel.staging.json`.
   - Rule 1: `/api/:path*` -> `https://trackup-staging-api.onrender.com/api/:path*`.
   - Rule 2: `/(.*)` -> `/index.html` (SPA client routing fallback).
   - This ensures staging frontend traffic routes strictly to the staging API and never falls back to the production API.
2. **Production Routing Isolation (`apps/web/vercel.json`):**
   - Production routing remains strictly anchored to `https://trackup-api.onrender.com/api/:path*`.
   - Staging configuration changes have zero dependency or impact on production assets.
3. **Vercel Staging Deployment Workflows:**
   - **Vercel CLI / CI:** Deploy using the staging config flag:
     ```bash
     cd apps/web && vercel deploy --local-config vercel.staging.json
     ```
   - **Branch-Based Vercel Project:** When deploying a dedicated staging project from a `staging` branch, copy or link `vercel.staging.json` as `vercel.json` on the staging branch so Vercel's automated git parser uses the staging destination.
4. **Render Staging Infrastructure:**
   - **Web Service:** `trackup-staging-api` (Runtime: Node, Plan: Starter, Port: 10000).
   - **Database:** `trackup-staging-db` (PostgreSQL 16, Starter plan).
   - **Environment Variables:**
     - `NODE_ENV=production`
     - `DATABASE_URL`: Connection string for `trackup-staging-db` only.
     - `DATABASE_SSL=true`: Enforces strict TLS certificate verification.
     - `TRUST_PROXY=true`: Enforces reverse proxy trust for client IP and protocol.
     - `COOKIE_SECRET`: Unique 32+ character cryptographic secret distinct from production.
     - `CORS_ORIGIN`: Must be set in the Render Dashboard to match the staging Vercel domain (`https://trackup-staging.vercel.app`). Wildcards remain strictly prohibited.
