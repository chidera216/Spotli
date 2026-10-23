import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Heart,
  MessageCircle,
  UserRoundPlus,
  AtSign,
  Mail,
  CheckCheck,
  LoaderCircle,
} from "lucide-react";
import api from "../services/api";

const BRAND = "#FF2D4A";

function getName(user) {
  return (
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.username ||
    "Someone"
  );
}

function getMessage(notification) {
  const name = getName(notification.actor);
  switch (notification.type) {
    case "like":
      return `${name} liked your post.`;
    case "comment":
      return `${name} commented on your post${notification.message ? `: “${notification.message}”` : "."}`;
    case "reply":
      return `${name} replied to your comment${notification.message ? `: “${notification.message}”` : "."}`;
    case "follow":
      return `${name} started following you.`;
    case "follow_request":
      return `${name} requested to follow you.`;
    case "follow_approved":
      return `${name} approved your follow request.`;
    case "mention":
      return `${name} mentioned you.`;
    case "message":
      return `${name} sent you a message.`;
    case "message_request":
      return `${name} sent you a message request.`;
    default:
      return `${name} interacted with you on Spotli.`;
  }
}

function TypeIcon({ type }) {
  const common = { size: 18, strokeWidth: 2 };
  if (type === "like") return <Heart {...common} fill={BRAND} color={BRAND} />;
  if (type === "comment" || type === "reply")
    return <MessageCircle {...common} color="#2563eb" />;
  if (["follow", "follow_request", "follow_approved"].includes(type))
    return <UserRoundPlus {...common} color="#16a34a" />;
  if (type === "mention") return <AtSign {...common} color="#7c3aed" />;
  if (type === "message" || type === "message_request")
    return <Mail {...common} color="#0d9488" />;
  return <Bell {...common} color="#737373" />;
}

