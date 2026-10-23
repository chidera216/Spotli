import { useCallback, useEffect, useState } from "react";
import api from "../services/api";
import {
  House,
  PlusSquare,
  Wallet,
  MessageCircle,
  Bookmark,
  UserRound,
  Bell,
  MoreHorizontal,
  Settings,
} from "lucide-react";

const navigation = [
  { label: "Home", icon: House },
  { label: "Create", icon: PlusSquare },
  { label: "Messages", icon: MessageCircle, unreadCount: 3 },
  { label: "Notifications", icon: Bell },
  { label: "Wallet", icon: Wallet },
  { label: "Bookmarks", icon: Bookmark },
  { label: "Profile", icon: UserRound },
  { label: "Settings", icon: Settings },
];

const creators = [
  {
    name: "Tara James",
    image: "photo-1534528741775-53994a69daeb",
    online: true,
  },
  {
    name: "Kofi Mensah",
    image: "photo-1500648767791-00dcc994a43e",
    online: false,
  },
  {
    name: "Maya Chen",
    image: "photo-1531123897727-8f129e1688ce",
    online: false,
  },
  {
    name: "Noah Carter",
    image: "photo-1506794778202-cad84cf45f1d",
    online: false,
  },
  {
    name: "Lina Moreau",
    image: "photo-1524504388940-b1c1722653e1",
    online: false,
  },
];

function Sidebar({ activePage = "Home", onNavigate = () => {} }) {
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);

  const refreshNotificationCount = useCallback(async () => {
    try {
      const result = await api.notifications.getMine(1, 1);
      setNotificationUnreadCount(Math.max(0, Number(result.unreadCount) || 0));
    } catch {
      // Keep the last known count if the request temporarily fails.
    }
  }, []);

  useEffect(() => {
    refreshNotificationCount();

    const intervalId = window.setInterval(refreshNotificationCount, 15000);
    const handleFocus = () => refreshNotificationCount();
    const handleNotificationUpdate = () => refreshNotificationCount();

    window.addEventListener("focus", handleFocus);
    window.addEventListener(
      "spotli:notifications-updated",
      handleNotificationUpdate,
    );

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener(
        "spotli:notifications-updated",
        handleNotificationUpdate,
      );
    };
  }, [refreshNotificationCount]);

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 w-40 overflow-y-auto border-r border-black/[0.06] bg-white px-3 py-5 scrollbar-none [&::-webkit-scrollbar]:hidden"
      style={{ msOverflowStyle: "none" }}
    >
      <a
        href="#"
        onClick={(event) => {
          event.preventDefault();
          onNavigate("Home");
        }}
        className="mb-8 block px-2 text-[20px] font-black tracking-tight text-black"
      >
        Spotli<span className="text-black">.</span>
      </a>

      <nav className="space-y-1.5">
        {navigation.map(({ label, icon: Icon, unread, unreadCount }) => {
          const active = activePage === label;
          const displayedUnreadCount =
            label === "Notifications" ? notificationUnreadCount : unreadCount;

          return (
            <button
              key={label}
              type="button"
              onClick={() => onNavigate(label)}
              className={`relative flex w-full items-center gap-2 rounded-xl px-2 py-2.5 text-left text-[13px] transition-colors duration-200 ${
                active
                  ? "bg-neutral-100 font-semibold text-black"
                  : "text-neutral-700 hover:bg-neutral-50 hover:text-black"
              }`}
            >
              {label === "Notifications" ? (
                <span className="relative inline-flex h-[17px] w-[17px] flex-none items-center justify-center">
                  <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
                  {displayedUnreadCount > 0 && (
                    <span
                      aria-label={`${displayedUnreadCount} unread notifications`}
                      className="absolute -right-2.5 -top-2 z-10 grid h-[17px] min-w-[17px] place-items-center rounded-full border-2 border-white bg-[#FF2D4A] px-1 text-[9px] font-bold leading-none text-white"
                    >
                      {displayedUnreadCount > 99 ? "99+" : displayedUnreadCount}
                    </span>
                  )}
                </span>
              ) : (
                <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
              )}

              <span className="flex-1">{label}</span>

              {label !== "Notifications" && displayedUnreadCount > 0 && (
                <span
                  aria-label={`${displayedUnreadCount} unread ${label.toLowerCase()}`}
                  className="grid h-5 min-w-5 place-items-center rounded-full bg-[#FF2D4A] px-1 text-[11px] font-semibold text-white"
                >
                  {displayedUnreadCount > 99 ? "99+" : displayedUnreadCount}
                </span>
              )}

              {unread && <span className="h-2 w-2 rounded-full bg-[#FF2D4A]" />}
            </button>
          );
        })}
      </nav>

      <section className="mt-7 border-t border-black/[0.08] pt-5">
        <h2 className="mb-4 px-2 text-[12px] font-medium text-neutral-500">
          Following
        </h2>

        <div className="space-y-2.5">
          {creators.map((creator) => (
            <div
              key={creator.name}
              className="flex min-w-0 items-center gap-2 px-1"
            >
              <div className="relative shrink-0">
                <img
                  src={`https://images.unsplash.com/${creator.image}?auto=format&fit=crop&w=64&h=64&q=80`}
                  alt={creator.name}
                  className="h-7 w-7 rounded-full object-cover ring-1 ring-black/5"
                />

                {creator.online && (
                  <span className="absolute -right-0.5 bottom-0 h-2 w-2 rounded-full border-2 border-white bg-neutral-500" />
                )}
              </div>

              <span className="truncate text-[11px] text-neutral-700">
                {creator.name}
              </span>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="mt-5 flex items-center gap-1 px-1 text-[12px] text-neutral-500 transition hover:text-black"
        >
          <MoreHorizontal size={16} /> Show more
        </button>
      </section>
    </aside>
  );
}

export default Sidebar;
