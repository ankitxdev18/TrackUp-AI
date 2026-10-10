export type NotificationType =
  | "GOAL_COMPLETED"
  | "HABIT_STREAK_MILESTONE"
  | "TASK_OVERDUE";

export type ResourceType = "goal" | "habit" | "task";

export interface NotificationItem {
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

export class NotificationApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "NotificationApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export async function fetchNotifications(options?: {
  limit?: number;
  unreadOnly?: boolean;
}): Promise<{ notifications: NotificationItem[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.limit) {
    params.set("limit", String(options.limit));
  }
  if (options?.unreadOnly !== undefined) {
    params.set("unreadOnly", String(options.unreadOnly));
  }

  const queryString = params.toString();
  const url = queryString
    ? `/api/notifications?${queryString}`
    : "/api/notifications";

  const response = await fetch(url, {
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore
    }
    throw new NotificationApiError(
      response.status,
      errorData.code || "FETCH_FAILED",
      errorData.error || "Failed to fetch notifications"
    );
  }

  return response.json();
}

export async function fetchUnreadCount(): Promise<number> {
  const response = await fetch("/api/notifications/unread-count", {
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore
    }
    throw new NotificationApiError(
      response.status,
      errorData.code || "COUNT_FAILED",
      errorData.error || "Failed to fetch unread notification count"
    );
  }

  const data = await response.json();
  return Number(data.count ?? 0);
}

export async function markNotificationAsRead(
  id: string
): Promise<NotificationItem> {
  const response = await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore
    }
    throw new NotificationApiError(
      response.status,
      errorData.code || "MARK_READ_FAILED",
      errorData.error || "Failed to mark notification as read"
    );
  }

  const data = await response.json();
  return data.notification;
}

export async function markAllNotificationsAsRead(): Promise<{
  success: boolean;
  markedCount: number;
}> {
  const response = await fetch("/api/notifications/mark-all-read", {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore
    }
    throw new NotificationApiError(
      response.status,
      errorData.code || "MARK_ALL_READ_FAILED",
      errorData.error || "Failed to mark all notifications as read"
    );
  }

  return response.json();
}
