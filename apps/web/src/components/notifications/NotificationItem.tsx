import type React from "react";
import { Check, CheckSquare, Sparkles, Target } from "lucide-react";
import type { NotificationItem as NotificationItemType } from "../../api/notifications";
import { useRouter } from "../../router/Router";

interface NotificationItemProps {
  notification: NotificationItemType;
  onMarkRead: (id: string) => void;
  onClosePanel: () => void;
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSeconds < 60) return "Just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotificationItem({
  notification,
  onMarkRead,
  onClosePanel,
}: NotificationItemProps) {
  const { navigate } = useRouter();

  const getTargetRoute = (): string => {
    switch (notification.resourceType) {
      case "goal":
        return notification.resourceId
          ? `/goals/${notification.resourceId}`
          : "/goals";
      case "habit":
        return "/habits";
      case "task":
      default:
        return "/tasks";
    }
  };

  const handleClick = () => {
    if (!notification.isRead) {
      onMarkRead(notification.id);
    }
    onClosePanel();
    navigate(getTargetRoute());
  };

  const handleMarkClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMarkRead(notification.id);
  };

  const renderIcon = () => {
    switch (notification.type) {
      case "GOAL_COMPLETED":
        return (
          <div className="notification-icon-wrapper goal" aria-hidden="true">
            <Target size={16} />
          </div>
        );
      case "HABIT_STREAK_MILESTONE":
        return (
          <div className="notification-icon-wrapper habit" aria-hidden="true">
            <Sparkles size={16} />
          </div>
        );
      case "TASK_OVERDUE":
      default:
        return (
          <div className="notification-icon-wrapper task" aria-hidden="true">
            <CheckSquare size={16} />
          </div>
        );
    }
  };

  return (
    <li
      className={`notification-item ${notification.isRead ? "read" : "unread"}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label={`${notification.title}, ${notification.isRead ? "read" : "unread"}`}
    >
      {renderIcon()}

      <div className="notification-content">
        <h4 className="notification-title">{notification.title}</h4>
        {notification.body && (
          <p className="notification-body">{notification.body}</p>
        )}
        <div className="notification-meta">
          <span className="notification-time">
            {formatRelativeTime(notification.createdAt)}
          </span>
          {!notification.isRead && (
            <span className="notification-unread-dot" aria-hidden="true" />
          )}
        </div>
      </div>

      {!notification.isRead && (
        <button
          type="button"
          className="btn-notification-mark"
          onClick={handleMarkClick}
          aria-label="Mark notification as read"
          title="Mark as read"
        >
          <Check size={14} />
        </button>
      )}
    </li>
  );
}
