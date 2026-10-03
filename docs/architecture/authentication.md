# Authentication & Session Architecture

This document establishes the architectural specifications, security boundaries, and lifecycle policies for identity, authentication, session management, and authorization in TrackUp.

---

## 1. Account Model

### What is a User?
In TrackUp, a **User** is an individual actor who owns an isolated workspace of goals, projects, and tasks. A user account represents the identity root to which all personal data, preferences, and security credentials attach.

### Uniqueness & Identifiers
- **Primary Identifier:** `id` — An opaque, high-entropy unique identifier (UUIDv4 or ULID / 128-bit) generated on user creation. Never reused or guessable.
- **Natural Identifier (Lookup Key):** `email` — Unique across the entire system. Case-insensitive index enforced at the database level (`UNIQUE INDEX users_email_unique_idx ON users (LOWER(email))`).

### Email Normalization
Email addresses must be normalized before database lookup, validation, or persistence to prevent duplicate account creation attacks and account lockout:
1. **Trim:** Strip leading and trailing whitespace.
2. **Lowercase:** Convert all characters to standard lowercase (`email.trim().toLowerCase()`).
3. **Format Validation:** Strict RFC-compliant regex validation via validation schema (rejecting invalid structures, control characters, or lengths exceeding 255 characters).
4. *Note on canonical sub-addressing (e.g. `+` tags):* No destructive alias stripping is performed by default so the user retains expected delivery mailbox targeting, but lowercasing and trimming are strictly mandatory.

### Account Lifecycle
- **Active:** Default state upon creation. User can authenticate and perform all authorized domain operations.
- **Suspended / Disabled:** Flag `isActive` (`true` / `false`).
  - **Suspension Invariant:** *A suspended account must not be able to establish or continue an authenticated session.*
  - Suspending a user atomically updates `isActive = false` and deletes all active sessions for that user within a single database transaction. Furthermore, the authentication middleware verifies `user.isActive === true` on every session lookup to guarantee immediate enforcement.
- **Deletion:** *Account deletion is outside the authentication MVP and will be specified separately.*

---

## 2. Password Security

### Password Hashing Algorithm: Argon2id
TrackUp specifies **Argon2id** (RFC 9106) as the primary password hashing function.

#### Why Argon2id?
Argon2id is a modern, memory-hard password hashing algorithm designed to make large-scale password guessing substantially more expensive while providing resistance against relevant side-channel and hardware-accelerated (GPU/ASIC) attacks.

*Default Parameters:*
- Memory cost: 64 MB (65,536 KiB)
- Time cost (iterations): 3
- Parallelism: 4 threads
- Salt: Cryptographically secure random 16 bytes per password.

### Password Requirements
- Minimum length: **10 characters** (favors length and passphrases, e.g., *"correct horse battery staple"*).
- Maximum length: **128 characters** (prevents algorithmic DoS via oversized payload hashing).
- Composition rules: **None**. Modern security guidance favors length and screening over arbitrary character requirements (such as forced uppercase, lowercase, numbers, or symbols).
- Breached / common password screening: Deferred to future production hardening.

### Plaintext Password Handling
- Plaintext passwords exist **only in ephemeral memory** during transit within HTTPS and during hashing in the authentication handler.
- Under no circumstances is plaintext password retained in memory longer than the hashing function execution.
- Plaintext passwords are never assigned to persistent data transfer objects (DTOs), never passed to database queries, and never assigned to logging contexts.

### Password Logging Rules
- **Absolute Prohibition:** Plaintext passwords, password hashes, password reset tokens, and temporary credentials must **NEVER** appear in application logs, database logs, monitoring metrics, exception traces, or error payloads.
- **Complete Body Redaction:** Never log complete request bodies for authentication endpoints (`/api/auth/*`), preventing generic HTTP logging middleware from accidentally bypassing field-level redaction.

---

## 3. Session Model

### Database-Backed vs. Stateless (JWT)
TrackUp adopts a **Database-Backed Stateful Session Model** using opaque, cryptographically secure bearer tokens stored in HTTP-only cookies.

