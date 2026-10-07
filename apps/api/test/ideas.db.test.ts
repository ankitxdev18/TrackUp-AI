import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabasePool, db } from "../src/db/index.js";
import { ideas, users } from "../src/db/schema.js";

describe("Ideas Schema & Database Foundation (Milestone I02)", () => {
  const TEST_DOMAIN = "ideas_db_test.trackup.local";
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
        email: `idea_owner_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        name: "Idea Primary User",
      })
      .returning();

    testUserId = userA.id;

    // Create secondary test user for isolation checks
    const [userB] = await db
      .insert(users)
      .values({
        email: `idea_secondary_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        name: "Idea Secondary User",
      })
      .returning();

    secondaryUserId = userB.id;
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabasePool();
  });

  // ==========================================
  // 1. TABLE STRUCTURE & COLUMNS
  // ==========================================
  describe("Table Structure & Column Definitions", () => {
    it("1. verifies the ideas table exists in the public schema", async () => {
      const result = await db.execute(
        sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ideas'`
      );
      expect(result.rows.length).toBe(1);
      expect(result.rows[0]?.table_name).toBe("ideas");
    });

    it("2. verifies expected columns, data types, and nullability", async () => {
      const result = await db.execute(
        sql`SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'ideas' 
            ORDER BY ordinal_position`
      );

      const columns = new Map(
        result.rows.map((r) => [
          r.column_name as string,
          {
            dataType: r.data_type as string,
            isNullable: r.is_nullable as string,
            columnDefault: r.column_default as string | null,
          },
        ])
      );

      // Verify all 7 required fields
      expect(columns.has("id")).toBe(true);
      expect(columns.get("id")?.dataType).toBe("uuid");
      expect(columns.get("id")?.isNullable).toBe("NO");

      expect(columns.has("user_id")).toBe(true);
      expect(columns.get("user_id")?.dataType).toBe("uuid");
      expect(columns.get("user_id")?.isNullable).toBe("NO");

      expect(columns.has("title")).toBe(true);
      expect(columns.get("title")?.dataType).toBe("character varying");
      expect(columns.get("title")?.isNullable).toBe("NO");

      expect(columns.has("description")).toBe(true);
      expect(columns.get("description")?.dataType).toBe("text");
      expect(columns.get("description")?.isNullable).toBe("YES");

      expect(columns.has("status")).toBe(true);
      expect(columns.get("status")?.dataType).toBe("character varying");
      expect(columns.get("status")?.isNullable).toBe("NO");
      expect(columns.get("status")?.columnDefault).toContain("ACTIVE");

      expect(columns.has("created_at")).toBe(true);
      expect(columns.get("created_at")?.dataType).toBe("timestamp with time zone");
      expect(columns.get("created_at")?.isNullable).toBe("NO");

      expect(columns.has("updated_at")).toBe(true);
      expect(columns.get("updated_at")?.dataType).toBe("timestamp with time zone");
      expect(columns.get("updated_at")?.isNullable).toBe("NO");

      // Verify strict absence of speculative fields
      expect(columns.has("idea_date")).toBe(false);
      expect(columns.has("calendar_date")).toBe(false);
      expect(columns.has("project_id")).toBe(false);
      expect(columns.has("goal_id")).toBe(false);
      expect(columns.has("task_id")).toBe(false);
      expect(columns.has("priority")).toBe(false);
      expect(columns.has("category")).toBe(false);
      expect(columns.has("tags")).toBe(false);
    });
  });

  // ==========================================
  // 2. CREATION & DEFAULTS
  // ==========================================
  describe("Idea Creation & Defaults", () => {
    it("3. inserts a valid idea with title and description, defaulting status to ACTIVE", async () => {
      const [idea] = await db
        .insert(ideas)
        .values({
          userId: testUserId,
          title: "Local-first SQLite syncing over WebRTC",
          description: "Explore peer-to-peer CRDT replication for offline web apps.",
        })
        .returning();

      expect(idea).toBeDefined();
      expect(idea.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(idea.userId).toBe(testUserId);
      expect(idea.title).toBe("Local-first SQLite syncing over WebRTC");
      expect(idea.description).toBe("Explore peer-to-peer CRDT replication for offline web apps.");
      expect(idea.status).toBe("ACTIVE");
      expect(idea.createdAt).toBeInstanceOf(Date);
      expect(idea.updatedAt).toBeInstanceOf(Date);
    });

    it("4. inserts a valid idea with null or omitted description", async () => {
      const [ideaNull] = await db
        .insert(ideas)
        .values({
          userId: testUserId,
          title: "Quick thought with explicit null description",
          description: null,
        })
        .returning();

      expect(ideaNull).toBeDefined();
      expect(ideaNull.title).toBe("Quick thought with explicit null description");
      expect(ideaNull.description).toBeNull();
      expect(ideaNull.status).toBe("ACTIVE");

      const [ideaOmitted] = await db
        .insert(ideas)
        .values({
          userId: testUserId,
          title: "Quick thought with omitted description",
        })
        .returning();

      expect(ideaOmitted).toBeDefined();
      expect(ideaOmitted.description).toBeNull();
      expect(ideaOmitted.status).toBe("ACTIVE");
    });

    it("5. enforces NOT NULL constraints: rejects insertion without required fields", async () => {
      // Missing title
      try {
        await db.execute(
          sql`INSERT INTO ideas (user_id) VALUES (${testUserId})`
        );
        expect.unreachable("Should have failed NOT NULL violation on title");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23502"); // not_null_violation
      }

      // Missing user_id
      try {
        await db.execute(
          sql`INSERT INTO ideas (title) VALUES ('Title with missing user')`
        );
        expect.unreachable("Should have failed NOT NULL violation on user_id");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23502"); // not_null_violation
      }
    });
  });

  // ==========================================
  // 3. STATUS LIFECYCLE
  // ==========================================
  describe("Status Lifecycle (ACTIVE vs ARCHIVED)", () => {
    it("6. supports explicit ACTIVE status on creation", async () => {
      const [idea] = await db
        .insert(ideas)
        .values({
          userId: testUserId,
          title: "Explicitly Active Idea",
          status: "ACTIVE",
        })
        .returning();

      expect(idea.status).toBe("ACTIVE");
    });

    it("7. supports ARCHIVED status and updating between ACTIVE and ARCHIVED", async () => {
      // Create as ARCHIVED directly
      const [archivedIdea] = await db
        .insert(ideas)
        .values({
          userId: testUserId,
          title: "Idea Born Archived",
          status: "ARCHIVED",
        })
        .returning();

      expect(archivedIdea.status).toBe("ARCHIVED");

      // Transition ACTIVE to ARCHIVED
      const [activeIdea] = await db
        .insert(ideas)
        .values({
          userId: testUserId,
          title: "Idea to Archive",
          status: "ACTIVE",
        })
        .returning();

      const [updatedToArchived] = await db
        .update(ideas)
        .set({ status: "ARCHIVED" })
        .where(sql`id = ${activeIdea.id}`)
        .returning();

      expect(updatedToArchived.status).toBe("ARCHIVED");

      // Transition ARCHIVED back to ACTIVE (Restore)
      const [restoredToActive] = await db
        .update(ideas)
        .set({ status: "ACTIVE" })
        .where(sql`id = ${activeIdea.id}`)
        .returning();

      expect(restoredToActive.status).toBe("ACTIVE");
    });
  });

  // ==========================================
  // 4. OWNERSHIP, FOREIGN KEY & CASCADE
  // ==========================================
  describe("Ownership, Foreign Key & Cascade Deletion", () => {
    it("8. enforces foreign key constraint: rejects insertion with non-existent user_id", async () => {
      const fakeUserId = "00000000-0000-0000-0000-000000000000";
      try {
        await db.insert(ideas).values({
          userId: fakeUserId,
          title: "Orphan Idea",
        });
        expect.unreachable("Should have failed foreign key constraint on user_id");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23503"); // foreign_key_violation
      }
    });

    it("9. enforces cascade deletion: deleting user deletes all associated ideas", async () => {
      // Create ephemeral user
      const [ephemeralUser] = await db
        .insert(users)
        .values({
          email: `ephemeral_idea_user_${Date.now()}@${TEST_DOMAIN}`,
          passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
          name: "Ephemeral Idea User",
        })
        .returning();

      // Insert 2 ideas for ephemeral user
      await db.insert(ideas).values({
        userId: ephemeralUser.id,
        title: "Ephemeral Idea 1",
      });
      await db.insert(ideas).values({
        userId: ephemeralUser.id,
        title: "Ephemeral Idea 2",
      });

      const beforeDelete = await db
        .select()
        .from(ideas)
        .where(sql`user_id = ${ephemeralUser.id}`);
      expect(beforeDelete.length).toBe(2);

      // Delete user
      await db.delete(users).where(sql`id = ${ephemeralUser.id}`);

      // Verify ideas are removed
      const afterDelete = await db
        .select()
        .from(ideas)
        .where(sql`user_id = ${ephemeralUser.id}`);
      expect(afterDelete.length).toBe(0);
    });

    it("10. supports independent multi-user ideas isolation", async () => {
      const [userAIdea] = await db
        .insert(ideas)
        .values({
          userId: testUserId,
          title: "User A Private Spark",
        })
        .returning();

      const [userBIdea] = await db
        .insert(ideas)
        .values({
          userId: secondaryUserId,
          title: "User B Private Spark",
        })
        .returning();

      expect(userAIdea.userId).toBe(testUserId);
      expect(userBIdea.userId).toBe(secondaryUserId);

      const userAIdeas = await db
        .select()
        .from(ideas)
        .where(sql`user_id = ${testUserId}`);
      const userBIdeas = await db
        .select()
        .from(ideas)
        .where(sql`user_id = ${secondaryUserId}`);

      const userAIds = userAIdeas.map((i) => i.id);
      const userBIds = userBIdeas.map((i) => i.id);

      expect(userAIds).toContain(userAIdea.id);
      expect(userAIds).not.toContain(userBIdea.id);

      expect(userBIds).toContain(userBIdea.id);
      expect(userBIds).not.toContain(userAIdea.id);
    });
  });

  // ==========================================
  // 5. INDEXES & CONSTRAINTS
  // ==========================================
  describe("Indexes & Performance Verification", () => {
    it("11. verifies required indexes exist on the ideas table", async () => {
      const result = await db.execute(
        sql`SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = 'ideas'`
      );

      const indexes = new Map(
        result.rows.map((r) => [r.indexname as string, r.indexdef as string])
      );

      // Primary key index
      expect(indexes.has("ideas_pkey")).toBe(true);

      // Status listing index: ideas_user_status_idx on (user_id, status)
      expect(indexes.has("ideas_user_status_idx")).toBe(true);
      const statusIdxDef = indexes.get("ideas_user_status_idx");
      expect(statusIdxDef).toContain("user_id");
      expect(statusIdxDef).toContain("status");

      // Chronological timeline index: ideas_user_created_idx on (user_id, created_at DESC)
      expect(indexes.has("ideas_user_created_idx")).toBe(true);
      const createdIdxDef = indexes.get("ideas_user_created_idx");
      expect(createdIdxDef).toContain("user_id");
      expect(createdIdxDef).toContain("created_at");
      expect(createdIdxDef).toContain("DESC");
    });
  });

  // ==========================================
  // 6. DATA FIDELITY & UNICODE
  // ==========================================
  describe("Data Fidelity & Content Integrity", () => {
    it("12. preserves Unicode richness (Hindi, emojis, CJK, accents, multiline descriptions)", async () => {
      const richTitle = "नया विचार: जीवन को व्यवस्थित और स्पष्ट बनाना 🌟 (今日の日記 & Café)";
      const richDescription = [
        "# Core Philosophy / मूल दर्शन",
        "1. Capture without pressure: शांत मन, रचनात्मक विचार 🧘‍♂️",
        "2. Multilingual notes: 継続は力なり (Perseverance is power).",
        "3. Technical thoughts:",
        "```typescript",
        "interface IdeaSpark {",
        "  concept: string;",
        "  uncommitted: true;",
        "}",
        "```",
        "Quotes: « La simplicité est la clé de l'élégance »",
        "",
        "End of exploratory outline.",
      ].join("\n");

      const [idea] = await db
        .insert(ideas)
        .values({
          userId: testUserId,
          title: richTitle,
          description: richDescription,
        })
        .returning();

      expect(idea.title).toBe(richTitle);
      expect(idea.description).toBe(richDescription);

      // Fetch back from database to verify round-trip fidelity
      const [fetched] = await db
        .select()
        .from(ideas)
        .where(sql`id = ${idea.id}`);

      expect(fetched).toBeDefined();
      expect(fetched.title).toBe(richTitle);
      expect(fetched.description).toBe(richDescription);
    });

    it("13. stores and retrieves long description without truncation or corruption", async () => {
      const longDescription = "Brainstorming notes paragraph. ".repeat(150); // ~4,650 chars
      const [idea] = await db
        .insert(ideas)
        .values({
          userId: testUserId,
          title: "Comprehensive Architecture Brainstorm",
          description: longDescription,
        })
        .returning();

      expect(idea.description?.length).toBeGreaterThan(4500);

      const [fetched] = await db
        .select()
        .from(ideas)
        .where(sql`id = ${idea.id}`);

      expect(fetched.description).toBe(longDescription);
    });
  });

  // ==========================================
  // 7. TIMESTAMP BEHAVIOR
  // ==========================================
  describe("Timestamp Generation & Semantics", () => {
    it("14. verifies createdAt and updatedAt are generated automatically on insert", async () => {
      const beforeTime = new Date(Date.now() - 1000);

      const [idea] = await db
        .insert(ideas)
        .values({
          userId: testUserId,
          title: "Timestamp Verification Idea",
        })
        .returning();

      const afterTime = new Date(Date.now() + 1000);

      expect(idea.createdAt).toBeInstanceOf(Date);
      expect(idea.updatedAt).toBeInstanceOf(Date);
      expect(idea.createdAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(idea.createdAt.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it("15. documents and verifies application-level updatedAt modification on update", async () => {
      const [idea] = await db
        .insert(ideas)
        .values({
          userId: testUserId,
          title: "Initial Idea Title",
        })
        .returning();

      const updatedTime = new Date(Date.now() + 5000);

      const [updatedIdea] = await db
        .update(ideas)
        .set({
          title: "Refined Idea Title",
          updatedAt: updatedTime,
        })
        .where(sql`id = ${idea.id}`)
        .returning();

      expect(updatedIdea.title).toBe("Refined Idea Title");
      expect(updatedIdea.updatedAt.getTime()).toBe(updatedTime.getTime());
    });
  });
});
