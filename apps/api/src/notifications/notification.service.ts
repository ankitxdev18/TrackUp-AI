import { and, count, desc, eq, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { notifications, tasks, Notification, NewNotification } from "../db/schema.js";
import {
  CreateNotificationInput,
  NotificationResponse,
  NotificationType,
  ResourceType,
} from "./notification.schema.js";

/**
 * Builds a deterministic deduplication key for an event.
 */
export function buildDedupeKey(
  type: NotificationType,
  resourceId: string,
  qualifier?: string
): string {
  switch (type) {
    case "GOAL_COMPLETED":
      return `goal_completed:${resourceId}`;
    case "HABIT_STREAK_MILESTONE":
      return `habit_streak:${resourceId}:${qualifier ?? "milestone"}`;
    case "TASK_OVERDUE":
      return `task_overdue:${resourceId}:${qualifier ?? "due"}`;
  }
}

/**
 * Maps a database Notification record to the clean API response contract.
 */
export function mapNotificationToResponse(
  record: Notification
): NotificationResponse {
  return {
    id: record.id,
    type: record.type as NotificationType,
    title: record.title,
    body: record.body,
    isRead: record.isRead,
    readAt: record.readAt ? record.readAt.toISOString() : null,
    resourceType: record.resourceType as ResourceType | null,
    resourceId: record.resourceId,
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * Creates a notification safely with deduplication.
 * If a notification with the same (userId, dedupeKey) already exists, it is safely ignored.
 */
export async function createNotification(
  userId: string,
  input: CreateNotificationInput,
  txClient: any = db
): Promise<Notification | null> {
  const insertValues: NewNotification = {
    userId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    dedupeKey: input.dedupeKey,
  };

  const inserted = await txClient
    .insert(notifications)
    .values(insertValues)
    .onConflictDoNothing({
      target: [notifications.userId, notifications.dedupeKey],
    })
    .returning();

  return inserted.length > 0 ? inserted[0] : null;
}

/**
 * Retrieves the recent notifications for an authenticated user.
 */
export async function getUserNotifications(
  userId: string,
  options?: { limit?: number; unreadOnly?: boolean }
): Promise<NotificationResponse[]> {
  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 50) : 20;

  const conditions = [eq(notifications.userId, userId)];
  if (options?.unreadOnly) {
    conditions.push(eq(notifications.isRead, false));
  }

  const records = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit);

  return records.map(mapNotificationToResponse);
}

/**
 * Retrieves the exact count of unread notifications for an authenticated user.
 */
export async function getUnreadNotificationCount(
  userId: string
): Promise<number> {
  const result = await db
    .select({ unreadCount: count() })
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), eq(notifications.isRead, false))
    );

  return Number(result[0]?.unreadCount ?? 0);
}

/**
 * Marks a specific notification as read for its owner.
 * Returns the updated record, or null if the notification does not exist or belongs to another user.
 */
export async function markNotificationAsRead(
  userId: string,
  notificationId: string
): Promise<NotificationResponse | null> {
  const updated = await db
    .update(notifications)
    .set({
      isRead: true,
      readAt: sql`now()`,
    })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId)
      )
    )
    .returning();

  if (updated.length === 0) {
    return null;
  }

  return mapNotificationToResponse(updated[0]);
}

/**
 * Bulk-marks all unread notifications as read for an authenticated user.
 * Returns the number of affected rows.
 */
export async function markAllNotificationsAsRead(
  userId: string
): Promise<number> {
  const updated = await db
    .update(notifications)
    .set({
      isRead: true,
      readAt: sql`now()`,
    })
    .where(
      and(eq(notifications.userId, userId), eq(notifications.isRead, false))
    )
    .returning({ id: notifications.id });

  return updated.length;
}

/**
 * Triages overdue tasks for an authenticated user and creates deduplicated notifications.
 * Evaluates incomplete tasks ('TODO') where dueDate < today.
 * Completely idempotent: uses ON CONFLICT DO NOTHING against (userId, dedupeKey).
 */
export async function triageOverdueTasks(
  userId: string,
  todayDate?: string
): Promise<number> {
  const today = todayDate ?? new Date().toISOString().slice(0, 10);

  const overdueList = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      dueDate: tasks.dueDate,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.status, "TODO"),
        isNotNull(tasks.dueDate),
        lt(tasks.dueDate, today)
      )
    );

  let createdCount = 0;
  for (const task of overdueList) {
    if (task.dueDate) {
      const created = await createNotification(userId, {
        type: "TASK_OVERDUE",
        title: `Task Overdue: ${task.title}`,
        body: `Due on ${task.dueDate}. Review or reschedule this task.`,
        resourceType: "task",
        resourceId: task.id,
        dedupeKey: buildDedupeKey("TASK_OVERDUE", task.id, task.dueDate),
      });

      if (created) {
        createdCount++;
      }
    }
  }

  return createdCount;
}