#### Why Not Stateless JWTs?
1. **Immediate Revocation:** In stateless JWTs, invalidating a session before its expiration requires maintaining a distributed blocklist (which reintroduces state and database lookups, defeating the premise of statelessness).
2. **Session Enumeration:** A database-backed session table enables users to view active login sessions across devices and revoke specific devices or all other sessions.
3. **Session Mutation:** Privilege changes, account suspensions, or password resets take effect instantly across all active requests without waiting for token TTL expiration.
4. **Simplicity & Predictability:** Eliminates the complexities of refresh token rotation, token hijacking mitigation, and signature replay attacks.

### Session Identifier & Token Generation
- **Token Generation:** 32 bytes (256 bits) of cryptographically secure random entropy generated via Node.js `crypto.randomBytes(32)`, encoded as a URL-safe Base64 or Hex string.
- **Storage Strategy (Hash-at-Rest):**
  - The client receives the raw session token in the cookie.
  - The database **does not** store the raw session token. It stores a SHA-256 hash of the token (`token_hash = SHA256(raw_token)`).
  - *Security Benefit:* If the database is compromised, an attacker cannot impersonate active sessions because the raw token cannot be reversed from the SHA-256 hash.

### Database Session Schema
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID / String | Primary key of the session record |
| `user_id` | UUID / String | Foreign key to `users.id` (`ON DELETE CASCADE`) |
| `token_hash` | VARCHAR(64) | SHA-256 digest of the session token (`UNIQUE INDEX`) |
| `ip_address` | VARCHAR(45) | Client IP address at session creation |
| `user_agent` | TEXT | Browser User-Agent at session creation |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `expires_at` | TIMESTAMPTZ | Absolute expiration timestamp (`created_at + 30 days`) |
| `last_seen_at` | TIMESTAMPTZ | Timestamp of the most recent authenticated activity |

### Session Expiration Policy
Effective expiration is defined precisely as:

$$\mathbf{\text{Effective Expiration}} = \mathbf{\min(\text{Absolute Expiration}, \text{Idle Expiration})}$$

- **Absolute Expiration:** `created_at + 30 days` unconditionally.
- **Idle Expiration:** `last_seen_at + 7 days`. If inactive for 7 consecutive days, the session expires.
- Whichever occurs first terminates the session.
- **Rolling Update:** `last_seen_at` is updated at most once every 15 minutes to reduce database write amplification.

### Session Revocation
- **Single Session Revocation:** Deleting a specific session row terminates that device session instantly.
- **Global Revocation:** Deleting all session rows where `user_id = :userId` terminates all devices (e.g. on password reset or explicit "Log out of all devices").

---

## 4. Production Topology & Cookie Model

### Production Deployment Topology
Production frontend and API will use subdomains of the same registrable TrackUp-controlled domain where practical:
- **Frontend App:** `https://app.trackup.example`
- **Backend API:** `https://api.trackup.example`
*(The exact deployment provider is deferred.)*

This establishes a clean **same-site, cross-origin** relationship:
- Requests from `app.trackup.example` to `api.trackup.example` via `fetch(..., { credentials: "include" })` remain **same-site**, making cookie-based session management predictable and standard without fighting third-party cookie blocking.

### Cookie Attributes & Rationales

```http
Set-Cookie: __Host-trackup_session=<raw_token>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000
```

1. **Not Encrypted — Secret Bearer Credential:**
   The cookie itself is **not** encrypted by the application.
   - **HTTPS (TLS)** encrypts the HTTP transport in flight.
   - **`HttpOnly`** prevents client-side JavaScript (`document.cookie`) from reading the cookie, neutralizing XSS token theft.
   - **`Secure`** prevents the browser from transmitting the cookie over unencrypted HTTP.
   - **`SameSite=Lax`** controls cross-site sending, preventing cross-site subresource POSTs while allowing top-level link navigations.
2. **`Path=/`:**
   Ensures the cookie is sent to all routes on the host.
3. **Cookie Prefix (`__Host-` in Production):**
   - *Production Cookie Name:* `__Host-trackup_session`
   - *Development Cookie Name:* `trackup_session`
   - **Host-Only Behavior:** `__Host-` cookies belong strictly to the issuing host (e.g., `api.trackup.example`). They omit the `Domain` attribute and cannot be read by `app.trackup.example` or any other subdomain. The browser automatically handles attaching the cookie to credentialed requests destined for the API host, meaning the frontend never needs direct access to the cookie.

---

## 5. Authentication Flows

