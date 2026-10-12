# Profile & Settings Feature Documentation

## Overview

The **Profile & Settings** feature provides TrackUp users with a unified workspace to manage their account identity, authoritative regional scheduling preferences, visual interface themes, and security credentials.

## Architectural Design

### 1. Zero-Migration Data Model
Profile & Settings operates strictly on existing tables (`users` and `sessions`) without any new database migrations or schema modifications:
- `users.id`: Immutable UUID primary key.
- `users.email`: Read-only identity identifier (email change deferred to V1).
- `users.name`: Mutable user display name (1–255 characters).
- `users.timezone`: Authoritative IANA time zone identifier (defaults to `UTC`).
- `users.passwordHash`: Argon2id hashed password string.
- `users.createdAt` / `users.updatedAt`: Account lifecycle timestamps.

### 2. Backend Endpoints

#### `GET /api/auth/me`
- **Authentication**: Required (Cookie-based session).
- **Response**: Safe user payload including `id`, `email`, `name`, `timezone`, and `createdAt` (ISO 8601).
- **Security**: Never exposes `passwordHash`, session tokens, or internal flags.

#### `PATCH /api/auth/profile`
- **Authentication**: Required (`requireAuth`).
- **Validation**:
  - `name`: String, trimmed, 1–255 characters (optional).
  - `timezone`: Valid IANA identifier verified via `Intl.DateTimeFormat` (optional).
  - At least one field required.
- **Side Effects**: Updates `users.name` and/or `users.timezone`, touches `updatedAt`.
- **Response**: HTTP 200 with updated safe user object.

#### `POST /api/auth/change-password`
- **Authentication**: Required (`requireAuth`).
- **Rate Limiting**: Protected by auth route limiter.
- **Validation**:
  - `currentPassword`: Required string.
  - `newPassword`: Enforces `PASSWORD_POLICY` (10–128 characters), must differ from `currentPassword`.
- **Security Lifecycle**:
  1. Verifies current password against stored Argon2id hash. Returns `401 INCORRECT_CURRENT_PASSWORD` if invalid.
  2. Generates fresh Argon2id hash for `newPassword`.
  3. Atomically updates `users.passwordHash` and `users.updatedAt`.
  4. Calls `invalidateAllUserSessions(user.id)` to immediately terminate all existing sessions.
  5. Creates a fresh session for the current client caller and issues a new `trackup_session` cookie via `Set-Cookie`.
- **Response**: HTTP 200 with `{ message: "Password changed successfully", sessionsRevoked: true }`.

### 3. Frontend Architecture

#### `SettingsPage.tsx`
- Located at `/settings`.
- Divided into three distinct panels:
  1. **Profile & Regional Identity**: Full Name input, read-only Email with security indicator, Member Since badge, searchable/grouped IANA time zone dropdown, one-click "Use Local" detector, and live time clock.
  2. **Appearance & Theme**: Interactive **Dark (Obsidian)** and **Light (Clean)** cards with instant CSS variable switching and miniature UI previews.
  3. **Account Security**: Password rotation inputs with show/hide eye toggles, real-time criteria checklist, and remote session revocation notice.

#### Theme Manager (`utils/theme.ts`)
- Storage key: `trackup_theme`.
- Modifies `data-theme` attribute and `.theme-light` class on document root.
- Uses existing CSS variables defined in `index.css`.
- Bootstrapped during initial page hydration in `main.tsx`.

## Verification & Test Coverage

- **Backend Integration Tests**: [`apps/api/test/profile-settings.api.test.ts`](file:///d:/Projects/TrackUp-AI/apps/api/test/profile-settings.api.test.ts) (14 tests).
- **Frontend Unit Tests**: [`apps/web/src/test/settings.test.tsx`](file:///d:/Projects/TrackUp-AI/apps/web/src/test/settings.test.tsx) (8 tests).
- **Shell Navigation Tests**: [`apps/web/src/test/shell.test.tsx`](file:///d:/Projects/TrackUp-AI/apps/web/src/test/shell.test.tsx) (23 tests).
