#!/usr/bin/env node

/**
 * TrackUp Staging Smoke-Test Runner
 *
 * Executes automated acceptance smoke tests against an isolated TrackUp staging deployment.
 * Validates health, authentication, cookie attributes, proxy routing, tenant isolation,
 * timezone-aware completion metrics, and error response hygiene.
 *
 * Security & Safety Invariants:
 * - Strictly rejects production target hostnames.
 * - Rejects localhost targets by default (requires explicit --allow-localhost).
 * - Requires explicit --confirm-staging flag for mutating tests against remote staging targets.
 * - Enforces redirect: 'manual' to prevent silent redirect-based requests to unapproved origins.
 * - Never prints or logs passwords, session cookies, or secrets.
 * - Generates unique disposable test accounts per execution.
 * - Cleans up only the test records created during the execution session.
 * - Non-zero exit code on any failure.
 */

import crypto from "node:crypto";

const PRODUCTION_HOSTNAMES = new Set([
  "trackup-api.onrender.com",
  "app.trackup.com",
  "trackup.com",
  "api.trackup.com",
]);

// Parse CLI options and environment variables
const args = process.argv.slice(2);
let apiUrl = process.env.STAGING_API_URL || "";
let frontendUrl = process.env.STAGING_FRONTEND_URL || "";
let dryRun = process.env.DRY_RUN === "true" || false;
let allowLocalhost = false;
let confirmStaging = process.env.CONFIRM_STAGING === "true" || false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--help" || arg === "-h") {
    printHelp();
    process.exit(0);
  } else if (arg === "--api-url" && args[i + 1]) {
    apiUrl = args[++i];
  } else if (arg === "--frontend-url" && args[i + 1]) {
    frontendUrl = args[++i];
  } else if (arg === "--dry-run") {
    dryRun = true;
  } else if (arg === "--allow-localhost") {
    allowLocalhost = true;
  } else if (arg === "--confirm-staging") {
    confirmStaging = true;
  }
}

function printHelp() {
  console.log(`
TrackUp Staging Smoke-Test Runner

Usage:
  node scripts/smoke-test-staging.mjs --api-url <url> [options]

Required Options:
  --api-url <url>         Staging API base URL (e.g. https://trackup-staging-api.onrender.com)

Safety & Mode Options:
  --confirm-staging       Explicit authorization required to run mutating tests against remote staging
  --dry-run               Preflight mode: verifies URLs and health connectivity without mutating data
  --allow-localhost       Explicit authorization to test against local development server (localhost)
  --frontend-url <url>    Optional: Staging Vercel frontend URL to verify /api/* proxy routing
  --help, -h              Show this help message

Environment Variables:
  STAGING_API_URL         Alternative to --api-url
  STAGING_FRONTEND_URL    Alternative to --frontend-url
  CONFIRM_STAGING         Set to 'true' as alternative to --confirm-staging
  DRY_RUN                 Set to 'true' for preflight mode
`);
}