### A. Signup Flow
```
User (Browser)               API Gateway / Fastify                 Database
     │                                 │                               │
     │── POST /api/auth/signup ───────>│                               │
     │   { email, password, name }     │                               │
     │                                 │── Validate schema (Zod)       │
     │                                 │── Normalize email             │
     │                                 │── Check existing email ──────>│
     │                                 │<── Null (unique) ─────────────│
     │                                 │                               │
     │                                 │── Hash password (Argon2id)    │
     │                                 │── Insert User ───────────────>│
     │                                 │<── Created User (id) ─────────│
     │                                 │                               │
     │                                 │── Generate raw token (crypto) │
     │                                 │── Hash token (SHA-256)        │
     │                                 │── Insert Session ────────────>│
     │                                 │<── Session confirmed ─────────│
     │                                 │                               │
     │<── 201 Created ─────────────────│                               │
     │    Set-Cookie: trackup_session  │                               │
     │    Body: { user: { id, email } }│                               │
```

1. **Input Validation:** Request body validated against schema (email format, 10–128 character password, name).
2. **Email Normalization:** Trimming and lowercasing.
3. **Collision Check:** Verify email does not already exist. If it exists, return error cleanly without revealing unexpected details.
4. **Password Hashing:** Hash password with Argon2id.
5. **Persistence:** Insert user record into `users` table.
6. **Session Creation:** Generate 32-byte token, hash with SHA-256, insert into `sessions` table.
7. **Response:** Attach `Set-Cookie` with secure attributes and return sanitized user entity.

---

### B. Login Flow
```
User (Browser)               API Gateway / Fastify                 Database
     │                                 │                               │
     │── POST /api/auth/login ────────>│                               │
     │   { email, password }           │                               │
     │                                 │── Validate schema (Zod)       │
     │                                 │── Normalize email             │
     │                                 │── Query User by email ───────>│
     │                                 │<── Return User with hash ─────│
     │                                 │                               │
     │                                 │── Argon2id.verify(hash, pass) │
     │                                 │   [If mismatch -> 401]        │
     │                                 │                               │
     │                                 │── Generate raw token (crypto) │
     │                                 │── Hash token (SHA-256)        │
     │                                 │── Insert Session ────────────>│
     │                                 │<── Session confirmed ─────────│
     │                                 │                               │
     │<── 200 OK ──────────────────────│                               │
     │    Set-Cookie: trackup_session  │                               │
     │    Body: { user: { id, email } }│                               │
```

1. **Input Validation:** Ensure email and password fields are present and well-formed.
2. **User Lookup:** Query database by normalized email.
   - *Constant-Time Defense:* If the user does not exist, perform a dummy Argon2id verification against a static hash to eliminate timing discrepancies between existing and non-existing accounts.
3. **Password Verification:** Verify candidate password against stored Argon2id hash. If invalid, return `401 Unauthorized` with generic message: `"Invalid email or password"`.
4. **Session Creation:** Generate new 32-byte raw token, store SHA-256 hash in `sessions` table with expiration timestamps.
5. **Cookie Issuance:** Send `Set-Cookie` with raw token; return sanitized user record (`id`, `email`, `name`, `createdAt`).

---

### C. Logout Flow
```
User (Browser)               API Gateway / Fastify                 Database
     │                                 │                               │
     │── POST /api/auth/logout ───────>│                               │
     │   Cookie: trackup_session       │                               │
     │                                 │── Extract token & hash        │
     │                                 │── Delete session by hash ────>│
     │                                 │<── 1 row deleted ─────────────│
     │                                 │                               │
     │<── 200 OK ──────────────────────│                               │
     │    Set-Cookie: trackup_session=;│                               │
     │    Max-Age=0; Expires=Thu, ...  │                               │
     │    Body: { success: true }      │                               │
```

1. **Extract Token:** Retrieve token from incoming cookie.
2. **Server-Side Invalidation:** Calculate SHA-256 hash and delete matching record from `sessions` table.
3. **Client-Side Cookie Destruction:** Return `Set-Cookie` header setting cookie value to empty string and `Max-Age=0` (`Expires` in the past).
4. **Response:** Return `200 OK`. Even if the session had already expired or was not found in the DB, the client cookie is cleared idempotently.

---

## 6. Request Authentication Lifecycle

