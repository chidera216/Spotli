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
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [activeTab, setActiveTab] = useState("new");
  const [error, setError] = useState("");
  const [followRequestStatuses, setFollowRequestStatuses] = useState({});
  const [followRequestBusy, setFollowRequestBusy] = useState({});
  // null means the active-request lookup failed; in that case we safely fall
  // back to notification records while still deduplicating repeated requests.
  const [pendingFollowRequests, setPendingFollowRequests] = useState(null);
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

  const preferenceFilteredNotifications = notifications.filter(
    (notification) => {
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
    },
  );

  // Keep historical follow-request notifications available in the Read tab,
  // while showing only one card per actor in each tab. The Follow collection
  // remains the source of truth for whether Accept/Decline actions are valid.
  const pendingFollowActorIds = Array.isArray(pendingFollowRequests)
    ? new Set(
        pendingFollowRequests
          .map((request) => String(request.user?._id || request.user?.id || ""))
          .filter(Boolean),
      )
    : null;

  const relevantNotifications = preferenceFilteredNotifications.filter(
    (notification) => {
      if (notification.type !== "follow_request") return true;

      const actorId = String(notification.actor?._id || "");
      if (!actorId) {
        return pendingFollowRequests === null || Boolean(notification.readAt);
      }

      const hasLocalStatus = Boolean(followRequestStatuses[notification._id]);
      const isCurrentlyPending =
        pendingFollowActorIds === null || pendingFollowActorIds.has(actorId);

      // Preserve read request notifications as history even when the request
      // has since been accepted or declined.
      return (
        hasLocalStatus || isCurrentlyPending || Boolean(notification.readAt)
      );
    },
  );

  // Deduplicate follow-request cards separately inside each tab. This allows a
  // current unread request and an older read notification from the same actor
  // to remain accessible in their respective tabs.
  function deduplicateFollowRequests(items) {
    const seenActors = new Set();
    return items.filter((notification) => {
      if (notification.type !== "follow_request") return true;
      const actorId = String(notification.actor?._id || "");
      if (!actorId) return true;
      if (seenActors.has(actorId)) return false;
      seenActors.add(actorId);
      return true;
    });
  }

  const newTabNotifications = deduplicateFollowRequests(
    relevantNotifications.filter((notification) => !notification.readAt),
  );
  const readTabNotifications = deduplicateFollowRequests(
    relevantNotifications.filter((notification) =>
      Boolean(notification.readAt),
    ),
  );
  const readNotificationCount = readTabNotifications.length;
  const tabNotifications =
    activeTab === "new" ? newTabNotifications : readTabNotifications;
  const displayedPendingRequestCount = newTabNotifications.filter(
    (notification) =>
      notification.type === "follow_request" &&
      !followRequestStatuses[notification._id] &&
      (pendingFollowActorIds === null ||
        pendingFollowActorIds.has(String(notification.actor?._id || ""))),
  ).length;

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [notificationResult, followRequestResult] =
        await Promise.allSettled([
          api.notifications.getMine(),
          api.users.getFollowRequests(1, 50),
        ]);

      if (notificationResult.status === "rejected") {
        throw notificationResult.reason;
      }

      const result = notificationResult.value;
      const firstPage = Array.isArray(result.notifications)
        ? result.notifications
        : [];
      const responsePage = Number(result.page) || 1;
      const responseLimit = Number(result.limit) || 30;
      setNotifications(firstPage);
      setCurrentPage(responsePage);
      setHasMore(firstPage.length >= responseLimit);
      setUnreadCount(Number(result.unreadCount) || 0);

      if (followRequestResult.status === "fulfilled") {
        setPendingFollowRequests(
          Array.isArray(followRequestResult.value.requests)
            ? followRequestResult.value.requests
            : [],
        );
      } else {
        // Preserve the notification feed if the follow-request endpoint is
        // temporarily unavailable; the UI still deduplicates repeated actors.
        setPendingFollowRequests(null);
      }
    } catch (loadError) {
      setError(loadError.message || "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  async function loadOlderNotifications() {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    setError("");
    const nextPage = currentPage + 1;
    try {
      const result = await api.notifications.getMine(nextPage, 30);
      const olderItems = Array.isArray(result.notifications)
        ? result.notifications
        : [];
      setNotifications((current) => {
        const existingIds = new Set(current.map((item) => String(item._id)));
        return [
          ...current,
          ...olderItems.filter((item) => !existingIds.has(String(item._id))),
        ];
      });
      setCurrentPage(Number(result.page) || nextPage);
      setHasMore(olderItems.length >= (Number(result.limit) || 30));
      setUnreadCount(Number(result.unreadCount) || 0);
    } catch (loadError) {
      setError(loadError.message || "Unable to load older notifications.");
    } finally {
      setLoadingMore(false);
    }
  }

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
    if (notification.type === "follow_request") {
      const actorId = String(notification.actor?._id || "");
      const isCurrentlyPending =
        pendingFollowActorIds === null || pendingFollowActorIds.has(actorId);
      if (!isCurrentlyPending) await markOneRead(notification);
      return;
    }
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
      setPendingFollowRequests((current) =>
        Array.isArray(current)
          ? current.filter(
              (request) =>
                String(request.user?._id || request.user?.id || "") !==
                String(followerId),
            )
          : current,
      );
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
    <main className="mx-auto min-h-screen w-full bg-white px-4 py-6 text-black sm:w-[90%] sm:px-0 md:py-8">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {activeTab === "new"
              ? `${unreadCount} new notification${unreadCount === 1 ? "" : "s"}${displayedPendingRequestCount > 0 ? ` · ${displayedPendingRequestCount} pending follow request${displayedPendingRequestCount === 1 ? "" : "s"}` : ""}`
              : readNotificationCount > 0
                ? `${readNotificationCount} read notification${readNotificationCount === 1 ? "" : "s"} loaded`
                : "Your read notifications will stay available here."}
          </p>
        </div>
        {activeTab === "new" && (
          <button
            type="button"
            onClick={markAllRead}
            disabled={unreadCount === 0 || loading}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 self-start rounded-full border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 sm:self-auto sm:text-sm"
          >
            <CheckCheck size={16} />
            Mark all as read
          </button>
        )}
      </div>

      <div
        role="tablist"
        aria-label="Notification status"
        className="spotli-profile-tabs mb-5"
      >
        <button
          id="notifications-new-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === "new"}
          aria-controls="notifications-tab-panel"
          onClick={() => setActiveTab("new")}
          className={`spotli-profile-tab inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2D4A] focus-visible:ring-offset-2 ${activeTab === "new" ? "spotli-profile-tab-active" : ""}`}
        >
          New
          <span
            className={`rounded-full px-2 py-0.5 text-xs transition-colors ${activeTab === "new" ? "bg-rose-50 text-[#FF2D4A] dark:bg-rose-950/40" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"}`}
          >
            {unreadCount}
          </span>
        </button>
        <button
          id="notifications-read-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === "read"}
          aria-controls="notifications-tab-panel"
          onClick={() => setActiveTab("read")}
          className={`spotli-profile-tab inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2D4A] focus-visible:ring-offset-2 ${activeTab === "read" ? "spotli-profile-tab-active" : ""}`}
        >
          Read
          <span
            className={`rounded-full px-2 py-0.5 text-xs transition-colors ${activeTab === "read" ? "bg-rose-50 text-[#FF2D4A] dark:bg-rose-950/40" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"}`}
          >
            {readNotificationCount}
          </span>
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

      <div
        id="notifications-tab-panel"
        role="tabpanel"
        aria-labelledby={
          activeTab === "new"
            ? "notifications-new-tab"
            : "notifications-read-tab"
        }
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-500">
            <LoaderCircle size={18} className="animate-spin" /> Loading
            notifications…
          </div>
        ) : tabNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 px-5 py-16 text-center">
            <span className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-neutral-100 text-neutral-500">
              <Bell size={25} />
            </span>
            <h2 className="text-base font-semibold">
              {activeTab === "new"
                ? "You're all caught up"
                : "No read notifications yet"}
            </h2>
            <p className="mt-1 max-w-xs text-sm text-neutral-500">
              {activeTab === "new"
                ? "New notifications will appear here. You can revisit them later in Read."
                : "Notifications you open or mark as read will remain available here."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-neutral-100">
            {tabNotifications.map((notification) => {
              const actor = notification.actor || {};
              const avatar = actor.avatar;
              const requestStatus = followRequestStatuses[notification._id];
              const isRequestBusy = Boolean(
                followRequestBusy[notification._id],
              );
              const isFollowRequest = notification.type === "follow_request";
              const actorId = String(actor._id || "");
              const isCurrentFollowRequest =
                isFollowRequest &&
                (pendingFollowActorIds === null ||
                  pendingFollowActorIds.has(actorId));
              return (
                <div
                  key={notification._id}
                  className={`flex items-start gap-3 border-b border-neutral-100 px-3 py-4 transition last:border-b-0 sm:px-4 dark:border-neutral-800 ${notification.readAt ? "bg-white dark:bg-neutral-950" : "bg-rose-50/50 dark:bg-rose-950/20"}`}
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

                    {isFollowRequest &&
                      !requestStatus &&
                      isCurrentFollowRequest && (
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
                    {isFollowRequest &&
                      !requestStatus &&
                      !isCurrentFollowRequest && (
                        <p className="mt-3 text-xs text-neutral-500">
                          This request is no longer pending.
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
      </div>

      {hasMore && !loading && (
        <div className="flex justify-center py-6">
          <button
            type="button"
            onClick={loadOlderNotifications}
            disabled={loadingMore}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-neutral-200 px-5 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-wait disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
          >
            {loadingMore && <LoaderCircle size={16} className="animate-spin" />}
            {loadingMore
              ? "Loading older notifications…"
              : "Load older notifications"}
          </button>
        </div>
      )}
    </main>
  );
}
