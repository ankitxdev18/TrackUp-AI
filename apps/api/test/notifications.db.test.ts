import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabasePool, db } from "../src/db/index.js";
import { notifications, users } from "../src/db/schema.js";
import {
  buildDedupeKey,
  createNotification,
  getUnreadNotificationCount,
  getUserNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "../src/notifications/notification.service.js";

describe("Notifications Database & Service Foundation (Phase 2.4)", () => {
  const TEST_DOMAIN = "notifications_db_test.trackup.local";
  let userAId: string;
  let userBId: string;

  const cleanup = async () => {
    await db.execute(
      sql`DELETE FROM users WHERE email LIKE ${`%@${TEST_DOMAIN}`}`
    );
  };

  beforeAll(async () => {
    await cleanup();

    // Create User A
    const [userA] = await db
      .insert(users)
      .values({
        email: `notif_user_a_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        name: "Notification User A",
      })
      .returning();
    userAId = userA.id;

    // Create User B
    const [userB] = await db
      .insert(users)
      .values({
        email: `notif_user_b_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        name: "Notification User B",
      })
      .returning();
    userBId = userB.id;
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabasePool();
  });

  it("1. verifies the notifications table exists in public schema", async () => {
    const result = await db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications'`
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]?.table_name).toBe("notifications");
  });

  it("2. inserts a valid notification and applies default values", async () => {
    const dedupeKey = `goal_completed:${crypto.randomUUID()}`;
    const [notif] = await db
      .insert(notifications)
      .values({
        userId: userAId,
        type: "GOAL_COMPLETED",
        title: "Test Goal Completed",
        body: "All targets were met successfully.",
        resourceType: "goal",
        resourceId: crypto.randomUUID(),
        dedupeKey,
      })
      .returning();

    expect(notif).toBeDefined();
    expect(notif.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(notif.userId).toBe(userAId);
    expect(notif.isRead).toBe(false);
    expect(notif.readAt).toBeNull();
    expect(notif.createdAt).toBeInstanceOf(Date);
  });

  it("3. enforces NOT NULL constraints on required fields", async () => {
    // Missing title
    await expect(
      db.execute(
        sql`INSERT INTO notifications (user_id, type, dedupe_key) VALUES (${userAId}, 'GOAL_COMPLETED', 'test_key_1')`
      )
    ).rejects.toThrow();

    // Missing user_id
    await expect(
      db.execute(
        sql`INSERT INTO notifications (type, title, dedupe_key) VALUES ('GOAL_COMPLETED', 'Title', 'test_key_2')`
      )
    ).rejects.toThrow();

    // Missing dedupe_key
    await expect(
      db.execute(
        sql`INSERT INTO notifications (user_id, type, title) VALUES (${userAId}, 'GOAL_COMPLETED', 'Title')`
      )
    ).rejects.toThrow();
  });

  it("4. rejects inserting a notification with non-existent user_id foreign key", async () => {
    const nonExistentUserId = crypto.randomUUID();
    try {
      await db.insert(notifications).values({
        userId: nonExistentUserId,
        type: "TASK_OVERDUE",
        title: "Overdue Task",
        dedupeKey: `task_overdue:${crypto.randomUUID()}`,
      });
      expect.unreachable("Should have failed foreign key constraint on notifications.user_id");
    } catch (err: unknown) {
      const pgError = (err as { cause?: { code?: string } })?.cause;
      expect(pgError?.code).toBe("23503"); // foreign_key_violation
    }
  });

  it("5. enforces unique constraint on (user_id, dedupe_key)", async () => {
    const sharedDedupeKey = `task_overdue:${crypto.randomUUID()}`;

    // First insert succeeds
    await db.insert(notifications).values({
      userId: userAId,
      type: "TASK_OVERDUE",
      title: "First Task Notice",
      dedupeKey: sharedDedupeKey,
    });

    // Duplicate insert for same user fails with unique violation
    try {
      await db.insert(notifications).values({
        userId: userAId,
        type: "TASK_OVERDUE",
        title: "Second Task Notice",
        dedupeKey: sharedDedupeKey,
      });
      expect.unreachable("Should have failed unique constraint on (user_id, dedupe_key)");
    } catch (err: unknown) {
      const pgError = (err as { cause?: { code?: string } })?.cause;
      expect(pgError?.code).toBe("23505"); // unique_violation
    }

    // Same dedupeKey for different user succeeds (tenant-scoped deduplication)
    const [userBNotif] = await db
      .insert(notifications)
      .values({
        userId: userBId,
        type: "TASK_OVERDUE",
        title: "User B Task Notice",
        dedupeKey: sharedDedupeKey,
      })
      .returning();

    expect(userBNotif.userId).toBe(userBId);
  });

  it("6. service createNotification safely handles duplicate via onConflictDoNothing", async () => {
    const dedupeKey = buildDedupeKey("GOAL_COMPLETED", crypto.randomUUID());

    // First creation succeeds
    const first = await createNotification(userAId, {
      type: "GOAL_COMPLETED",
      title: "Goal Reached",
      body: "Milestone achieved.",
      dedupeKey,
    });
    expect(first).not.toBeNull();
    expect(first?.dedupeKey).toBe(dedupeKey);

    // Second creation returns null without throwing an exception
    const second = await createNotification(userAId, {
      type: "GOAL_COMPLETED",
      title: "Goal Reached (Attempt 2)",
      body: "Duplicate attempt.",
      dedupeKey,
    });
    expect(second).toBeNull();
  });

  it("7. service getUserNotifications respects pagination and unreadOnly filtering", async () => {
    // Insert 3 notifications for User A: 2 unread, 1 read
    const baseKey = crypto.randomUUID();
    const [n1] = await db
      .insert(notifications)
      .values({
        userId: userAId,
        type: "TASK_OVERDUE",
        title: "Task 1",
        dedupeKey: `key_1_${baseKey}`,
      })
      .returning();

    const [n2] = await db
      .insert(notifications)
      .values({
        userId: userAId,
        type: "TASK_OVERDUE",
        title: "Task 2",
        dedupeKey: `key_2_${baseKey}`,
      })
      .returning();

    await db.insert(notifications).values({
      userId: userAId,
      type: "TASK_OVERDUE",
      title: "Task 3 Read",
      isRead: true,
      readAt: new Date(),
      dedupeKey: `key_3_${baseKey}`,
    });

    const all = await getUserNotifications(userAId, { limit: 10 });
    expect(all.length).toBeGreaterThanOrEqual(3);

    const unreadOnly = await getUserNotifications(userAId, {
      unreadOnly: true,
      limit: 10,
    });
    expect(unreadOnly.every((n) => n.isRead === false)).toBe(true);

    const limited = await getUserNotifications(userAId, { limit: 2 });
    expect(limited.length).toBe(2);
  });

  it("8. service getUnreadNotificationCount accurately reflects unread items", async () => {
    const initialCount = await getUnreadNotificationCount(userBId);

    await createNotification(userBId, {
      type: "HABIT_STREAK_MILESTONE",
      title: "7-Day Streak",
      body: "Great job keeping up!",
      dedupeKey: `habit_streak:${crypto.randomUUID()}:7`,
    });

    const updatedCount = await getUnreadNotificationCount(userBId);
    expect(updatedCount).toBe(initialCount + 1);
  });

  it("9. service markNotificationAsRead updates read status and enforces ownership", async () => {
    // Create an unread notification for User A
    const created = await createNotification(userAId, {
      type: "GOAL_COMPLETED",
      title: "Private Goal Notice",
      dedupeKey: `priv_goal:${crypto.randomUUID()}`,
    });
    expect(created).not.toBeNull();
    const notifId = created!.id;

    // User B attempts to mark User A's notification as read -> fails (returns null)
    const crossUserResult = await markNotificationAsRead(userBId, notifId);
    expect(crossUserResult).toBeNull();

    // Verify it is still unread in database
    const [current] = await db
      .select()
      .from(notifications)
      .where(sql`id = ${notifId}`);
    expect(current.isRead).toBe(false);

    // User A marks their own notification as read -> succeeds
    const ownerResult = await markNotificationAsRead(userAId, notifId);
    expect(ownerResult).not.toBeNull();
    expect(ownerResult?.isRead).toBe(true);
    expect(ownerResult?.readAt).not.toBeNull();
  });

  it("10. service markAllNotificationsAsRead marks all unread items for that user", async () => {
    // Ensure User B has at least 2 unread items
    await createNotification(userBId, {
      type: "TASK_OVERDUE",
      title: "Bulk Test Task A",
      dedupeKey: `bulk_a:${crypto.randomUUID()}`,
    });
    await createNotification(userBId, {
      type: "TASK_OVERDUE",
      title: "Bulk Test Task B",
      dedupeKey: `bulk_b:${crypto.randomUUID()}`,
    });

    const unreadBefore = await getUnreadNotificationCount(userBId);
    expect(unreadBefore).toBeGreaterThanOrEqual(2);

    const markedCount = await markAllNotificationsAsRead(userBId);
    expect(markedCount).toBe(unreadBefore);

    const unreadAfter = await getUnreadNotificationCount(userBId);
    expect(unreadAfter).toBe(0);
  });

  it("11. enforces cascade deletion when user is deleted", async () => {
    // Create a temporary user with a notification
    const [tempUser] = await db
      .insert(users)
      .values({
        email: `temp_user_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        name: "Temporary User",
      })
      .returning();

    const [tempNotif] = await db
      .insert(notifications)
      .values({
        userId: tempUser.id,
        type: "GOAL_COMPLETED",
        title: "Temporary Goal",
        dedupeKey: `temp_goal:${crypto.randomUUID()}`,
      })
      .returning();

    // Delete user
    await db.delete(users).where(sql`id = ${tempUser.id}`);

    // Verify notification was cascade-deleted
    const remaining = await db
      .select()
      .from(notifications)
      .where(sql`id = ${tempNotif.id}`);
    expect(remaining.length).toBe(0);
  });
});
