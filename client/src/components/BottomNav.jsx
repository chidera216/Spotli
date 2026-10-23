import { useLocation, useNavigate } from "react-router-dom";
import { House, Compass, Plus, MessageCircle, UserRound } from "lucide-react";

const tabs = [
  { label: "Home", Icon: House, path: "/home" },
  { label: "Explore", Icon: Compass, path: "/explore" },
  { label: "Create", Icon: Plus, path: "/create" },
  { label: "Messages", Icon: MessageCircle, path: "/messages", unreadCount: 3 },
  { label: "Profile", Icon: UserRound, path: "/profile", active: true },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-50 flex h-[68px] items-center border-t border-black/[0.08] bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] text-black shadow-[0_-4px_20px_rgba(0,0,0,0.04)] backdrop-blur md:hidden"
    >
      {tabs.map(({ label, Icon, path, unreadCount }) => {
        const active =
          location.pathname === path ||
          (path === "/home" && location.pathname === "/");

        return (
          <button
            key={label}
            type="button"
            aria-label={label}
            aria-current={active ? "page" : undefined}
            onClick={() => navigate(path)}
            className={`relative flex h-full flex-1 flex-col items-center justify-center gap-1 text-[11px] transition-colors ${active ? "font-semibold text-black" : "text-neutral-500 hover:text-black"}`}
          >
            {label === "Create" ? (
              <span className="grid h-10 w-10 place-items-center rounded-full bg-black text-white transition-transform duration-200 hover:scale-105">
                <Icon size={22} strokeWidth={2.2} />
              </span>
            ) : (
              <span className="relative">
                <Icon size={21} strokeWidth={active ? 2.3 : 1.8} />
                {unreadCount ? (
                  <span className="absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#FF2D4A] px-1 text-[9px] font-semibold text-white">
                    {unreadCount}
                  </span>
                ) : null}
              </span>
            )}
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
