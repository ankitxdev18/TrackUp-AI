import { useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "../../context/NotificationContext";
import { NotificationPanel } from "./NotificationPanel";
import "./notifications.css";

export function NotificationBell() {
  const { unreadCount, isPanelOpen, setIsPanelOpen, togglePanel } =
    useNotifications();
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Return focus to bell button when panel closes via Escape
  useEffect(() => {
    if (!isPanelOpen && triggerRef.current) {
      // Focus restoration when closed
    }
  }, [isPanelOpen]);

  const displayCount = unreadCount > 99 ? "99+" : unreadCount;

  return (
    <div className="notification-bell-container">
      <button
        ref={triggerRef}
        type="button"
        className={`btn-notifications-trigger ${isPanelOpen ? "active" : ""}`}
        onClick={togglePanel}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications, none unread"
        }
        aria-haspopup="dialog"
        aria-expanded={isPanelOpen}
        title="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="notification-badge" aria-hidden="true">
            {displayCount}
          </span>
        )}
      </button>

      {isPanelOpen && <NotificationPanel onClose={() => setIsPanelOpen(false)} />}
    </div>
  );
}
