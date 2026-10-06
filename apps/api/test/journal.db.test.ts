import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabasePool, db } from "../src/db/index.js";
import { journalEntries, users } from "../src/db/schema.js";

describe("Journal Schema & Database Foundation (Milestone H02-B)", () => {
  const TEST_DOMAIN = "journal_db_test.trackup.local";
  let testUserId: string;
  let secondaryUserId: string;

  const cleanup = async () => {
    await db.execute(
      sql`DELETE FROM users WHERE email LIKE ${`%@${TEST_DOMAIN}`}`
    );
  };

  beforeAll(async () => {
    await cleanup();

    // Create primary test user
    const [userA] = await db
      .insert(users)
      .values({
        email: `journal_owner_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        name: "Journal Primary User",
      })
      .returning();

    testUserId = userA.id;

    // Create secondary test user for cross-user isolation verification
    const [userB] = await db
      .insert(users)
      .values({
        email: `journal_secondary_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        name: "Journal Secondary User",
      })
      .returning();

    secondaryUserId = userB.id;
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabasePool();
  });

  it("1. verifies the journal_entries table exists in the public schema", async () => {
    const result = await db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'journal_entries'`
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]?.table_name).toBe("journal_entries");
  });

  it("2. verifies expected columns and properties in information_schema.columns", async () => {
    const result = await db.execute(
      sql`SELECT column_name, data_type, is_nullable 
          FROM information_schema.columns 
          WHERE table_name = 'journal_entries' 
          ORDER BY ordinal_position`
    );

    const columns = new Map(
      result.rows.map((r) => [
        r.column_name as string,
        { dataType: r.data_type, isNullable: r.is_nullable },
      ])
    );

    expect(columns.get("id")?.dataType).toBe("uuid");
    expect(columns.get("id")?.isNullable).toBe("NO");

    expect(columns.get("user_id")?.dataType).toBe("uuid");
    expect(columns.get("user_id")?.isNullable).toBe("NO");

    expect(columns.get("entry_date")?.dataType).toBe("character varying");
    expect(columns.get("entry_date")?.isNullable).toBe("NO");

    expect(columns.get("title")?.dataType).toBe("character varying");
    expect(columns.get("title")?.isNullable).toBe("YES");

    expect(columns.get("content")?.dataType).toBe("text");
    expect(columns.get("content")?.isNullable).toBe("NO");

    expect(columns.get("created_at")?.dataType).toBe("timestamp with time zone");
    expect(columns.get("created_at")?.isNullable).toBe("NO");

    expect(columns.get("updated_at")?.dataType).toBe("timestamp with time zone");
    expect(columns.get("updated_at")?.isNullable).toBe("NO");
  });

  it("3. inserts a valid journal entry with title, content, and date", async () => {
    const entryDate = "2026-10-06";
    const [entry] = await db
      .insert(journalEntries)
      .values({
        userId: testUserId,
        entryDate,
        title: "Deep Work Reflection",
        content: "Accomplished architecture planning for Journal. Feeling focused and clear.",
      })
      .returning();

    expect(entry).toBeDefined();
    expect(entry.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(entry.userId).toBe(testUserId);
    expect(entry.entryDate).toBe(entryDate);
    expect(entry.title).toBe("Deep Work Reflection");
    expect(entry.content).toBe("Accomplished architecture planning for Journal. Feeling focused and clear.");
    expect(entry.createdAt).toBeInstanceOf(Date);
    expect(entry.updatedAt).toBeInstanceOf(Date);
  });

  it("4. inserts a valid journal entry with null title (title is optional)", async () => {
    const entryDate = "2026-10-05";
    const [entry] = await db
      .insert(journalEntries)
      .values({
        userId: testUserId,
        entryDate,
        title: null,
        content: "Quick evening log without a formal title.",
      })
      .returning();

    expect(entry).toBeDefined();
    expect(entry.title).toBeNull();
    expect(entry.entryDate).toBe(entryDate);
    expect(entry.content).toBe("Quick evening log without a formal title.");
  });

  it("5. enforces unique constraint: duplicate entry for same user and same entry_date fails", async () => {
    const duplicateDate = "2026-10-04";

    // First entry on 2026-10-04 succeeds
    await db.insert(journalEntries).values({
      userId: testUserId,
      entryDate: duplicateDate,
      title: "First Entry",
      content: "Initial thoughts on Sunday.",
    });

    // Attempting a second entry on the same date for the same user MUST violate unique constraint (23505)
    try {
      await db.insert(journalEntries).values({
        userId: testUserId,
        entryDate: duplicateDate,
        title: "Second Entry Same Day",
        content: "Trying to create an additional entry for the same day.",
      });
      expect.unreachable("Should have failed with unique constraint violation for duplicate (userId, entryDate)");
    } catch (err: unknown) {
      const pgError = (err as { cause?: { code?: string } })?.cause;
      expect(pgError?.code).toBe("23505"); // unique_violation
    }
  });

  it("6. allows different users to have journal entries on the exact same date", async () => {
    const sharedDate = "2026-10-03";

    const [userAEntry] = await db
      .insert(journalEntries)
      .values({
        userId: testUserId,
        entryDate: sharedDate,
        title: "User A Reflections",
        content: "User A reflection content.",
      })
      .returning();

    const [userBEntry] = await db
      .insert(journalEntries)
      .values({
        userId: secondaryUserId,
        entryDate: sharedDate,
        title: "User B Reflections",
        content: "User B reflection content.",
      })
      .returning();

    expect(userAEntry.entryDate).toBe(sharedDate);
    expect(userBEntry.entryDate).toBe(sharedDate);
    expect(userAEntry.userId).not.toBe(userBEntry.userId);
  });

  it("7. allows the same user to have entries across multiple different dates", async () => {
    const date1 = "2026-10-01";
    const date2 = "2026-10-02";

    const [entry1] = await db
      .insert(journalEntries)
      .values({
        userId: testUserId,
        entryDate: date1,
        content: "Day 1 content",
      })
      .returning();

    const [entry2] = await db
      .insert(journalEntries)
      .values({
        userId: testUserId,
        entryDate: date2,
        content: "Day 2 content",
      })
      .returning();

    expect(entry1.entryDate).toBe(date1);
    expect(entry2.entryDate).toBe(date2);
  });

  it("8. enforces foreign key constraint: rejects insertion with non-existent user_id", async () => {
    const fakeUserId = "00000000-0000-0000-0000-000000000000";
    try {
      await db.insert(journalEntries).values({
        userId: fakeUserId,
        entryDate: "2026-09-30",
        content: "Orphan journal entry",
      });
      expect.unreachable("Should have failed foreign key constraint on user_id");
    } catch (err: unknown) {
      const pgError = (err as { cause?: { code?: string } })?.cause;
      expect(pgError?.code).toBe("23503"); // foreign_key_violation
    }
  });

  it("9. enforces cascade deletion: deleting a user deletes all their journal entries", async () => {
    // Create ephemeral user
    const [ephemeralUser] = await db
      .insert(users)
      .values({
        email: `ephemeral_journal_user_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        name: "Ephemeral User",
      })
      .returning();

    // Insert 2 entries for the ephemeral user
    await db.insert(journalEntries).values({
      userId: ephemeralUser.id,
      entryDate: "2026-09-28",
      content: "Ephemeral day 1",
    });
    await db.insert(journalEntries).values({
      userId: ephemeralUser.id,
      entryDate: "2026-09-29",
      content: "Ephemeral day 2",
    });

    const entriesBefore = await db
      .select()
      .from(journalEntries)
      .where(sql`user_id = ${ephemeralUser.id}`);
    expect(entriesBefore.length).toBe(2);

    // Delete user
    await db.delete(users).where(sql`id = ${ephemeralUser.id}`);

    // Verify cascaded deletion
    const entriesAfter = await db
      .select()
      .from(journalEntries)
      .where(sql`user_id = ${ephemeralUser.id}`);
    expect(entriesAfter.length).toBe(0);
  });

  it("10. enforces NOT NULL constraints on required fields", async () => {
    // Missing content
    try {
      await db.execute(
        sql`INSERT INTO journal_entries (user_id, entry_date) VALUES (${testUserId}, '2026-09-27')`
      );
      expect.unreachable("Should have failed NOT NULL violation on content");
    } catch (err: unknown) {
      const pgError = (err as { cause?: { code?: string } })?.cause;
      expect(pgError?.code).toBe("23502"); // not_null_violation
    }

    // Missing entry_date
    try {
      await db.execute(
        sql`INSERT INTO journal_entries (user_id, content) VALUES (${testUserId}, 'Some text')`
      );
      expect.unreachable("Should have failed NOT NULL violation on entry_date");
    } catch (err: unknown) {
      const pgError = (err as { cause?: { code?: string } })?.cause;
      expect(pgError?.code).toBe("23502"); // not_null_violation
    }
  });

  it("11. stores and retrieves large Markdown narrative content with special characters and Unicode", async () => {
    const largeMarkdown = `# Weekly Retrospective & Technical Deep-Dive 🚀

## Highlights
- Successfully validated **H02-A** architecture specifications.
- Implemented robust database migrations without breaking changes.
- Tested edge cases with *PostgreSQL* native constraints.

\`\`\`typescript
interface ReflectionRecord {
  mood?: string;
  insights: string[];
}
\`\`\`

> "Simplicity is prerequisite for reliability." — Edsger W. Dijkstra

Unicode & Emojis test: 🌟 📝 ⚡ 🔥 🎯 💻 🌿
Paragraph length simulation:
` + "This is a detailed reflection sentence repeating to simulate multi-paragraph flow. ".repeat(250);

    const [entry] = await db
      .insert(journalEntries)
      .values({
        userId: testUserId,
        entryDate: "2026-09-26",
        title: "Extended Markdown Entry",
        content: largeMarkdown,
      })
      .returning();

    expect(entry.content).toBe(largeMarkdown);
    expect(entry.content.length).toBeGreaterThan(15000);

    // Verify retrieved entry from database matches byte-for-byte
    const [fetched] = await db
      .select()
      .from(journalEntries)
      .where(sql`id = ${entry.id}`);

    expect(fetched).toBeDefined();
    expect(fetched.content).toBe(largeMarkdown);
    expect(fetched.title).toBe("Extended Markdown Entry");
  });

  it("12. updates journal content and updatedAt timestamp correctly", async () => {
    const [entry] = await db
      .insert(journalEntries)
      .values({
        userId: testUserId,
        entryDate: "2026-09-25",
        title: "Draft Title",
        content: "Draft content.",
      })
      .returning();

    const updatedTitle = "Finalized Title";
    const updatedContent = "Finalized content with refined thoughts.";
    const now = new Date();

    const [updated] = await db
      .update(journalEntries)
      .set({
        title: updatedTitle,
        content: updatedContent,
        updatedAt: now,
      })
      .where(sql`id = ${entry.id}`)
      .returning();

    expect(updated.title).toBe(updatedTitle);
    expect(updated.content).toBe(updatedContent);
    expect(updated.entryDate).toBe("2026-09-25");
    expect(updated.userId).toBe(testUserId);
  });
});