function formatTime(dateValue) {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

export default function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [followRequestStatuses, setFollowRequestStatuses] = useState({});
  const [followRequestBusy, setFollowRequestBusy] = useState({});
  const [notificationPrefs, setNotificationPrefs] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem("spotli.settings.preferences") || "{}",
      );
    } catch {
      return {};
    }
  });

  useEffect(() => {
    const refreshPreferences = (event) => {
      if (event?.detail) {
        setNotificationPrefs(event.detail);
        return;
      }
      try {
        setNotificationPrefs(
          JSON.parse(
            localStorage.getItem("spotli.settings.preferences") || "{}",
          ),
        );
      } catch {
        setNotificationPrefs({});
      }
    };
    window.addEventListener("spotli:settings-updated", refreshPreferences);
    window.addEventListener("storage", refreshPreferences);
    return () => {
      window.removeEventListener("spotli:settings-updated", refreshPreferences);
      window.removeEventListener("storage", refreshPreferences);
    };
  }, []);

  const visibleNotifications = notifications.filter((notification) => {
    if (notification.type === "like" && notificationPrefs.showLikes === false)
      return false;
    if (
      ["comment", "reply"].includes(notification.type) &&
      notificationPrefs.showComments === false
    )
      return false;
    if (
      ["follow", "follow_request", "follow_approved"].includes(
        notification.type,
      ) &&
      notificationPrefs.showFollows === false
    )
      return false;
    if (
      ["mention", "message", "message_request"].includes(notification.type) &&
      notificationPrefs.showMentions === false
    )
      return false;
    return true;
  });

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.notifications.getMine();
      setNotifications(
        Array.isArray(result.notifications) ? result.notifications : [],
      );
      setUnreadCount(Number(result.unreadCount) || 0);
    } catch (loadError) {
      setError(loadError.message || "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  async function markOneRead(notification) {
    if (notification.readAt) return;
    setNotifications((items) =>
      items.map((item) =>
        item._id === notification._id
          ? { ...item, readAt: new Date().toISOString() }
          : item,
      ),
    );
    setUnreadCount((count) => Math.max(0, count - 1));
    window.dispatchEvent(new Event("spotli:notifications-updated"));
    try {
      await api.notifications.markRead(notification._id);
      window.dispatchEvent(new Event("spotli:notifications-updated"));
    } catch {
      loadNotifications();
    }
  }

  async function handleNotificationClick(notification) {
    if (notification.type === "follow_request") return;
    await markOneRead(notification);

    if (notification.post) {
      navigate("/home", {
        state: { openPost: notification.post },
      });
      return;
    }

    if (
      ["follow", "follow_approved", "follow_request"].includes(
        notification.type,
      ) &&
      notification.actor?._id
    ) {
      navigate(`/profile/${notification.actor._id}`);
    }
  }

  async function handleFollowRequest(notification, action) {
    const followerId = notification.actor?._id;
    if (!followerId || followRequestBusy[notification._id]) return;

    setFollowRequestBusy((current) => ({
      ...current,
      [notification._id]: true,
    }));
    setError("");

    try {
      await api.users.respondToFollowRequest(followerId, action);
      setFollowRequestStatuses((current) => ({
        ...current,
        [notification._id]: action === "approve" ? "approved" : "rejected",
      }));
      await markOneRead(notification);
    } catch (requestError) {
      setError(requestError.message || "Unable to update this follow request.");
    } finally {
      setFollowRequestBusy((current) => ({
        ...current,
        [notification._id]: false,
      }));
    }
  }

  async function markAllRead() {
    const previous = notifications;
    const now = new Date().toISOString();
    setNotifications((items) =>
      items.map((item) => ({ ...item, readAt: item.readAt || now })),
    );
    setUnreadCount(0);
    window.dispatchEvent(new Event("spotli:notifications-updated"));
    try {
      await api.notifications.markAllRead();
      window.dispatchEvent(new Event("spotli:notifications-updated"));
    } catch (markError) {
      setNotifications(previous);
      window.dispatchEvent(new Event("spotli:notifications-updated"));
      setError(markError.message || "Unable to mark notifications as read.");
      loadNotifications();
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl bg-white px-4 py-6 text-black sm:px-6 md:py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {unreadCount
              ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
              : "You're all caught up."}
          </p>
        </div>
        <button
          type="button"
          onClick={markAllRead}
          disabled={unreadCount === 0 || loading}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm"
        >
          <CheckCheck size={16} />
          Mark all as read
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
          <button
            type="button"
            onClick={loadNotifications}
            className="ml-2 font-semibold underline"
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-500">
          <LoaderCircle size={18} className="animate-spin" /> Loading
          notifications…
        </div>
      ) : visibleNotifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 px-5 py-16 text-center">
          <span className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-neutral-100 text-neutral-500">
            <Bell size={25} />
          </span>
          <h2 className="text-base font-semibold">No notifications yet</h2>
          <p className="mt-1 max-w-xs text-sm text-neutral-500">
            When people like your posts, comment, or follow you, you'll see it
            here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-100">
          {visibleNotifications.map((notification) => {
            const actor = notification.actor || {};
            const avatar = actor.avatar;
            const requestStatus = followRequestStatuses[notification._id];
            const isRequestBusy = Boolean(followRequestBusy[notification._id]);
            const isFollowRequest = notification.type === "follow_request";
            return (
              <div
                key={notification._id}
                className={`flex items-start gap-3 border-b border-neutral-100 px-3 py-4 transition last:border-b-0 sm:px-4 ${notification.readAt ? "bg-white" : "bg-rose-50/50"}`}
              >
                <button
                  type="button"
                  onClick={() => handleNotificationClick(notification)}
                  aria-label={`Open notification from ${getName(actor)}`}
                  className="relative mt-0.5 h-10 w-10 shrink-0 rounded-full text-left"
                >
                  {avatar ? (
                    <img
                      src={avatar}
                      alt=""
                      className="h-10 w-10 rounded-full bg-neutral-100 object-cover"
                    />
                  ) : (
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-neutral-100 text-sm font-semibold text-neutral-600">
                      {getName(actor).charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-white">
                    <TypeIcon type={notification.type} />
                  </span>
                </button>

                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => handleNotificationClick(notification)}
                    className="block w-full text-left hover:opacity-80"
                  >
                    <span className="block text-sm leading-5 text-neutral-800">
                      {getMessage(notification)}
                    </span>
                    <span className="mt-1 block text-xs text-neutral-500">
                      {formatTime(notification.createdAt)}
                    </span>
                  </button>

                  {isFollowRequest && !requestStatus && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isRequestBusy}
                        onClick={() =>
                          handleFollowRequest(notification, "approve")
                        }
                        className="inline-flex h-9 items-center justify-center rounded-full bg-[#FF2D4A] px-4 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-wait disabled:opacity-60"
                      >
                        {isRequestBusy ? "Please wait..." : "Accept"}
                      </button>
                      <button
                        type="button"
                        disabled={isRequestBusy}
                        onClick={() =>
                          handleFollowRequest(notification, "reject")
                        }
                        className="inline-flex h-9 items-center justify-center rounded-full border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-wait disabled:opacity-60"
                      >
                        Decline
                      </button>
                    </div>
                  )}

                  {isFollowRequest && requestStatus && (
                    <p className="mt-3 text-xs font-semibold text-neutral-500">
                      {requestStatus === "approved"
                        ? "Follow request accepted"
                        : "Follow request declined"}
                    </p>
                  )}
                </div>

                {!notification.readAt && (
                  <span
                    aria-label="Unread"
                    className="mt-2 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: BRAND }}
                  />
                )}
                {notification.post?.thumbnailUrl && (
                  <img
                    src={notification.post.thumbnailUrl}
                    alt=""
                    className="h-12 w-10 shrink-0 rounded-md bg-neutral-100 object-cover"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
