import { z } from "zod";

export const NOTIFICATION_TYPES = [
  "GOAL_COMPLETED",
  "HABIT_STREAK_MILESTONE",
  "TASK_OVERDUE",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const RESOURCE_TYPES = ["goal", "habit", "task"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const notificationTypeEnum = z.enum(NOTIFICATION_TYPES, {
  message: "Invalid notification type",
});

export const resourceTypeEnum = z.enum(RESOURCE_TYPES, {
  message: "Invalid resource type",
});

export const notificationIdParamSchema = z.object({
  id: z.string().uuid({ message: "Notification ID must be a valid UUIDv4" }),
});

export const createNotificationSchema = z.object({
  type: notificationTypeEnum,
  title: z
    .string()
    .trim()
    .min(1, { message: "Title is required" })
    .max(255, { message: "Title must be at most 255 characters" }),
  body: z
    .string()
    .trim()
    .max(1000, { message: "Body must be at most 1000 characters" })
    .optional()
    .nullable(),
  resourceType: resourceTypeEnum.optional().nullable(),
  resourceId: z.string().uuid().optional().nullable(),
  dedupeKey: z
    .string()
    .trim()
    .min(1, { message: "Dedupe key is required" })
    .max(255, { message: "Dedupe key must be at most 255 characters" }),
});

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z.enum(["true", "false"]).optional(),
});

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export interface NotificationResponse {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  isRead: boolean;
  readAt: string | null;
  resourceType: ResourceType | null;
  resourceId: string | null;
  createdAt: string;
}
