import crypto from "node:crypto";
import { Algorithm, hash as argon2Hash, verify as argon2Verify, Version } from "@node-rs/argon2";

/**
 * TrackUp Argon2id Cryptographic Parameters
 *
 * Implements RFC 9106 recommended parameters specified in TrackUp Authentication Architecture:
 * - memoryCost: 65,536 KiB (64 MB) to resist GPU/ASIC acceleration
 * - timeCost: 3 iterations for computational hardness
 * - parallelism: 4 threads
 * - saltLength: 16 bytes of cryptographically secure random entropy
 * - outputLen: 32 bytes (256 bits digest)
 */
export const TRACKUP_ARGON2ID_CONFIG = Object.freeze({
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
  saltLength: 16,
});

/**
 * Valid, precomputed Argon2id dummy hash generated using the standard
 * TRACKUP_ARGON2ID_CONFIG parameters (memoryCost: 65536, timeCost: 3, parallelism: 4).
 *
 * Used in the nonexistent-user login authentication path to execute a genuine Argon2id
 * verification computation, mitigating timing attacks that reveal account existence.
 */
export const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$OSbPmndO4uolaNSDTwFMSg$JsKa5jJWtWWt8tONYmIQgX7EwQQI+dM0YaGBDMEKkao";

export const PASSWORD_POLICY = Object.freeze({
  minLength: 10,
  maxLength: 128,
});

/**
 * Explicit validation error thrown when password violates length requirements.
 * Does not expose password contents or cryptographic details.
 */
export class PasswordValidationError extends Error {
  constructor(
    message: string = `Password must be between ${PASSWORD_POLICY.minLength} and ${PASSWORD_POLICY.maxLength} characters in length.`
  ) {
    super(message);
    this.name = "PasswordValidationError";
  }
}

/**
 * Hashes a plaintext password using Argon2id with a fresh 16-byte random salt.
 *
 * Requirements:
 * - Validates length: 10 <= charCount <= 128 (supports full Unicode code points).
 * - Never logs or persists plaintext passwords or generated hashes.
 * - Does not normalize or mutate the password string (treated as opaque user input).
 *
 * @param password Raw plaintext password
 * @returns Encoded Argon2id PHC string
 */
export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== "string") {
    throw new PasswordValidationError();
  }

  // Count Unicode characters (code points) accurately
  const charCount = [...password].length;
  if (
    charCount < PASSWORD_POLICY.minLength ||
    charCount > PASSWORD_POLICY.maxLength
  ) {
    throw new PasswordValidationError();
  }

  // Generate a fresh cryptographically secure 16-byte random salt per invocation
  const salt = crypto.randomBytes(TRACKUP_ARGON2ID_CONFIG.saltLength);

  return argon2Hash(password, {
    algorithm: Algorithm.Argon2id,
    version: Version.V0x13,
    memoryCost: TRACKUP_ARGON2ID_CONFIG.memoryCost,
    timeCost: TRACKUP_ARGON2ID_CONFIG.timeCost,
    parallelism: TRACKUP_ARGON2ID_CONFIG.parallelism,
    outputLen: TRACKUP_ARGON2ID_CONFIG.outputLen,
    salt,
  });
}

/**
 * Verifies a candidate plaintext password against an encoded Argon2id hash.
 *
 * Requirements:
 * - Requires $argon2id$ format; strictly rejects downgrades to other algorithms.
 * - Handles malformed or corrupted hashes safely by returning false without throwing.
 * - Never logs passwords or hashes.
 *
 * @param hash Stored encoded Argon2id hash
 * @param password Candidate plaintext password
 * @returns boolean True if password matches, false otherwise
 */
export async function verifyPassword(
  hash: string,
  password: string
): Promise<boolean> {
  if (typeof hash !== "string" || typeof password !== "string") {
    return false;
  }

  // Enforce Argon2id algorithm; prevent silent algorithm downgrade
  if (!hash.startsWith("$argon2id$")) {
    return false;
  }

  try {
    return await argon2Verify(hash, password);
  } catch {
    // Malformed or invalid hash fails safely without leaking internal errors
    return false;
  }
}
