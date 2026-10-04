import { parseOptions } from "@node-rs/argon2";
import { describe, expect, it } from "vitest";
import {
  hashPassword,
  PASSWORD_POLICY,
  PasswordValidationError,
  TRACKUP_ARGON2ID_CONFIG,
  verifyPassword,
} from "../src/auth/password.js";

describe("Password Hashing Utility (A01)", () => {
  it("1. can hash a valid password at exactly 10 characters (boundary min)", async () => {
    const password10 = "1234567890";
    expect([...password10].length).toBe(PASSWORD_POLICY.minLength);

    const hash = await hashPassword(password10);
    expect(hash).toBeDefined();
    expect(typeof hash).toBe("string");
    expect(await verifyPassword(hash, password10)).toBe(true);
  });

  it("2. can hash a valid password at exactly 128 characters (boundary max)", async () => {
    const password128 = "A".repeat(128);
    expect([...password128].length).toBe(PASSWORD_POLICY.maxLength);

    const hash = await hashPassword(password128);
    expect(hash).toBeDefined();
    expect(typeof hash).toBe("string");
    expect(await verifyPassword(hash, password128)).toBe(true);
  });

  it("3. rejects passwords shorter than 10 characters", async () => {
    const short9 = "123456789";
    expect([...short9].length).toBe(9);

    await expect(hashPassword(short9)).rejects.toThrowError(
      PasswordValidationError
    );

    // Empty string rejection
    await expect(hashPassword("")).rejects.toThrowError(
      PasswordValidationError
    );
  });

  it("4. rejects passwords longer than 128 characters", async () => {
    const long129 = "A".repeat(129);
    expect([...long129].length).toBe(129);

    await expect(hashPassword(long129)).rejects.toThrowError(
      PasswordValidationError
    );
  });

  it("5. produces an encoded hash matching the exact TrackUp Argon2id parameters", async () => {
    const samplePassword = "correct-horse-battery-staple";
    const hash = await hashPassword(samplePassword);

    // PHC format begins with $argon2id$v=19$m=65536,t=3,p=4$
    expect(hash.startsWith("$argon2id$v=19$m=65536,t=3,p=4$")).toBe(true);

    // Parse options using underlying Argon2 parser to verify cryptographic parameters
    const parsed = parseOptions(hash);
    expect(parsed.algorithm).toBe(2); // Algorithm.Argon2id
    expect(parsed.version).toBe(1); // Version.V0x13 (0x13 = 19)
    expect(parsed.memoryCost).toBe(TRACKUP_ARGON2ID_CONFIG.memoryCost); // 65536 KiB
    expect(parsed.timeCost).toBe(TRACKUP_ARGON2ID_CONFIG.timeCost); // 3
    expect(parsed.parallelism).toBe(TRACKUP_ARGON2ID_CONFIG.parallelism); // 4
    expect(parsed.outputLen).toBe(TRACKUP_ARGON2ID_CONFIG.outputLen); // 32
    expect(parsed.saltLen).toBe(TRACKUP_ARGON2ID_CONFIG.saltLength); // 16 bytes
  });

  it("6. verifies a correct password successfully", async () => {
    const password = "my-secure-master-password";
    const hash = await hashPassword(password);

    const isValid = await verifyPassword(hash, password);
    expect(isValid).toBe(true);
  });

  it("7. rejects an incorrect password during verification", async () => {
    const correctPassword = "my-secure-master-password";
    const wrongPassword = "my-wrong-master-password";
    const hash = await hashPassword(correctPassword);

    const isValid = await verifyPassword(hash, wrongPassword);
    expect(isValid).toBe(false);
  });

  it("8. produces different hashes for the same password due to fresh salts", async () => {
    const password = "consistent-user-password";
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).not.toBe(hash2);
  });

  it("9. verifies both independently salted hashes successfully", async () => {
    const password = "consistent-user-password";
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(await verifyPassword(hash1, password)).toBe(true);
    expect(await verifyPassword(hash2, password)).toBe(true);
  });

  it("10. fails safely when encountering malformed or corrupted hashes", async () => {
    const validPassword = "a-valid-testing-password";

    // Non-argon2 string
    expect(await verifyPassword("invalid-hash", validPassword)).toBe(false);

    // Corrupted salt/digest
    expect(
      await verifyPassword("$argon2id$v=19$m=65536,t=3,p=4$malformed", validPassword)
    ).toBe(false);

    // Non-string inputs
    expect(await verifyPassword(null as unknown as string, validPassword)).toBe(false);
    expect(await verifyPassword(undefined as unknown as string, validPassword)).toBe(false);

    // Rejection of alternative algorithms (no silent downgrade)
    const argon2iHash = "$argon2i$v=19$m=65536,t=3,p=4$somehashvalue$morehash";
    expect(await verifyPassword(argon2iHash, validPassword)).toBe(false);

    const bcryptHash = "$2b$12$e8crlyA9y/7iEa/8n9jxe.gE2fQn0Z4C2lVwF5D5P6s1a2b3c4d5e";
    expect(await verifyPassword(bcryptHash, validPassword)).toBe(false);
  });

  it("11. correctly handles Unicode passwords without mutation or corruption", async () => {
    // 10 multi-byte Unicode characters (code points)
    const unicodePassword1 = "🔒🔑💎🎯🚀💡🎉🔥👍🌟";
    expect([...unicodePassword1].length).toBe(10);

    const hash1 = await hashPassword(unicodePassword1);
    expect(await verifyPassword(hash1, unicodePassword1)).toBe(true);
    expect(await verifyPassword(hash1, "🔒🔑💎🎯🚀💡🎉🔥👍❌")).toBe(false);

    // Multilingual Japanese passphrase (11 characters)
    const unicodePassword2 = "日本語パスワード１２３";
    expect([...unicodePassword2].length).toBe(11);

    const hash2 = await hashPassword(unicodePassword2);
    expect(await verifyPassword(hash2, unicodePassword2)).toBe(true);
    expect(await verifyPassword(hash2, "日本語パスワード１２４")).toBe(false);
  });

  it("12. error messages do not leak plaintext passwords or hashes", async () => {
    const secretPassword = "short";

    try {
      await hashPassword(secretPassword);
      expect.unreachable("Should have thrown PasswordValidationError");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(PasswordValidationError);
      const message = (err as Error).message;
      expect(message).not.toContain(secretPassword);
      expect(message).toBe(
        `Password must be between ${PASSWORD_POLICY.minLength} and ${PASSWORD_POLICY.maxLength} characters in length.`
      );
    }
  });
});
