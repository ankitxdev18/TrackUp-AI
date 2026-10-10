# TrackUp Database Backup & Disaster Recovery Runbook

**Document Version:** 1.0.0  
**Target Architecture:** Render PostgreSQL 16 (Production) & Local PostgreSQL (Development/Testing)  
**Authoritative Scope:** Data integrity, disaster recovery, schema consistency, and backup verification.

---

## 1. Scope & Protected Database Objects

TrackUp's database backup and recovery plan encompasses the entire relational data model in PostgreSQL:

| Database Object Type | Count | Covered Elements |
| :--- | :--- | :--- |
| **Entity Tables** | 10 | `users`, `sessions`, `projects`, `tasks`, `goals`, `habits`, `habit_completions`, `ideas`, `journal_entries`, `calendar_events` |
| **Indexes** | 31 | Primary keys, foreign key lookup indexes, temporal range indexes (`sessions_expires_at_idx`, `calendar_events_start_time_idx`), and unique indexes (`users_email_unique_idx`) |
| **Foreign Keys** | 10 | Cascading deletes and referential integrity constraints linking child items to tenant `users.id` |
| **Migration Metadata** | 1 | Drizzle ORM migration state and schema version history |

---

## 2. Four-Tier Status Classification

To maintain operational honesty, TrackUp distinguishes between what is configured, what is recommended, what has been tested with hard evidence, and what remains unverified.

### Tier 1: Existing, Verified Configuration
- **Export & Import Engine:** PostgreSQL client binaries (`pg_dump`, `pg_restore`) are available and operational.
- **Connection Parameterization:** Secure connection string handling and password redaction (`sanitizeConnectionString`) are integrated into the application codebase.
- **TLS Hardening:** Database driver enforces TLS certificate validation (`DATABASE_SSL=true`, `rejectUnauthorized: true`).
- **Schema Compatibility:** Drizzle ORM migrations run reproducibly from compiled production builds (`npm run db:migrate:api:prod`).

### Tier 2: Recommended but Unconfigured Production Settings
- **Render PostgreSQL Tier:** We recommend deploying TrackUp to the **Render Starter tier ($7/month)** or higher. Render's Free PostgreSQL tier expires after 30 days and *does not retain automated backups*. The Starter tier provides automated daily snapshots retained for 7 days.
- **Automated Offsite Object Storage:** Scripted daily export to external AWS S3 or Cloudflare R2 bucket with 30-day lifecycle retention is recommended for disaster isolation outside Render's cloud infrastructure.
- **Automated Failure Alerting:** Webhook notification on backup failure (Slack/Discord/Email) is recommended once production traffic begins.

### Tier 3: Procedures Tested with Empirical Evidence
A full end-to-end backup and recovery drill was executed against an active database using a dedicated disposable environment:
1. **Source Database:** `TrackUp` (containing active schema, tables, and test records).
2. **Export Method:** `pg_dump --format=custom --no-owner --no-acl`.
   - **Export Duration:** 442 ms.
   - **Dump Archive Size:** 37,790 bytes.
3. **Isolation Mechanism:** Dedicated disposable database `trackup_restore_drill` created specifically for the test. **Production/source database was never overwritten.**
4. **Restoration Method:** `pg_restore --no-owner --no-acl`.
   - **Restore Duration:** 448 ms.
5. **Post-Restoration Verification:**
   - **Tables Restored:** 10 / 10 verified.
   - **Indexes Restored:** 31 / 31 verified.
   - **Foreign Keys Restored:** 10 / 10 verified.
   - **Health Connectivity:** Verified.
6. **Teardown:** `trackup_restore_drill` cleanly dropped; temporary dump file unlinked.
7. **Total Drill Runtime:** 2,677 ms.

### Tier 4: Procedures Remaining Unverified
- **Render Dashboard "Restore to New Instance" UI Drill:** Cannot be verified without an active paid Render cloud team account and running cloud instance.
- **Continuous Point-in-Time Recovery (PITR):** Second-by-second WAL replay requires Render Standard tier ($35/month+) and remains unverified on entry-level tiers.

---

## 3. Recovery Objectives: RPO & RTO

| Metric | Target (Starter Tier) | Target (with PITR) | Empirical Drill Observed |
| :--- | :--- | :--- | :--- |
| **RPO (Recovery Point Objective)** | 24 Hours (Daily Snapshot) | < 5 Minutes (WAL Replay) | N/A (Logical Snapshot) |
| **RTO (Recovery Time Objective)** | < 30 Minutes | < 15 Minutes | **448 milliseconds** (Data restoration) |

---

## 4. Disaster Recovery Runbook

### CRITICAL RULE
**NEVER execute a restore directly onto the production database.** Always restore to an isolated staging or new database, verify data integrity, and update the application connection string.

### Step 1: Generate Manual Logical Backup
When performing scheduled maintenance or pre-migration snapshots:
```bash
pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="trackup_backup_$(date +%Y%m%d_%H%M%S).dump" \
  "$DATABASE_URL"
```

### Step 2: Provision Isolated Recovery Target
Create a clean, isolated database for restoration verification:
```sql
CREATE DATABASE trackup_recovery_staging;
```

### Step 3: Execute Restoration
Restore the custom dump archive into the recovery database:
```bash
pg_restore \
  --no-owner \
  --no-acl \
  --dbname="$STAGING_DATABASE_URL" \
  "trackup_backup_<timestamp>.dump"
```

### Step 4: Verify Schema & Data Integrity
Run the verification queries:
```sql
-- 1. Verify all 10 core tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' ORDER BY table_name;

-- 2. Verify row counts on critical tables
SELECT 'users' AS table_name, count(*) FROM users
UNION ALL SELECT 'tasks', count(*) FROM tasks
UNION ALL SELECT 'projects', count(*) FROM projects
UNION ALL SELECT 'goals', count(*) FROM goals
UNION ALL SELECT 'habits', count(*) FROM habits;

-- 3. Verify foreign key integrity
SELECT count(*) FROM information_schema.table_constraints 
WHERE constraint_type = 'FOREIGN KEY';
```

### Step 5: Verify Application Connectivity
1. Point a staging instance of TrackUp API to `$STAGING_DATABASE_URL`.
2. Issue a health check request:
   ```bash
   curl -I https://staging-api.trackup.com/health
   # Expected: HTTP/1.1 200 OK {"status":"ok","db":"connected"}
   ```

### Step 6: Promote Restored Database
Once data integrity is confirmed:
1. Update `DATABASE_URL` in Render Web Service environment variables to point to the restored database.
2. Trigger a zero-downtime redeploy of TrackUp API.
3. Validate user authentication via `/api/auth/me`.

---

## 5. Security & Secret Handling
- **No Plaintext Passwords in Git:** Scripts and documentation must never contain real passwords or hardcoded credentials.
- **Log Sanitization:** All operational scripts must sanitize database URIs (`postgres://user:******@host:5432/db`) before outputting to logs.
- **Access Control:** Backup files contain full user data (including Argon2 password hashes). Dump files must be stored on encrypted disks with restricted filesystem permissions (`chmod 600`).
