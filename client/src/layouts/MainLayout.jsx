import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (location.pathname === "/home") {
      setActivePage("Home");
    } else if (location.pathname === "/create") {
      setActivePage("Create");
    }
  }, [location.pathname]);

  function handleOpenPost(post, feedPosts = []) {
    if (!post) return;

    setViewerPosts(Array.isArray(feedPosts) ? feedPosts : []);
    setSelectedPost(post);
  }

  function closeViewer() {
    setSelectedPost(null);
  }

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
      {/* Mobile homepage */}
      {!selectedPost && activePage === "Home" && (
        <div className="min-h-screen bg-white text-black md:hidden">
          <Home onOpenVideo={handleOpenPost} onOpenPhoto={handleOpenPost} />
        </div>
      )}

      {/* Mobile Create page */}
      {!selectedPost && activePage === "Create" && (
        <div className="min-h-screen bg-white text-black md:hidden">
          <Create />
        </div>
      )}

      {/* Mobile mixed-media viewer */}
      {selectedPost && (
        <div className="md:hidden">
          <MobileVideoFeed
            key={`mobile-${selectedPost.id}`}
            initialPost={selectedPost}
            posts={postsForViewer}
            onBack={closeViewer}
          />
        </div>
      )}

      {/* Persistent sidebar on tablet and desktop */}
      <div className="hidden md:block">
        <Sidebar activePage={activePage} onNavigate={navigateTo} />
      </div>

      {/* Tablet and desktop homepage */}
      {!selectedPost && activePage === "Home" && (
        <div className="hidden min-h-screen bg-white text-black md:block">
          <main className="ml-40 min-h-screen px-4 py-3 lg:mr-[250px] lg:px-5">
            <Home onOpenVideo={handleOpenPost} onOpenPhoto={handleOpenPost} />
          </main>

          <div className="hidden lg:block">
            <RightSidebar />
          </div>
        </div>
      )}

      {/* Tablet and desktop Create page */}
      {!selectedPost && activePage === "Create" && (
        <div className="hidden min-h-screen bg-white text-black md:block">
          <main className="ml-40 min-h-screen px-4 py-3 lg:px-5">
            <Create />
          </main>
        </div>
      )}

      {/* Other navigation pages */}
      {!selectedPost && activePage !== "Home" && activePage !== "Create" && (
        <div className="min-h-screen bg-white px-6 py-10 text-black md:ml-40">
          <h1 className="text-3xl font-black">{activePage}</h1>
          <p className="mt-2 text-gray-500">
            This page has not been implemented yet.
          </p>
        </div>
      )}

      {/* Tablet viewer */}
      {selectedPost && (
        <div className="hidden md:block lg:hidden">
          <TabletVideoViewer
            key={`tablet-${selectedPost.id}`}
            posts={postsForViewer}
            initialPost={selectedPost}
            onBack={closeViewer}
          />
        </div>
      )}

      {/* Desktop viewer */}
      {selectedPost && (
        <div className="hidden lg:block">
          <DesktopVideoViewer
            key={`desktop-${selectedPost.id}`}
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
