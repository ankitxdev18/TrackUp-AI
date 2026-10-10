import { AlertCircle, Bell } from "lucide-react";
import { useNotifications } from "../../context/NotificationContext";
import { NotificationItem } from "./NotificationItem";

interface NotificationPanelProps {
  onClose: () => void;
}

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    markAsRead,
    markAllAsRead,
    refreshNotifications,
  } = useNotifications();

  return (
    <>
      {/* Backdrop overlay for dismissing when clicking outside */}
      <div
        className="notification-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="notification-panel"
        role="dialog"
        aria-label="Notifications"
        aria-modal="true"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        {/* Header */}
        <div className="notification-panel-header">
          <div className="notification-panel-title-group">
            <h3 className="notification-panel-title">Notifications</h3>
            {unreadCount > 0 && (
              <span className="notification-panel-count">
                {unreadCount} new
              </span>
            )}
          </div>

          <button
            type="button"
            className="btn-mark-all-read"
            onClick={markAllAsRead}
            disabled={unreadCount === 0 || isLoading}
            aria-label="Mark all notifications as read"
            title="Mark all as read"
          >
            Mark all read
          </button>
        </div>

        {/* Content list or state */}
        <div className="notification-panel-list" role="feed">
          {error && (
            <div className="notification-error-state" role="alert">
              <AlertCircle size={20} color="var(--color-danger)" />
              <p className="notification-error-text">{error}</p>
              <button
                type="button"
                className="btn-notification-retry"
                onClick={refreshNotifications}
              >
                Retry
              </button>
            </div>
          )}

          {isLoading && notifications.length === 0 && (
            <div aria-label="Loading notifications">
              {[1, 2, 3].map((i) => (
                <div key={i} className="notification-skeleton-item">
                  <div className="skeleton-icon" />
                  <div className="skeleton-lines">
                    <div className="skeleton-line medium" />
                    <div className="skeleton-line full" />
                    <div className="skeleton-line short" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && !error && notifications.length === 0 && (
            <div className="notification-empty-state">
              <div className="notification-empty-icon" aria-hidden="true">
                <Bell size={32} />
              </div>
              <h4 className="notification-empty-title">No notifications</h4>
              <p className="notification-empty-desc">
                You're all caught up! Milestone achievements and reminders will
                appear here.
              </p>
            </div>
          )}

          {notifications.length > 0 && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {notifications.map((item) => (
                <NotificationItem
                  key={item.id}
                  notification={item}
                  onMarkRead={markAsRead}
                  onClosePanel={onClose}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