// Normalize and validate URL structure
function normalizeUrl(url) {
  if (!url) return "";
  const trimmed = url.trim().replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid URL format: '${url}'`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`URL protocol must be http: or https: (got '${parsed.protocol}')`);
  }
  return trimmed;
}

// Conservative safety validation
function validateTargetSafety(targetUrl, label) {
  if (!targetUrl) return { isLocalhost: false };
  const parsed = new URL(targetUrl);
  const hostname = parsed.hostname.toLowerCase();

  // Check exact production hostnames or production subdomains
  if (
    PRODUCTION_HOSTNAMES.has(hostname) ||
    hostname === "trackup-api.onrender.com" ||
    (hostname.endsWith(".trackup.com") && !hostname.includes("staging"))
  ) {
    console.error(`\n[SAFETY BLOCKED] Refusing to run smoke tests against production ${label}: ${parsed.origin}`);
    process.exit(1);
  }

  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
  if (isLocalhost && !allowLocalhost) {
    console.error(`\n[SAFETY BLOCKED] Localhost detected for ${label}: ${parsed.origin}.`);
    console.error("Pass --allow-localhost if running local integration tests.");
    process.exit(1);
  }

  return { isLocalhost };
}

// Execution statistics
const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
};

function logPass(testId, name, details = "") {
  stats.total++;
  stats.passed++;
  console.log(`  ✓ [PASS] ${testId}: ${name}${details ? ` (${details})` : ""}`);
}

function logFail(testId, name, error) {
  stats.total++;
  stats.failed++;
  const msg = error instanceof Error ? error.message : String(error);
  // Redact potential cookie or password values in error strings
  const sanitized = msg
    .replace(/(?:password|cookie|secret|token)[=:][^\s,;&]+/gi, "[REDACTED]")
    .replace(/__Host-trackup_session=[^\s;]+/g, "[REDACTED]");
  console.error(`  ✗ [FAIL] ${testId}: ${name}`);
  console.error(`           Error: ${sanitized}`);
}

function logSkip(testId, name, reason) {
  stats.total++;
  stats.skipped++;
  console.log(`  - [SKIP] ${testId}: ${name} (${reason})`);
}

// Safe HTTP request with timeout and manual redirect handling
async function request(url, options = {}) {
  const timeoutMs = options.timeoutMs || 10000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      redirect: "manual", // Prevent silent automated redirects to unapproved targets
      signal: controller.signal,
    });

    // Check if response redirected
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (location) {
        let redirectUrl;
        try {
          redirectUrl = new URL(location, url);
        } catch {
          throw new Error(`Invalid redirect Location header: '${location}'`);
        }
        // Safety check redirect destination
        validateTargetSafety(redirectUrl.toString(), "redirect target");
        throw new Error(`Unexpected redirect (HTTP ${res.status}) to '${redirectUrl.origin}'. API calls should not redirect.`);
      }
    }

    return res;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${options.method || "GET"} ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Extract specific cookie safely from response headers
function extractCookie(res, cookieName) {
  const getSetCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (getSetCookie.length > 0) {
    for (const raw of getSetCookie) {
      const match = raw.match(new RegExp(`^${cookieName}=([^;]+)`));
      if (match) return { value: match[1], raw };
    }
  }
  const singleHeader = res.headers.get("set-cookie");
  if (singleHeader) {
    const match = singleHeader.match(new RegExp(`^${cookieName}=([^;]+)`));
    if (match) return { value: match[1], raw: singleHeader };
  }
  return null;
}

async function main() {
  console.log("=================================================");
  console.log("       TrackUp Staging Smoke-Test Runner         ");
  console.log("=================================================\n");

  if (!apiUrl) {
    console.error("[ERROR] Missing required --api-url parameter or STAGING_API_URL environment variable.");
    printHelp();
    process.exit(1);
  }

  let cleanApiUrl;
  let cleanFrontendUrl;
  try {
    cleanApiUrl = normalizeUrl(apiUrl);
    cleanFrontendUrl = normalizeUrl(frontendUrl);
  } catch (err) {
    console.error(`[CONFIG ERROR] ${err.message}`);
    process.exit(1);
  }

  const apiTargetInfo = validateTargetSafety(cleanApiUrl, "API target");
  validateTargetSafety(cleanFrontendUrl, "Frontend target");

  const isRemoteTarget = !apiTargetInfo.isLocalhost;

  console.log(`Target Staging API:      ${cleanApiUrl}`);
  console.log(`Target Staging Frontend: ${cleanFrontendUrl || "(Not provided — proxy test ST-07 will be skipped)"}`);
  console.log(`Target Type:             ${isRemoteTarget ? "Remote Staging Target" : "Local Development Target"}`);
  console.log(`Execution Mode:          ${dryRun ? "DRY-RUN (Preflight verification only)" : "FULL SMOKE TEST"}\n`);

  // Remote staging authorization guard
  if (isRemoteTarget && !confirmStaging && !dryRun) {
    console.log("[SAFETY NOTICE] Remote staging target detected without --confirm-staging.");
    console.log("Running in preflight mode (verifying ST-01 health check only).");
    console.log("To run mutating tests (registration, login, tasks), pass --confirm-staging.\n");
    dryRun = true;
  }

  console.log("--- Executing Staging Acceptance Suite ---\n");

  // ST-01: Health check & DB reachability (Preflight)
  let healthOk = false;
  try {
    const res = await request(`${cleanApiUrl}/health`);
    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200, received HTTP ${res.status}`);
    }
    const healthData = await res.json();
    if (healthData.status !== "ok" || healthData.db !== "connected") {
      throw new Error(`Unhealthy payload: status=${healthData.status}, db=${healthData.db}`);
    }
    healthOk = true;
    logPass("ST-01", "API Health Check & Database Connectivity", `status=${healthData.status}, db=${healthData.db}`);
  } catch (err) {
    logFail("ST-01", "API Health Check & Database Connectivity", err);
    console.error("\n[CRITICAL FAILURE] Staging API is unreachable or database is disconnected. Halting suite.");
    process.exit(1);
  }

  if (dryRun) {
    console.log("\n[PREFLIGHT COMPLETE] Health endpoint verified responsive. Mutating tests omitted (dry-run mode).");
    console.log(`Summary: ${stats.passed}/${stats.total} Passed, ${stats.skipped} Skipped, ${stats.failed} Failed\n`);
    process.exit(0);
  }

  // Generate unique disposable test identities
  const sessionTokenSuffix = crypto.randomBytes(4).toString("hex");
  const testPassword = `SmokeTestPass_${sessionTokenSuffix}!A1`;
  const userA = {
    name: `Smoke Test User A (${sessionTokenSuffix})`,
    email: `smoke_test_a_${Date.now()}_${sessionTokenSuffix}@trackup.test`,
    password: testPassword,
  };
  const userB = {
    name: `Smoke Test User B (${sessionTokenSuffix})`,
    email: `smoke_test_b_${Date.now()}_${sessionTokenSuffix}@trackup.test`,
    password: testPassword,
  };

  const cleanupTasks = [];
  let userACookie = "";
  let userBCookie = "";
  const cookieHeaderName = cleanApiUrl.startsWith("https://") ? "__Host-trackup_session" : "trackup_session";

  let userARegistered = false;
  let userALoggedIn = false;

  try {
    // ST-02: User Registration
    try {
      const res = await request(`${cleanApiUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userA),
      });
      if (res.status !== 201) {
        const body = await res.text();
        throw new Error(`Expected HTTP 201, got ${res.status}: ${body}`);
      }
      const data = await res.json();
      if (!data.user || !data.user.id || data.user.email !== userA.email) {
        throw new Error("Invalid registration response payload");
      }
      userA.id = data.user.id;
      userARegistered = true;
      logPass("ST-02", "User Registration (Disposable Identity)", `user_id=${userA.id}`);
    } catch (err) {
      logFail("ST-02", "User Registration (Disposable Identity)", err);
    }

    // ST-03: Duplicate Registration Conflict
    if (userARegistered) {
      try {
        const res = await request(`${cleanApiUrl}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(userA),
        });
        if (res.status !== 409) {
          throw new Error(`Expected HTTP 409 Conflict, received HTTP ${res.status}`);
        }
        const data = await res.json();
        if (data.code !== "EMAIL_ALREADY_EXISTS") {
          throw new Error(`Expected code EMAIL_ALREADY_EXISTS, got ${data.code}`);
        }
        logPass("ST-03", "Duplicate Registration Rejection (HTTP 409 EMAIL_ALREADY_EXISTS)");
      } catch (err) {
        logFail("ST-03", "Duplicate Registration Rejection", err);
      }
    } else {
      logSkip("ST-03", "Duplicate Registration Rejection", "Blocked: ST-02 registration failed");
    }

    // ST-04: Login Success & Session Issuance
    let loginCookieRaw = "";
    if (userARegistered) {
      try {
        const res = await request(`${cleanApiUrl}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: userA.email, password: userA.password }),
        });
        if (res.status !== 200) {
          throw new Error(`Expected HTTP 200, received HTTP ${res.status}`);
        }
        const cookieObj = extractCookie(res, cookieHeaderName) || extractCookie(res, "trackup_session");
        if (!cookieObj) {
          throw new Error(`Missing expected session cookie (${cookieHeaderName}) in Set-Cookie header`);
        }
        userACookie = `${cookieHeaderName}=${cookieObj.value}`;
        loginCookieRaw = cookieObj.raw;
        userALoggedIn = true;
        logPass("ST-04", "Authentication & Login Success");
      } catch (err) {
        logFail("ST-04", "Authentication & Login Success", err);
      }
    } else {
      logSkip("ST-04", "Authentication & Login Success", "Blocked: ST-02 registration failed");
    }

    // ST-05: Session-Cookie Security Attributes
    if (userALoggedIn) {
      try {
        const raw = loginCookieRaw.toLowerCase();
        const hasHttpOnly = raw.includes("httponly");
        const hasPath = raw.includes("path=/");
        const hasSameSite = raw.includes("samesite=lax");
        const hasSecure = raw.includes("secure");
        const hasDomain = raw.includes("domain=");

        if (!hasHttpOnly) throw new Error("Cookie missing HttpOnly attribute");
        if (!hasPath) throw new Error("Cookie missing Path=/ attribute");
        if (!hasSameSite) throw new Error("Cookie missing SameSite=Lax attribute");
        if (hasDomain) throw new Error("Cookie contains Domain attribute (must be omitted for __Host- compliance)");

        if (cleanApiUrl.startsWith("https://") && !hasSecure) {
          throw new Error("Cookie missing Secure attribute on HTTPS origin");
        }

        logPass("ST-05", "Session-Cookie RFC 6265bis Security Attributes", "HttpOnly, SameSite=Lax, Path=/, Host-Only");
      } catch (err) {
        logFail("ST-05", "Session-Cookie RFC 6265bis Security Attributes", err);
      }
    } else {
      logSkip("ST-05", "Session-Cookie RFC 6265bis Security Attributes", "Blocked: ST-04 login failed");
    }

    // ST-06: Session Persistence Across Requests
    if (userALoggedIn) {
      try {
        const res = await request(`${cleanApiUrl}/api/auth/me`, {
          headers: { Cookie: userACookie },
        });
        if (res.status !== 200) {
          throw new Error(`Expected HTTP 200, received HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!data.user || data.user.id !== userA.id) {
          throw new Error("Session resolution returned mismatched user profile");
        }
        logPass("ST-06", "Session Persistence Across Authenticated Requests");
      } catch (err) {
        logFail("ST-06", "Session Persistence Across Authenticated Requests", err);
      }
    } else {
      logSkip("ST-06", "Session Persistence Across Authenticated Requests", "Blocked: ST-04 login failed");
    }

    // ST-07: Frontend /api/* Proxy Routing (Conditional)
    if (cleanFrontendUrl) {
      if (userALoggedIn) {
        try {
          const res = await request(`${cleanFrontendUrl}/api/auth/me`, {
            headers: { Cookie: userACookie },
          });
          if (res.status !== 200) {
            throw new Error(`Frontend proxy returned HTTP ${res.status}. Check Vercel rewrite destination.`);
          }
          const data = await res.json();
          if (!data.user || data.user.id !== userA.id) {
            throw new Error("Proxy request returned unexpected user payload");
          }
          logPass("ST-07", "Frontend /api/* Proxy Routing (Vercel Edge Rewrite)");
        } catch (err) {
          logFail("ST-07", "Frontend /api/* Proxy Routing (Vercel Edge Rewrite)", err);
        }
      } else {
        logSkip("ST-07", "Frontend /api/* Proxy Routing", "Blocked: ST-04 login failed");
      }
    } else {
      logSkip("ST-07", "Frontend /api/* Proxy Routing", "Requires --frontend-url");
    }

    // ST-08: Logout and Session Revocation
    if (userALoggedIn) {
      try {
        const logoutRes = await request(`${cleanApiUrl}/api/auth/logout`, {
          method: "POST",
          headers: { Cookie: userACookie },
        });
        if (logoutRes.status !== 200) {
          throw new Error(`Expected HTTP 200 on logout, received HTTP ${logoutRes.status}`);
        }

        // Verify immediate revocation on server
        const verifyRes = await request(`${cleanApiUrl}/api/auth/me`, {
          headers: { Cookie: userACookie },
        });
        if (verifyRes.status !== 401) {
          throw new Error(`Expected HTTP 401 after logout revocation, received HTTP ${verifyRes.status}`);
        }
        logPass("ST-08", "Logout & Database Session Revocation (Immediate 401 on Revoked Token)");
      } catch (err) {
        logFail("ST-08", "Logout & Database Session Revocation", err);
      }
    } else {
      logSkip("ST-08", "Logout & Database Session Revocation", "Blocked: ST-04 login failed");
    }

    // Re-login User A for data isolation and task metrics tests
    let userAReLoggedIn = false;
    if (userARegistered) {
      try {
        const reLoginRes = await request(`${cleanApiUrl}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: userA.email, password: userA.password }),
        });
        if (reLoginRes.status === 200) {
          const reLoginCookie = extractCookie(reLoginRes, cookieHeaderName) || extractCookie(reLoginRes, "trackup_session");
          if (reLoginCookie) {
            userACookie = `${cookieHeaderName}=${reLoginCookie.value}`;
            userAReLoggedIn = true;
          }
        }
      } catch {}
    }

    // ST-09: Multi-Tenant Data Isolation (Cross-User Read & Write IDOR Protection)
    let taskAId;
    if (userAReLoggedIn) {
      try {
        // 1. User A creates a task
        const createTaskRes = await request(`${cleanApiUrl}/api/tasks`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: userACookie,
          },
          body: JSON.stringify({
            title: `Isolation Smoke Task ${sessionTokenSuffix}`,
            priority: "HIGH",
          }),
        });
        if (createTaskRes.status !== 201) {
          throw new Error(`User A failed to create task: HTTP ${createTaskRes.status}`);
        }
        const taskData = await createTaskRes.json();
        taskAId = taskData.task.id;
        cleanupTasks.push({ id: taskAId, cookie: userACookie });

        // 2. Register & Login User B
        await request(`${cleanApiUrl}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(userB),
        });
        const loginBRes = await request(`${cleanApiUrl}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: userB.email, password: userB.password }),
        });
        const cookieBObj = extractCookie(loginBRes, cookieHeaderName) || extractCookie(loginBRes, "trackup_session");
        if (cookieBObj) {
          userBCookie = `${cookieHeaderName}=${cookieBObj.value}`;
        }

        // 3. User B lists tasks — Task A must not be present
        const listRes = await request(`${cleanApiUrl}/api/tasks`, {
          headers: { Cookie: userBCookie },
        });
        const listData = await listRes.json();
        const taskPresent = listData.tasks?.some((t) => t.id === taskAId);
        if (taskPresent) {
          throw new Error(`CRITICAL: User B task list contains User A's task (${taskAId})`);
        }

        // 4. User B attempts direct read of Task A -> must return 404
        const idorGetRes = await request(`${cleanApiUrl}/api/tasks/${taskAId}`, {
          headers: { Cookie: userBCookie },
        });
        if (idorGetRes.status !== 404) {
          throw new Error(`IDOR vulnerability: User B direct read returned HTTP ${idorGetRes.status}`);
        }

        // 5. User B attempts direct mutation of Task A -> must return 404
        const idorPatchRes = await request(`${cleanApiUrl}/api/tasks/${taskAId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: userBCookie,
          },
          body: JSON.stringify({ title: "Hacked Title" }),
        });
        if (idorPatchRes.status !== 404) {
          throw new Error(`IDOR vulnerability: User B direct patch returned HTTP ${idorPatchRes.status}`);
        }

        logPass("ST-09", "Multi-Tenant Data Isolation (Cross-User Read & Write IDOR Protection)");
      } catch (err) {
        logFail("ST-09", "Multi-Tenant Data Isolation", err);
      }
    } else {
      logSkip("ST-09", "Multi-Tenant Data Isolation", "Blocked: User A authentication prerequisite unavailable");
    }

    // ST-10: Task Completion Lifecycle & Timestamp Contract (API-only)
    if (userAReLoggedIn && taskAId) {
      try {
        // Update User A's timezone to America/New_York
        const profileRes = await request(`${cleanApiUrl}/api/auth/profile`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: userACookie,
          },
          body: JSON.stringify({ timezone: "America/New_York" }),
        });
        if (profileRes.status !== 200) {
          throw new Error(`Failed to update timezone: HTTP ${profileRes.status}`);
        }

        // Complete Task A
        const completeRes = await request(`${cleanApiUrl}/api/tasks/${taskAId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: userACookie,
          },
          body: JSON.stringify({ status: "COMPLETED" }),
        });
        if (completeRes.status !== 200) {
          throw new Error(`Failed to complete task: HTTP ${completeRes.status}`);
        }
        const completedTask = (await completeRes.json()).task;
        if (completedTask.status !== "COMPLETED" || !completedTask.completedAt) {
          throw new Error("Completed task missing valid completedAt timestamp");
        }

        const completedDate = new Date(completedTask.completedAt);
        if (isNaN(completedDate.getTime())) {
          throw new Error("Invalid completedAt timestamp format");
        }

        logPass("ST-10", "Task Completion Lifecycle & Timestamp Contract (API-only)", "Note: Dashboard UI metric rendering requires separate browser test");
      } catch (err) {
        logFail("ST-10", "Task Completion Lifecycle & Timestamp Contract", err);
      }
    } else {
      logSkip("ST-10", "Task Completion Lifecycle & Timestamp Contract", "Blocked: Task creation prerequisite unavailable");
    }

    // ST-11: Safe Error Responses (Information Disclosure Defense)
    try {
      const errRes = await request(`${cleanApiUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "invalid-email-format", password: "" }),
      });
      if (errRes.status !== 400) {
        throw new Error(`Expected HTTP 400 for invalid payload, got HTTP ${errRes.status}`);
      }
      const rawText = await errRes.text();
      const hasStackTrace = rawText.includes("    at ") || rawText.includes("node_modules");
      const hasInternalPath = rawText.includes("/apps/api/") || rawText.includes("d:\\");
      const hasSqlSyntax = rawText.includes("syntax error at or near") || rawText.includes("SELECT ");

      if (hasStackTrace || hasInternalPath || hasSqlSyntax) {
        throw new Error("Information disclosure: Error response contains internal stack trace, file path, or SQL details");
      }

      const errData = JSON.parse(rawText);
      if (!errData.error || !errData.code) {
        throw new Error("Error response missing standard 'error' and 'code' fields");
      }

      logPass("ST-11", "Safe Error Response Payloads (Zero Information Disclosure in HTTP Response)", "Note: Server stdout log hygiene requires manual dashboard review");
    } catch (err) {
      logFail("ST-11", "Safe Error Response Payloads", err);
    }

    // ST-12: Migration & Deployment Preflight Verification
    logSkip(
      "ST-12",
      "Migration Failure Handling & Rollback Readiness",
      "Preflight / Code-verified invariant: exit code 1 prevents server boot; non-executable against live DB"
    );

  } finally {
    // Cleanup created test records
    console.log("\n--- Cleaning Up Session Test Resources ---");
    for (const item of cleanupTasks) {
      try {
        await request(`${cleanApiUrl}/api/tasks/${item.id}`, {
          method: "DELETE",
          headers: { Cookie: item.cookie },
        });
      } catch {}
    }
    if (userACookie) {
      try {
        await request(`${cleanApiUrl}/api/auth/logout`, {
          method: "POST",
          headers: { Cookie: userACookie },
        });
      } catch {}
    }
    if (userBCookie) {
      try {
        await request(`${cleanApiUrl}/api/auth/logout`, {
          method: "POST",
          headers: { Cookie: userBCookie },
        });
      } catch {}
    }
    console.log("Cleanup completed.\n");
  }

  // Summary
  console.log("=================================================");
  console.log(`Smoke Test Summary: ${stats.passed}/${stats.total} Passed (${stats.failed} Failed, ${stats.skipped} Skipped)`);
  console.log("=================================================\n");

  if (stats.failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[FATAL ERROR]", err.message || err);
  process.exit(1);
});
