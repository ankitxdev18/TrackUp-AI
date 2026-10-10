import { FastifyReply, FastifyRequest } from "fastify";
import { SESSION_COOKIE_NAME } from "./session.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface CsrfProtectionOptions {
  trustedOrigins: string[];
}

/**
 * Creates a Fastify preHandler hook enforcing strict Origin/Referer validation
 * on state-changing HTTP requests (POST, PUT, PATCH, DELETE).
 *
 * Security Policy & Rationale:
 *
 * 1. Safe HTTP methods (GET, HEAD, OPTIONS):
 *    - RFC 9110 specifies these methods as safe and idempotent (read-only).
 *    - Genuinely read-only endpoints are exempt from CSRF rejection to preserve standard navigation.
 *
 * 2. Fetch Metadata (Sec-Fetch-Site):
 *    - Modern browsers supply Sec-Fetch-Site indicating origin relationship.
 *    - If explicitly marked as 'cross-site', the request is an unauthorized cross-origin mutation
 *      and is immediately rejected with 403 (CSRF_CROSS_SITE).
 *
 * 3. Origin Header:
 *    - Browsers attach the Origin header on cross-origin fetch/XHR and all standard POST requests.
 *    - If Origin is present, it MUST match an entry in the configured trustedOrigins allowlist.
 *    - If untrusted, rejected with 403 (CSRF_ORIGIN_INVALID).
 *
 * 4. Referer Header Fallback:
 *    - When Origin is absent (e.g., certain same-origin navigations or older agents), Referer is inspected.
 *    - The Referer URL is parsed using the standard WHATWG URL parser and validated for http/https scheme.
 *    - The extracted URL origin must match the trustedOrigins allowlist.
 *    - Invalid or untrusted referers are rejected with 403 (CSRF_REFERER_INVALID).
 *
 * 5. Fail-Closed Policy on Missing Headers:
 *    - If BOTH Origin and Referer are absent:
 *      - If the request carries an ambient session cookie ('trackup_session'), it is a cookie-authenticated
 *        mutation without provenance. Browsers making authenticated requests must supply an Origin or Referer.
 *        We fail closed and reject with 403 (CSRF_HEADER_MISSING).
 *      - Requests without ambient session cookies (such as initial unauthenticated login/registration or
 *        test requests using the documented x-dev-user-id header) are allowed because they do not rely
 *        on ambient cookie credentials and are therefore not susceptible to cross-site cookie exploitation.
 */
export function createCsrfProtection(options: CsrfProtectionOptions) {
  const normalizedTrustedOrigins = options.trustedOrigins.map((o) =>
    o.replace(/\/+$/, "").toLowerCase()
  );

  return async function csrfProtection(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const method = request.method.toUpperCase();

    // 1. Safe read-only methods are exempt
    if (SAFE_METHODS.has(method)) {
      return;
    }

    // 2. Fetch Metadata defense-in-depth: explicit cross-site fetch rejection
    const secFetchSite = request.headers["sec-fetch-site"];
    if (secFetchSite === "cross-site") {
      return reply.status(403).send({
        error: "Cross-site requests are forbidden",
        code: "CSRF_CROSS_SITE",
      });
    }

    const origin = request.headers.origin;

    // 3. Primary check: Origin header
    if (origin) {
      if (typeof origin === "string") {
        const normalizedOrigin = origin.trim().replace(/\/+$/, "").toLowerCase();
        if (normalizedTrustedOrigins.includes(normalizedOrigin)) {
          return;
        }
      }
      return reply.status(403).send({
        error: "Untrusted request origin",
        code: "CSRF_ORIGIN_INVALID",
      });
    }

    // 4. Secondary fallback: Referer header
    const referer = request.headers.referer;
    if (referer) {
      if (typeof referer !== "string") {
        return reply.status(403).send({
          error: "Invalid or duplicate Referer header",
          code: "CSRF_REFERER_INVALID",
        });
      }

      try {
        const url = new URL(referer);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          return reply.status(403).send({
            error: "Invalid Referer protocol",
            code: "CSRF_REFERER_INVALID",
          });
        }
        if (normalizedTrustedOrigins.includes(url.origin.toLowerCase())) {
          return;
        }
      } catch {
        return reply.status(403).send({
          error: "Malformed Referer header",
          code: "CSRF_REFERER_INVALID",
        });
      }

      return reply.status(403).send({
        error: "Untrusted request referer",
        code: "CSRF_REFERER_INVALID",
      });
    }

    // 5. Fail closed for cookie-authenticated mutations missing both headers
    const hasSessionCookie = Boolean(request.cookies?.[SESSION_COOKIE_NAME]);
    if (hasSessionCookie) {
      return reply.status(403).send({
        error:
          "Missing Origin or Referer header on authenticated state-changing request",
        code: "CSRF_HEADER_MISSING",
      });
    }

    // 6. Fail closed if browser fetch metadata is present without Origin/Referer
    const secFetchMode = request.headers["sec-fetch-mode"];
    if (secFetchSite || secFetchMode) {
      return reply.status(403).send({
        error: "Missing Origin or Referer header on browser state-changing request",
        code: "CSRF_HEADER_MISSING",
      });
    }

    // 7. Login-CSRF defense: browser state-changing auth requests must provide Origin/Referer
    // Explicit non-browser clients (e.g. X-TrackUp-Client: api) or isolated test runners proceed
    const isAuthMutation =
      request.url.startsWith("/api/auth/login") ||
      request.url.startsWith("/api/auth/register");

    if (isAuthMutation) {
      const isExplicitApiClient =
        request.headers["x-trackup-client"] === "api" ||
        (process.env.NODE_ENV === "test" && !request.headers["user-agent"]?.includes("Mozilla"));

      if (!isExplicitApiClient) {
        return reply.status(403).send({
          error: "Missing Origin or Referer header on authentication request",
          code: "CSRF_HEADER_MISSING",
        });
      }
    }

    // Non-cookie requests with explicit contract proceed
  };
}