Every incoming request to a protected endpoint traverses a centralized Fastify `preHandler` authentication hook:

```
Incoming Request
      │
      ▼
1. Extract Cookie: `trackup_session` (or `__Host-trackup_session`)
      │
      ├─── [Cookie missing] ───────────► Abort: 401 Unauthorized ("Authentication required")
      │
      ▼
2. Hash Token: `SHA-256(raw_token)`
      │
      ▼
3. Database Lookup: Join `sessions` + `users` ON `token_hash`
      │
      ├─── [Session not found] ────────► Clear Cookie + Abort: 401 Unauthorized ("Invalid session")
      │
      ▼
4. Expiration & Status Checks:
      │
      ├─── [NOW() > effective_exp] ────► Delete Session + Clear Cookie + Abort: 401 ("Session expired")
      ├─── [user.isActive === false] ──► Delete Session + Abort: 403 Forbidden ("Account suspended")
      │
      ▼
5. Populate Request Context:
      `request.user = { id: user.id, email: user.email, name: user.name }`
      `request.sessionId = session.id`
      │
      ▼
6. Optional Activity Bump:
      If `session.last_seen_at < NOW() - 15 minutes`:
          Update `session.last_seen_at = NOW()` asynchronously.
      │
      ▼
Route Handler Executes
```

---

## 7. Authorization & The Ownership Invariant

### Authentication vs. Authorization

| Concept | Question | Mechanism | Responsibility |
| :--- | :--- | :--- | :--- |
| **Authentication (AuthN)** | *"Who are you?"* | Cookie, Session lookup, Token verification | Fastify pre-handler hook (`authenticate`) |
| **Authorization (AuthZ)** | *"Are you allowed to perform this operation on this resource?"* | Ownership check, Role check | Service / Data Access Layer |

### The TrackUp Ownership Invariant
In TrackUp, every tenant resource (tasks, projects, goals, metrics) belongs strictly to a single User.

$$\text{Ownership Invariant: } \mathbf{resource.userId \equiv authenticatedUser.id}$$

#### Enforcement Rules
1. **Implicit Scoping on Queries:**
   All queries for reading, updating, or deleting user-owned resources must enforce ownership directly in the SQL `WHERE` clause:
   ```sql
   -- Correct: Scoped to tenant
   SELECT * FROM tasks WHERE id = :taskId AND user_id = :authenticatedUserId;
   UPDATE tasks SET ... WHERE id = :taskId AND user_id = :authenticatedUserId;
   DELETE FROM tasks WHERE id = :taskId AND user_id = :authenticatedUserId;

   -- FORBIDDEN: Unscoped lookup followed by manual check
   SELECT * FROM tasks WHERE id = :taskId; -- Vulnerable to race conditions / IDOR leaks
   ```
2. **Foreign Key Integrity:**
   When creating resources that reference parent entities (e.g. assigning a task to `projectId`), the service layer must verify that the referenced parent resource also satisfies the ownership invariant before persisting the association.

---

## 8. Route Protection: Frontend vs. Backend

### Dual-Layer Protection

```
┌────────────────────────────────────────────────────────┐
│ BROWSER (React / Vite)                                 │
│                                                        │
│  [User clicks /dashboard]                              │
│       │                                                │
│  Frontend Route Guard (<ProtectedRoute>)               │
│       ├── If auth state is null -> Redirect /login     │
│       └── If auth state exists -> Render view          │
└───────────────────────────┬────────────────────────────┘
                            │
                      HTTP Request
                            │
┌───────────────────────────▼────────────────────────────┐
│ BACKEND (Fastify API)                                  │
│                                                        │
│  Fastify Route Pre-Handler Hook                        │
│       ├── Check Session Cookie                         │
│       ├── Verify DB Session                            │
│       ├── Reject -> 401 Unauthorized (HARD STOP)       │
│       └── Pass -> Execute route logic                  │
└────────────────────────────────────────────────────────┘
```

### Why Frontend Route Guards are NOT a Security Boundary
1. **Client-Side Code is Untrusted:** All JavaScript in the browser runs under the user's direct control. Anyone can bypass a React route guard using browser developer tools, modifying local storage, disabling JavaScript, or making direct HTTP requests via `curl` / Postman.
2. **Purpose of Frontend Guards:** Frontend route guards exist purely for **User Experience (UX)** — eliminating flashing screens, routing unauthenticated users to login, and maintaining navigation state.
3. **The True Boundary:** The **Fastify API is the only security boundary**. The database must be completely inaccessible to unauthorized parties regardless of what the client claims or renders.

