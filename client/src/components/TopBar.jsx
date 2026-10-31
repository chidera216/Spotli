import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Bell, ChevronDown, Settings } from "lucide-react";

import api from "../services/api";

const BRAND = "#FF2D4A";

const API_ORIGIN = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/api\/?$/, "");

function getMediaUrl(url) {
  if (!url || typeof url !== "string") return "";

  if (/^https?:\/\//i.test(url)) return url;

  return `${API_ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`;
}

function getInitials(user) {
  const firstName = user?.firstName || "";
  const lastName = user?.lastName || "";

  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`;

  return initials.toUpperCase() || "S";
}

function TopBar({ variant = "default", onCloseViewer, onNavigateFromViewer }) {
  const navigate = useNavigate();
  const isViewer = variant === "viewer";
  const goTo = (path) => {
    if (isViewer && onNavigateFromViewer) {
      onNavigateFromViewer(path);
      return;
    }
    if (isViewer) onCloseViewer?.();
    navigate(path);
  };
  const [isVisible, setIsVisible] = useState(true);
  const [user, setUser] = useState(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadUser() {
      try {
        const result = await api.auth.me();

        if (!active) return;

        // Support common response shapes from authentication endpoints.
        const currentUser = result.user || result.data?.user || result.data;

        if (currentUser && typeof currentUser === "object") {
          setUser(currentUser);
        }
      } catch (error) {
        // A logged-out visitor may not have an authenticated session.
        console.error("Unable to load profile:", error.message);
      }
    }

    loadUser();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const difference = currentScrollY - lastScrollY;

      if (currentScrollY <= 10) {
        setIsVisible(true);
      } else if (difference > 5) {
        setIsVisible(false);
      } else if (difference < -5) {
        setIsVisible(true);
      }

      lastScrollY = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, {
      passive: true,
    });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const avatarUrl = getMediaUrl(user?.avatar);
  const fullName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();

  return (
    <header
      className={`${
        isViewer
          ? "flex h-12 w-full items-center justify-end gap-4 bg-transparent px-3 text-white"
          : "flex h-11 items-center justify-between gap-3"
      } transition-all duration-300 ease-in-out ${
        isVisible
          ? "translate-y-0 opacity-100"
          : "-translate-y-full opacity-0 pointer-events-none"
      }`}
    >
      {/* Spotli branding remains on normal mobile pages; the focused viewer uses a compact actions-only bar. */}
      {!isViewer && (
        <h1 className="shrink-0 text-[27px] font-extrabold leading-none tracking-tight text-black md:hidden">
          Spotli<span style={{ color: BRAND }}>.</span>
        </h1>
      )}

      {/* Search and account actions */}
      <div
        className={`${isViewer ? "flex shrink-0 items-center gap-2" : "ml-auto flex shrink-0 items-center gap-3"}`}
      >
        <button
          type="button"
          aria-label="Search"
          title="Search"
          onClick={() => goTo("/search")}
          className={`grid place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2D4A] ${
            isViewer
              ? "h-8 w-8 text-white/90 hover:text-white"
              : "h-10 w-10 text-gray-800 hover:bg-gray-100"
          }`}
        >
          <Search size={isViewer ? 19 : 23} strokeWidth={2} />
        </button>

        {/* Notifications â€” tablet and desktop */}
        <button
          type="button"
          aria-label="Notifications"
          title="Notifications"
          onClick={() => goTo("/notifications")}
          className={`relative grid place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2D4A] ${
            isViewer
              ? "h-8 w-8 text-white/90 hover:text-white"
              : "hidden h-10 w-10 text-gray-700 hover:bg-gray-100 md:grid"
          }`}
        >
          <Bell size={isViewer ? 18 : 19} strokeWidth={2} />
          <span
            className={`absolute right-[5px] top-[5px] h-2 w-2 rounded-full bg-[#FF2D4A] ${isViewer ? "ring-2 ring-black" : "ring-2 ring-white"}`}
          />
        </button>

        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          onClick={() => goTo("/settings")}
          className={`grid place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2D4A] ${
            isViewer
              ? "h-8 w-8 text-white/90 hover:text-white"
              : "h-10 w-10 text-gray-700 hover:bg-gray-100"
          }`}
        >
          <Settings size={isViewer ? 18 : 19} strokeWidth={2} />
        </button>

        {/* Logged-in user's profile */}
        <button
          type="button"
          aria-label={
            fullName ? `Open ${fullName}'s profile menu` : "Open profile menu"
          }
          title={fullName || "Profile"}
          onClick={() => goTo("/profile")}
          className="flex items-center gap-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2D4A]"
        >
          {avatarUrl && !imageFailed ? (
            <img
              src={avatarUrl}
              alt={fullName || "Your profile"}
              className={`${isViewer ? "h-9 w-9" : "h-8 w-8"} rounded-full object-cover`}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span
              className={`${isViewer ? "h-10 w-10 text-xs" : "h-8 w-8 text-xs"} grid place-items-center rounded-full bg-[#FF2D4A] font-semibold text-white`}
            >
              {getInitials(user)}
            </span>
          )}

          <ChevronDown
            size={isViewer ? 10 : 12}
            className={`hidden md:block ${isViewer ? "text-white/70" : "text-gray-500"}`}
          />
        </button>
      </div>
    </header>
  );
}

export default TopBar;
