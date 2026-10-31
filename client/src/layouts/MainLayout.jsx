import { useRef, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import Home from "../pages/Home";
import Create from "../pages/Create";
import Profile from "../pages/Profile";
import PublicProfile from "../pages/PublicProfile";
import Notifications from "../pages/Notifications";
import SearchResults from "../pages/SearchResults";
import Settings from "../pages/Settings";
import RightSidebar from "../components/RightSidebar";
import VideoViewer, { preloadCloudinaryVideoStream } from "../components/VideoViewer";
import { videoPosts } from "../components/postData";
import api from "../services/api";
import { useAuth } from "../context/useAuth";

const API_ORIGIN = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/api\/?$/, "");

function getMediaUrlForPlaybackWarmup(value) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  return (
    value.url ||
    value.src ||
    value.videoUrl ||
    value.secure_url ||
    value.path ||
    value.location ||
    ""
  );
}

// Start warming only the video the user explicitly opened. The HLS helper
// selects the same network-aware rendition used by the active player, so
// Data Saver continues to use its existing low-resolution/low-bitrate profile.
function prewarmOpenedPost(post) {
  const mediaType = String(
    post?.mediaType || post?.type || post?.postType || post?.kind || "",
  ).toLowerCase();
  if (["photo", "image", "photos", "gallery"].includes(mediaType)) return;

  const candidates = [
    post?.videoUrl,
    post?.video,
    post?.videoFile,
    Array.isArray(post?.videos) ? post.videos[0] : "",
    post?.mediaUrl,
    post?.media,
    Array.isArray(post?.mediaUrls) ? post.mediaUrls[0] : "",
    post?.url,
  ];

  for (const candidate of candidates) {
    const rawUrl = getMediaUrlForPlaybackWarmup(candidate);
    if (!rawUrl) continue;
    const resolvedUrl = rawUrl.startsWith("/")
      ? `${API_ORIGIN}${rawUrl}`
      : rawUrl;
    if (!/^https?:\/\//i.test(resolvedUrl)) continue;

    // Do not await this request: opening the viewer must remain synchronous.
    // The active HLS loader shares this exact playlist/segment warm cache.
    preloadCloudinaryVideoStream(resolvedUrl, "auto", {
      includeFirstSegment: true,
    });
    return;
  }
}

function MainLayout() {
  const { user } = useAuth();
  const [selectedPost, setSelectedPost] = useState(null);
  const [viewerPosts, setViewerPosts] = useState([]);
  const [viewerPreservePostOrder, setViewerPreservePostOrder] = useState(false);
  const [viewerInitialPostIndex, setViewerInitialPostIndex] = useState(null);
  const [fallbackPage, setFallbackPage] = useState("Home");
  const [isMobileViewport, setIsMobileViewport] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateViewport = (event) => setIsMobileViewport(event.matches);
    setIsMobileViewport(mediaQuery.matches);
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  const location = useLocation();
  const navigate = useNavigate();

  // Derive route-backed pages from the URL instead of syncing them through an effect.
  const publicProfileMatch = location.pathname.match(/^\/profile\/([^/]+)$/);
  const publicProfileId = publicProfileMatch?.[1] || "";

  const activePage = publicProfileId
    ? "PublicProfile"
    : location.pathname === "/home"
      ? "Home"
      : location.pathname === "/create"
        ? "Create"
        : location.pathname === "/profile"
          ? "Profile"
          : location.pathname === "/notifications"
            ? "Notifications"
            : location.pathname === "/search"
              ? "Search"
              : location.pathname === "/settings"
                ? "Settings"
                : fallbackPage;

  // Remember the Home feed position when opening a post.
  const homeScrollYRef = useRef(0);
  const hadViewerOpenRef = useRef(false);

  useEffect(() => {
    const postFromNotification = location.state?.openPost;
    if (!postFromNotification) return;

    prewarmOpenedPost(postFromNotification);
    setViewerPosts([postFromNotification]);
    setViewerPreservePostOrder(false);
    setViewerInitialPostIndex(null);
    setSelectedPost(postFromNotification);
    homeScrollYRef.current = 0;
    hadViewerOpenRef.current = true;
    navigate("/home", { replace: true, state: {} });
  }, [location.state, navigate]);

  // Open a video or photo without unmounting Home.
  function handleOpenPost(post, feedPosts = [], options = {}) {
    if (!post) return;

    prewarmOpenedPost(post);
    homeScrollYRef.current = window.scrollY;
    hadViewerOpenRef.current = true;

    const orderedPosts = Array.isArray(feedPosts) ? feedPosts : [];
    setViewerPosts(orderedPosts);
    setViewerPreservePostOrder(Boolean(options?.preservePostOrder));
    const requestedIndex = Number(options?.initialPostIndex);
    setViewerInitialPostIndex(
      options?.preservePostOrder &&
        Number.isInteger(requestedIndex) &&
        requestedIndex >= 0
        ? requestedIndex
        : null,
    );
    setSelectedPost(post);
  }

  // Profile viewers must retain the grid's ordering so the selected item keeps
  // its real neighbours (e.g. opening item 5 lets the viewer scroll to 4 and 6).
  function handleOpenProfilePost(post, feedPosts = []) {
    const orderedPosts = Array.isArray(feedPosts) ? feedPosts : [];
    const selectedId = post?._id ?? post?.id ?? post?.postId;
    const initialPostIndex = orderedPosts.findIndex((candidate) => {
      if (candidate === post) return true;
      const candidateId = candidate?._id ?? candidate?.id ?? candidate?.postId;
      return (
        selectedId != null &&
        candidateId != null &&
        String(candidateId) === String(selectedId)
      );
    });

    handleOpenPost(post, orderedPosts, {
      preservePostOrder: true,
      initialPostIndex,
    });
  }

  // Close the viewer and return to Home.
  function closeViewer() {
    setSelectedPost(null);
  }

  // Restore the previous Home scroll position after Home becomes visible.
  useEffect(() => {
    if (selectedPost || !hadViewerOpenRef.current) return undefined;

    const savedScrollY = homeScrollYRef.current;

    const frameId = window.requestAnimationFrame(() => {
      window.scrollTo({
        top: savedScrollY,
        behavior: "auto",
      });

      hadViewerOpenRef.current = false;
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [selectedPost]);

  function navigateTo(page) {
    closeViewer();

    if (page === "Home") {
      navigate("/home");
      return;
    }

    if (page === "Create") {
      navigate("/create");
      return;
    }

    if (page === "Profile") {
      navigate("/profile");
      return;
    }

    if (page === "Notifications") {
      navigate("/notifications");
      return;
    }

    if (page === "Search") {
      navigate("/search");
      return;
    }

    if (page === "Settings") {
      navigate("/settings");
      return;
    }

    setFallbackPage(page);
  }

  // Viewer header navigation should leave the overlay cleanly without restoring
  // Home's saved scroll position over the destination page.
  function navigateFromViewer(path) {
    hadViewerOpenRef.current = false;
    setSelectedPost(null);
    setViewerPosts([]);
    setViewerPreservePostOrder(false);
    setViewerInitialPostIndex(null);
    navigate(path);
  }

  async function handleDeletePost(postOrId) {
    const postId = String(
      typeof postOrId === "string" || typeof postOrId === "number"
        ? postOrId
        : postOrId?._id || postOrId?.id || postOrId?.postId || "",
    );
    if (!postId) throw new Error("This post does not have a valid ID.");

    const result = await api.posts.delete(postId);
    window.dispatchEvent(
      new CustomEvent("spotli:post-deleted", { detail: { postId } }),
    );
    setViewerPosts((current) =>
      current.filter(
        (post) =>
          String(post?._id || post?.id || post?.postId || "") !== postId,
      ),
    );
    setSelectedPost((current) => {
      const currentId = String(
        current?._id || current?.id || current?.postId || "",
      );
      return currentId === postId ? null : current;
    });
    return result;
  }

  const postsForViewer = viewerPosts.length > 0 ? viewerPosts : videoPosts;

  return (
    <>
      {/* MOBILE HOME
          Keep Home mounted so its shuffled feed is preserved.
          Hide it completely while a post is open. */}
      {activePage === "Home" && isMobileViewport && (
        <div
          className="min-h-screen bg-white text-black md:hidden"
          style={selectedPost ? { display: "none" } : undefined}
        >
          <Home
            onOpenVideo={handleOpenPost}
            onOpenPhoto={handleOpenPost}
            onDeletePost={handleDeletePost}
            currentUserId={String(user?._id || user?.id || "")}
          />
        </div>
      )}

      {/* MOBILE PROFILE */}
      {activePage === "Profile" && isMobileViewport && (
        <div
          className="min-h-screen bg-white text-black md:hidden"
          style={selectedPost ? { display: "none" } : undefined}
        >
          <Profile
            onOpenVideo={handleOpenProfilePost}
            onOpenPhoto={handleOpenProfilePost}
            onDeletePost={handleDeletePost}
          />
        </div>
      )}

      {/* MOBILE PUBLIC CREATOR PROFILE */}
      {activePage === "PublicProfile" && isMobileViewport && (
        <div
          className="min-h-screen bg-white text-black md:hidden"
          style={selectedPost ? { display: "none" } : undefined}
        >
          <PublicProfile
            userId={publicProfileId}
            onOpenVideo={handleOpenProfilePost}
            onOpenPhoto={handleOpenProfilePost}
          />
        </div>
      )}

      {/* MOBILE CREATE */}
      {!selectedPost && activePage === "Create" && isMobileViewport && (
        <div className="min-h-screen bg-white text-black md:hidden">
          <Create />
        </div>
      )}

      {/* SIDEBAR */}
      {!isMobileViewport && (
        <div className="hidden md:block">
          <Sidebar
            activePage={activePage}
            onNavigate={navigateTo}
            collapsed={Boolean(selectedPost && !isMobileViewport)}
          />
        </div>
      )}

      {/* TABLET AND DESKTOP HOME
          Hide with inline display:none so md:block cannot override it. */}
      {activePage === "Home" && !isMobileViewport && (
        <div
          className="hidden min-h-screen bg-white text-black md:block"
          style={selectedPost ? { display: "none" } : undefined}
        >
          <main className="ml-40 min-h-screen px-4 py-3 lg:mr-62.5 lg:px-5">
            <Home
              onOpenVideo={handleOpenPost}
              onOpenPhoto={handleOpenPost}
              onDeletePost={handleDeletePost}
              currentUserId={String(user?._id || user?.id || "")}
            />
          </main>

          <div className="hidden lg:block">
            <RightSidebar />
          </div>
        </div>
      )}

      {/* TABLET AND DESKTOP PROFILE */}
      {activePage === "Profile" && !isMobileViewport && (
        <div
          className="hidden min-h-screen bg-white text-black md:block"
          style={selectedPost ? { display: "none" } : undefined}
        >
          <Profile
            onOpenVideo={handleOpenProfilePost}
            onOpenPhoto={handleOpenProfilePost}
            onDeletePost={handleDeletePost}
          />
        </div>
      )}

      {/* TABLET AND DESKTOP PUBLIC CREATOR PROFILE */}
      {activePage === "PublicProfile" && !isMobileViewport && (
        <div
          className="hidden min-h-screen bg-white text-black md:block"
          style={selectedPost ? { display: "none" } : undefined}
        >
          <PublicProfile
            userId={publicProfileId}
            onOpenVideo={handleOpenProfilePost}
            onOpenPhoto={handleOpenProfilePost}
          />
        </div>
      )}

      {/* TABLET AND DESKTOP CREATE */}
      {!selectedPost && activePage === "Create" && !isMobileViewport && (
        <div className="hidden min-h-screen bg-white text-black md:block">
          <main className="ml-40 min-h-screen px-4 py-3 lg:px-5">
            <Create />
          </main>
        </div>
      )}

      {/* OTHER PAGES */}
      {!selectedPost &&
        activePage !== "Home" &&
        activePage !== "Create" &&
        activePage !== "Profile" &&
        activePage !== "PublicProfile" && (
          <div className="min-h-screen bg-white text-black md:ml-40">
            {activePage === "Notifications" ? (
              <Notifications />
            ) : activePage === "Search" ? (
              <SearchResults
                onOpenVideo={handleOpenPost}
                onOpenPhoto={handleOpenPost}
              />
            ) : activePage === "Settings" ? (
              <Settings />
            ) : (
              <div className="px-6 py-10">
                <h1 className="text-3xl font-black">{activePage}</h1>
                <p className="mt-2 text-gray-500">
                  This page has not been implemented yet.
                </p>
              </div>
            )}
          </div>
        )}

      {/* ONE RESPONSIVE VIDEO / PHOTO VIEWER FOR ALL SCREEN SIZES */}
      {selectedPost && (
        <VideoViewer
          key={`viewer-${selectedPost.id || selectedPost._id}`}
          posts={postsForViewer}
          initialPost={selectedPost}
          preservePostOrder={viewerPreservePostOrder}
          initialPostIndex={viewerInitialPostIndex}
          onBack={closeViewer}
          onNavigateFromViewer={navigateFromViewer}
          onDeletePost={handleDeletePost}
          currentUserId={String(user?._id || user?.id || "")}
        />
      )}
    </>
  );
}

export default MainLayout;
