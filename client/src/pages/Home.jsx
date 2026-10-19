import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Home as HomeIcon, Wallet, User } from "lucide-react";

import TopBar from "../components/TopBar";
import Stories from "../components/Stories";
import CategoryFilters from "../components/CategoryFilters";
import PostGrid from "../components/PostGrid";
import DesktopVideoViewer from "../components/DesktopVideoViewer";
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

function shufflePosts(posts) {
  const shuffled = [...posts];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

function BottomNav() {
  const navigate = useNavigate();

  const tabs = [
    { label: "Home", Icon: HomeIcon, active: true },
    { label: "Explore", Icon: Search },
    { label: "Create" },
    { label: "Wallet", Icon: Wallet },
    { label: "Profile", Icon: User },
  ];

  function handleTabClick(label) {
    if (label === "Create") {
      navigate("/create");
    } else if (label === "Home") {
      navigate("/home");
    }
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex h-16 shrink-0 items-center bg-black px-2 pb-[env(safe-area-inset-bottom)] md:hidden">
      {tabs.map(({ label, Icon, active }) => (
        <button
          key={label}
          type="button"
          aria-label={label}
          onClick={() => handleTabClick(label)}
          className={`flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] ${
            active ? "font-semibold text-white" : "text-white/70"
          }`}
        >
          {label === "Create" ? (
            <>
              <span
                className="-mt-3 grid h-12 w-12 place-items-center rounded-full text-white"
                style={{ backgroundColor: BRAND }}
              >
                <Plus size={26} strokeWidth={2.5} />
              </span>
              <span className="-mt-1">Create</span>
            </>
          ) : (
            <>
              <Icon
                size={24}
                strokeWidth={active ? 2.5 : 1.8}
                fill={active ? "white" : "none"}
              />
              <span>{label}</span>
            </>
          )}
        </button>
      ))}
    </nav>
  );
}

function formatCount(value) {
  const count = Number(value) || 0;

  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
  }

  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  }

  return String(count);
}

