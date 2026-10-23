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

function TopBar() {
  const navigate = useNavigate();
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
      className={`flex h-11 items-center justify-between gap-3 transition-all duration-300 ease-in-out ${
        isVisible
          ? "translate-y-0 opacity-100"
          : "-translate-y-full opacity-0 pointer-events-none"
      }`}
    >
      {/* Spotli logo — mobile only */}
      <h1 className="shrink-0 text-[27px] font-extrabold leading-none tracking-tight text-black md:hidden">
        Spotli<span style={{ color: BRAND }}>.</span>
      </h1>

      {/* Search icon and profile */}
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {/* Icon-only search on mobile */}
        <button
          type="button"
          aria-label="Search"
          onClick={() => navigate("/search")}
          className="grid h-10 w-10 place-items-center rounded-full text-gray-800 transition-colors hover:bg-gray-100"
        >
          <Search size={23} />
        </button>

        {/* Notifications — tablet and desktop */}
        <button
          type="button"
          aria-label="Notifications"
          className="relative hidden text-gray-700 md:block"
        >
          <Bell size={19} />
          <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-red-500" />
        </button>

        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          onClick={() => navigate("/settings")}
          className="grid h-10 w-10 place-items-center rounded-full text-gray-700 transition-colors hover:bg-gray-100"
        >
          <Settings size={19} />
        </button>

        {/* Logged-in user's profile */}
        <button
          type="button"
          aria-label={
            fullName ? `Open ${fullName}'s profile menu` : "Open profile menu"
          }
          title={fullName || "Profile"}
          className="flex items-center gap-1"
        >
          {avatarUrl && !imageFailed ? (
            <img
              src={avatarUrl}
              alt={fullName || "Your profile"}
              className="h-8 w-8 rounded-full object-cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#FF2D4A] text-xs font-semibold text-white">
              {getInitials(user)}
            </span>
          )}

          <ChevronDown size={14} className="hidden text-gray-500 md:block" />
        </button>
      </div>
    </header>
  );
}

export default TopBar;
