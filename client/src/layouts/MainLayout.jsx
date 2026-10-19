import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import Home from "../pages/Home";
import Create from "../pages/Create";
import RightSidebar from "../components/RightSidebar";
import MobileVideoFeed from "../components/MobileVideoFeed";
import TabletVideoViewer from "../components/TabletVideoViewer";
import DesktopVideoViewer from "../components/DesktopVideoViewer";
import { videoPosts } from "../components/postData";

function MainLayout() {
  const [selectedPost, setSelectedPost] = useState(null);
  const [viewerPosts, setViewerPosts] = useState([]);
  const [activePage, setActivePage] = useState("Home");

  const location = useLocation();
  const navigate = useNavigate();

  // Remember the Home feed position when opening a post.
  const homeScrollYRef = useRef(0);
  const hadViewerOpenRef = useRef(false);

  useEffect(() => {
    if (location.pathname === "/home") {
      setActivePage("Home");
    } else if (location.pathname === "/create") {
      setActivePage("Create");
    }
  }, [location.pathname]);

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
    if (selectedPost || !hadViewerOpenRef.current) return;

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

    setActivePage(page);
  }

  const postsForViewer = viewerPosts.length > 0 ? viewerPosts : videoPosts;

  return (
    <>
      {/* MOBILE HOME
          Keep Home mounted so its shuffled feed is preserved.
          Hide it completely while a post is open. */}
      {activePage === "Home" && (
        <div
          className="min-h-screen bg-white text-black md:hidden"
          style={selectedPost ? { display: "none" } : undefined}
        >
          <Home onOpenVideo={handleOpenPost} onOpenPhoto={handleOpenPost} />
        </div>
      )}

      {/* MOBILE CREATE */}
      {!selectedPost && activePage === "Create" && (
        <div className="min-h-screen bg-white text-black md:hidden">
          <Create />
        </div>
      )}

      {/* MOBILE VIDEO / PHOTO VIEWER */}
      {selectedPost && (
        <div className="md:hidden">
          <MobileVideoFeed
            key={`mobile-${selectedPost.id || selectedPost._id}`}
            initialPost={selectedPost}
            posts={postsForViewer}
            onBack={closeViewer}
          />
        </div>
      )}

      {/* SIDEBAR */}
      <div className="hidden md:block">
        <Sidebar activePage={activePage} onNavigate={navigateTo} />
      </div>

      {/* TABLET AND DESKTOP HOME
          Hide with inline display:none so md:block cannot override it. */}
      {activePage === "Home" && (
        <div
          className="hidden min-h-screen bg-white text-black md:block"
          style={selectedPost ? { display: "none" } : undefined}
        >
          <main className="ml-40 min-h-screen px-4 py-3 lg:mr-[250px] lg:px-5">
            <Home onOpenVideo={handleOpenPost} onOpenPhoto={handleOpenPost} />
          </main>

          <div className="hidden lg:block">
            <RightSidebar />
          </div>
        </div>
      )}

      {/* TABLET AND DESKTOP CREATE */}
      {!selectedPost && activePage === "Create" && (
        <div className="hidden min-h-screen bg-white text-black md:block">
          <main className="ml-40 min-h-screen px-4 py-3 lg:px-5">
            <Create />
          </main>
        </div>
      )}

      {/* OTHER PAGES */}
      {!selectedPost && activePage !== "Home" && activePage !== "Create" && (
        <div className="min-h-screen bg-white px-6 py-10 text-black md:ml-40">
          <h1 className="text-3xl font-black">{activePage}</h1>

          <p className="mt-2 text-gray-500">
            This page has not been implemented yet.
          </p>
        </div>
      )}

      {/* TABLET VIDEO / PHOTO VIEWER */}
      {selectedPost && (
        <div className="hidden md:block lg:hidden">
          <TabletVideoViewer
            key={`tablet-${selectedPost.id || selectedPost._id}`}
            posts={postsForViewer}
            initialPost={selectedPost}
            onBack={closeViewer}
          />
        </div>
      )}

      {/* DESKTOP VIDEO / PHOTO VIEWER */}
      {selectedPost && (
        <div className="hidden lg:block">
          <DesktopVideoViewer
            key={`desktop-${selectedPost.id || selectedPost._id}`}
            posts={postsForViewer}
            initialPost={selectedPost}
            onBack={closeViewer}
          />
        </div>
      )}
    </>
  );
}

export default MainLayout;