function formatTime(date) {
  if (!date) return "";

  const timestamp = new Date(date).getTime();
  if (Number.isNaN(timestamp)) return "";

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

function normalizePost(post) {
  const creator =
    post.creator && typeof post.creator === "object" ? post.creator : null;

  const firstName = creator?.firstName || "";
  const lastName = creator?.lastName || "";

  const creatorName =
    `${firstName} ${lastName}`.trim() ||
    creator?.name ||
    post.creatorName ||
    (typeof post.creator === "string" ? post.creator : "") ||
    "Spotli creator";

  const emailHandle = creator?.email
    ? creator.email.split("@")[0].replace(/[^a-zA-Z0-9._]/g, "")
    : "";

  const nameHandle = `${firstName}${lastName}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  const username = emailHandle || nameHandle || "creator";

  const mediaUrls = Array.isArray(post.mediaUrls)
    ? post.mediaUrls.map(getMediaUrl).filter(Boolean)
    : [];

  const mediaType = post.mediaType || post.type || "video";
  const isPhoto = mediaType === "photo" || mediaType === "image";

  const mediaUrl = getMediaUrl(post.mediaUrl);
  const thumbnailUrl = getMediaUrl(post.thumbnailUrl);

  return {
    ...post,
    id: String(post._id || post.id),
    type: isPhoto ? "photo" : "video",
    mediaType: isPhoto ? "photo" : "video",
    mediaUrl,
    thumbnailUrl,
    mediaUrls,
    image: thumbnailUrl || (isPhoto ? mediaUrl : ""),
    creator: creatorName,
    creatorAvatar: getMediaUrl(creator?.avatar || post.creatorAvatar),
    creatorName,
    handle: `@${username}`,
    likes: formatCount(post.likesCount ?? post.likes),
    comments: formatCount(post.commentsCount ?? post.comments),
    views: `${formatCount(post.viewsCount ?? post.views)} views`,
    time: formatTime(post.createdAt) || post.time || "",
  };
}

function Home({ onOpenVideo, onOpenPhoto }) {
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [desktopVideoPost, setDesktopVideoPost] = useState(null);

  const feedRequestRef = useRef(0);

  // Remember where the user was in the Home feed.
  const feedScrollYRef = useRef(0);

  async function loadPosts() {
    const requestId = ++feedRequestRef.current;

    setIsLoading(true);
    setErrorMessage("");

    try {
      const result = await api.posts.getAll();

      if (!Array.isArray(result.posts)) {
        throw new Error("The server returned an invalid posts response.");
      }

      if (requestId !== feedRequestRef.current) return;

      const normalizedPosts = result.posts.map(normalizePost);

      // Keep the existing shuffle behavior unchanged.
      setPosts(shufflePosts(normalizedPosts));
    } catch (error) {
      if (requestId !== feedRequestRef.current) return;

      setErrorMessage(
        error.message || "Unable to load posts. Please try again.",
      );
    } finally {
      if (requestId === feedRequestRef.current) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadPosts();

    return () => {
      feedRequestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    let lastScrollY = window.scrollY;

    function handleScroll() {
      const currentScrollY = window.scrollY;
      const difference = currentScrollY - lastScrollY;

      if (currentScrollY <= 10) {
        setIsHeaderVisible(true);
      } else if (difference > 5) {
        setIsHeaderVisible(false);
      } else if (difference < -5) {
        setIsHeaderVisible(true);
      }

      lastScrollY = currentScrollY;
    }

    window.addEventListener("scroll", handleScroll, {
      passive: true,
    });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Restore the Home feed position after the desktop viewer closes.
  useEffect(() => {
    if (desktopVideoPost) return;

    const savedScrollY = feedScrollYRef.current;

    if (savedScrollY <= 0) return;

    const frameId = window.requestAnimationFrame(() => {
      window.scrollTo({
        top: savedScrollY,
        behavior: "auto",
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [desktopVideoPost]);

  function handleOpenPost(post) {
    if (!post) return;

    const isPhoto =
      post.type === "photo" ||
      post.type === "image" ||
      post.mediaType === "photo" ||
      post.mediaType === "image";

    if (isPhoto) {
      const callback = onOpenPhoto || onOpenVideo;
      callback?.(post, posts);
      return;
    }

    // Desktop opens the mixed-media feed at the selected video.
    // Mobile and tablet retain their existing viewer callbacks.
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;

    if (isDesktop) {
      // Save the exact Home feed position before opening the viewer.
      feedScrollYRef.current = window.scrollY;
      setDesktopVideoPost(post);
      return;
    }

    onOpenVideo?.(post, posts);
  }

  // Pass the complete feed so photos and videos can appear while scrolling.
  if (desktopVideoPost) {
    return (
      <DesktopVideoViewer
        posts={posts}
        initialPost={desktopVideoPost}
        onBack={() => setDesktopVideoPost(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-white pb-20 text-black md:pb-6">
      <div
        className={`sticky top-0 z-40 transform-gpu bg-white transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
          isHeaderVisible ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <div className="px-3 pt-2 sm:px-4">
          <TopBar />
          <Stories />
        </div>
      </div>

      <main className="px-3 sm:px-4">
        <CategoryFilters />

        {isLoading ? (
          <div
            className="flex min-h-48 items-center justify-center"
            role="status"
          >
            <p className="text-sm text-gray-500">Loading posts...</p>
          </div>
        ) : errorMessage ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-red-600">{errorMessage}</p>
            <button
              type="button"
              onClick={() => void loadPosts()}
              className="rounded-lg bg-[#FF2D4A] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Try again
            </button>
          </div>
        ) : posts.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-2 text-center">
            <h2 className="text-base font-semibold text-gray-900">
              No posts yet
            </h2>
            <p className="max-w-xs text-sm text-gray-500">
              Videos and photos shared by Spotli creators will appear here.
            </p>
          </div>
        ) : (
          <PostGrid
            posts={posts}
            onOpenVideo={handleOpenPost}
            onOpenPhoto={handleOpenPost}
          />
        )}
      </main>

      <BottomNav />
    </div>
  );
}

export default Home;