---

## 9. Error Semantics: 401 vs. 403 vs. 404

| Status Code | Meaning | When to Return | Client Action |
| :--- | :--- | :--- | :--- |
| **`401 Unauthorized`** | Missing or invalid identity | - No session cookie provided<br>- Session token not found in database<br>- Session has expired<br>- Invalid token formatting | Clear local auth state; redirect to `/login` |
| **`403 Forbidden`** | Identity is known, but access is refused | - Authenticated user account is disabled/suspended<br>- Authenticated user attempts an administrative endpoint<br>- CSRF origin validation failure | Show permission error page; do not log out |
| **`404 Not Found`** | Resource does not exist | - Resource does not exist<br>- Cross-tenant ownership failure (User A requests User B's resource) | Show resource not found message |

### IDOR & Ownership Failures: Why 404 Instead of 403?
When User A requests User B's task (`GET /api/tasks/:id`):
- **Do NOT return `403 Forbidden`**: Returning `403` informs the attacker that the resource exists, confirming valid IDs (ID Enumeration vulnerability).
- **Return `404 Not Found`**: Because the query filters by `WHERE id = :taskId AND user_id = :userId`, exactly 0 rows match. The API consistently responds with `404 Not Found`, giving zero information about whether the resource exists for other users.

---

## 10. Session Expiration & Invalidation Lifecycle

1. **Natural Expiration:**
   - When `NOW() > effective_expiration`, the authentication middleware flags the session as expired.
   - The session row is immediately deleted from the database.
   - A `Set-Cookie` header is sent with `Max-Age=0` to clear the browser cookie.
   - Response: `401 Unauthorized` (`code: "SESSION_EXPIRED"`).
2. **Explicit Revocation:**
   - Occurs on logout, password change, or session termination from another device.
   - The session row is deleted from the DB.
   - Any concurrent or subsequent request presenting that token cannot match a DB row and receives `401 Unauthorized` (`code: "INVALID_SESSION"`).
3. **Invalid Token Presented:**
   - If an unrecognized or malformed token is submitted, the server rejects it with `401 Unauthorized` and instructs the browser to clear the bogus cookie.
4. **Returning After Expiration:**
   - The frontend's initial bootstrap query (`GET /api/auth/me`) receives `401`.
   - The frontend resets its authentication context and redirects the user to `/login?redirectTo=...`.

---

## 11. Cross-Site Request Forgery (CSRF) Strategy

### Threat Model & Defense Boundary
TrackUp uses cookie-based authentication. The primary defense against CSRF is a strict defense-in-depth model combining:
1. **Origin Header Validation**
2. **`SameSite=Lax` Cookie Policy**
3. **Strict CORS Policy**
4. **Non-simple Authenticated API Requests**

### Deterministic Origin / Referer Validation Rule
For all state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`):

```
Is Origin header present?
  ├── YES: Does Origin match allowed frontend origins?
  │          ├── YES: Proceed
  │          └── NO:  Reject with 403 Forbidden ("CSRF_ORIGIN_INVALID")
  │
  └── NO:  Is Referer header present?
             ├── YES: Does Referer origin match allowed origins?
             │          ├── YES: Proceed
             │          └── NO:  Reject with 403 Forbidden ("CSRF_REFERER_INVALID")
             │
             └── NO:  Reject with 403 Forbidden ("CSRF_HEADER_MISSING")
                      (Browser-facing authenticated mutations must identify origin)
```

Safe methods (`GET`, `HEAD`, `OPTIONS`) must remain strictly idempotent and safe; they must never trigger state-changing side effects.

---

## 12. Rate Limiting & Abuse Prevention

Authentication endpoints are high-value targets for brute-force attacks, credential stuffing, and denial-of-service.

### Target Endpoints
Rate limiting is mandatory for all unauthenticated authentication endpoints:
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password` (future)
- `POST /api/auth/reset-password` (future)

### Policy Specifications (Initial MVP Limits — Subject to Tuning)
- **Per-IP Rate Limit:**
  - Login attempts: Maximum 5 failed attempts per IP address per 15-minute window.
  - Signup attempts: Maximum 3 registrations per IP address per hour (prevents automated bot creation).
- **Per-Account Rate Limit (Credential Stuffing Protection):**
  - Maximum 5 failed attempts per target normalized email address within a 15-minute window, triggering temporary exponential backoff.
  - *Side-Channel Prevention:* Per-account rate limits must return consistent error messages and response structures to ensure rate limiting does not become an account-enumeration vector.
- **Handling Breaches:**
  - Return `429 Too Many Requests` with a `Retry-After: <seconds>` response header.

---

## 13. Security Logging & Auditing

### What MUST Be Logged
- `auth.signup.success`: User ID, timestamp, IP address, user agent.
- `auth.login.success`: User ID, session ID, timestamp, IP address.
- `auth.login.failure`: Target normalized email, timestamp, IP address, failure reason (e.g. `USER_NOT_FOUND`, `INVALID_PASSWORD`), rate limit counters.
- `auth.logout`: User ID, session ID, timestamp.
- `auth.session.revoked`: Session ID, target user ID, reason (`EXPIRED`, `USER_INITIATED`, `PASSWORD_RESET`).
- `auth.rate_limit.exceeded`: IP address, target endpoint, window stats.

### What Must NEVER Be Logged
1. **Plaintext passwords** (at any time, in any format).
2. **Password hashes** (Argon2id strings).
3. **Raw session tokens** (the 32-byte secret sent to the browser).
4. **Password reset tokens / email verification codes**.
5. **Authorization / Session headers** in unredacted HTTP dump logs.
6. **Complete request bodies** on authentication endpoints (`/api/auth/*`).

---

## 14. Architecture Review & Scenario Walkthrough

### Scenario 1: New User Registration & Onboarding
1. User submits signup form (`email`, `password`, `name`).
2. Server validates inputs via Zod, normalizes email, checks uniqueness.
3. Password hashed with Argon2id; user record inserted into `users`.
4. Session generated; SHA-256 token hash inserted into `sessions`.
5. Cookie `trackup_session` returned with `HttpOnly; Secure; SameSite=Lax`.
6. Frontend receives user entity, initializes user context, routes to `/onboarding`.

### Scenario 2: Existing User Login
1. User submits login form (`email`, `password`).
2. Server looks up user by normalized email.
3. Password verified using Argon2id (`argon2.verify`).
4. New session generated and persisted in `sessions` table.
5. Cookie attached; frontend receives `200 OK` and navigates to `/dashboard`.

### Scenario 3: Unauthenticated Access to Protected API
1. Client sends `GET /api/tasks` without cookie or with empty cookie.
2. Fastify `authenticate` hook detects missing cookie.
3. Fastify halts execution immediately, returning `401 Unauthorized` with `{ "error": "Authentication required", "code": "UNAUTHENTICATED" }`.
4. Task service/database logic is never called.

### Scenario 4: Cross-Tenant Data Access (User A accesses User B's Task)
1. User A (authenticated as `user_123`) calls `GET /api/tasks/task_999` (owned by `user_456`).
2. Fastify verifies User A's session and attaches `request.user.id = "user_123"`.
3. Task service executes: `SELECT * FROM tasks WHERE id = 'task_999' AND user_id = 'user_123'`.
4. Database returns 0 rows.
5. API returns `404 Not Found` with `{ "error": "Task not found" }`. No data is leaked, and User A cannot determine if `task_999` exists.

### Scenario 5: Expired Session
1. User submits request with cookie whose session has exceeded `effective_expiration`.
2. Fastify looks up session by token hash, finds expiration condition met.
3. Fastify deletes session from DB, sets `Set-Cookie` with `Max-Age=0`, and returns `401 Unauthorized` (`code: "SESSION_EXPIRED"`).
4. Frontend auth interceptor catches 401, clears local state, and prompts user to log in again.

### Scenario 6: User Logout
1. User clicks "Sign Out". Frontend sends `POST /api/auth/logout`.
2. Fastify deletes the session record from `sessions` by its token hash.
3. Server returns `200 OK` with clearing `Set-Cookie` header.
4. Subsequent requests with that cookie fail with `401 Unauthorized` because the session no longer exists in the database.
