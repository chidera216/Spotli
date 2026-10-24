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
import VideoViewer from "../components/VideoViewer";
import { videoPosts } from "../components/postData";

function MainLayout() {
  const [selectedPost, setSelectedPost] = useState(null);
  const [viewerPosts, setViewerPosts] = useState([]);
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

    setViewerPosts([postFromNotification]);
    setSelectedPost(postFromNotification);
    homeScrollYRef.current = 0;
    hadViewerOpenRef.current = true;
    navigate("/home", { replace: true, state: {} });
  }, [location.state, navigate]);

  // Open a video or photo without unmounting Home.
  function handleOpenPost(post, feedPosts = []) {
    if (!post) return;

    homeScrollYRef.current = window.scrollY;
    hadViewerOpenRef.current = true;

    setViewerPosts(Array.isArray(feedPosts) ? feedPosts : []);
    setSelectedPost(post);
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
          <Home onOpenVideo={handleOpenPost} onOpenPhoto={handleOpenPost} />
        </div>
      )}

      {/* MOBILE PROFILE */}
      {activePage === "Profile" && isMobileViewport && (
        <div
          className="min-h-screen bg-white text-black md:hidden"
          style={selectedPost ? { display: "none" } : undefined}
        >
          <Profile onOpenVideo={handleOpenPost} onOpenPhoto={handleOpenPost} />
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
            onOpenVideo={handleOpenPost}
            onOpenPhoto={handleOpenPost}
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
          <Sidebar activePage={activePage} onNavigate={navigateTo} />
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
            <Home onOpenVideo={handleOpenPost} onOpenPhoto={handleOpenPost} />
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
          <Profile onOpenVideo={handleOpenPost} onOpenPhoto={handleOpenPost} />
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
            onOpenVideo={handleOpenPost}
            onOpenPhoto={handleOpenPost}
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
          onBack={closeViewer}
        />
      )}
    </>
  );
}

export default MainLayout;
