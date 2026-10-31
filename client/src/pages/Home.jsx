import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import Stories from "../components/Stories";
import CategoryFilters from "../components/CategoryFilters";
import PostGrid from "../components/PostGrid";
import HomeFeedSkeleton from "../components/HomeFeedSkeleton";
import api from "../services/api";
import {
  getCloudinaryVideoThumbnailUrl,
  isVideoMediaUrl,
} from "../services/media";

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

const TOPIC_ALIASES = {
  ESUT: ["esut", "enugu state university of science and technology"],
  Tech: ["tech", "technology", "programming", "coding", "developer"],
  Travel: ["travel", "trip", "tourism", "vacation"],
  Food: ["food", "cooking", "recipe", "meal", "restaurant"],
  Lifestyle: ["lifestyle", "studentlife", "student life", "daily life"],
  Study: ["study", "studytips", "study tips", "learning", "school"],
  Fitness: ["fitness", "gym", "workout", "exercise"],
  Music: ["music", "song", "singing", "dance", "dancing"],
};

function normalizeTopicValue(value) {
  return String(value || "")
    .trim()
    .replace(/^#/, "")
    .toLowerCase();
}

function getPostTopicValues(post) {
  const values = [];
  const addValue = (value) => {
    if (Array.isArray(value)) {
      value.forEach(addValue);
      return;
    }
    if (typeof value === "string" && value.trim()) {
      values.push(normalizeTopicValue(value));
    }
  };

  addValue(post.topics);
  addValue(post.topic);
  addValue(post.categories);
  addValue(post.category);
  addValue(post.tags);
  addValue(post.hashtags);

  const caption = String(post.caption || "");
  for (const match of caption.matchAll(/#([\p{L}\p{N}_]+)/gu)) {
    values.push(normalizeTopicValue(match[1]));
  }

  return [...new Set(values)];
}

function postMatchesTopic(post, category) {
  const aliases = TOPIC_ALIASES[category] || [category.toLowerCase()];
  const values = getPostTopicValues(post);
  const caption = String(post.caption || "").toLowerCase();

  return aliases.some((alias) => {
    const normalizedAlias = normalizeTopicValue(alias);
    if (values.includes(normalizedAlias)) return true;

    // Support older posts that predate saved topic metadata by matching
    // complete words in their captions rather than arbitrary substrings.
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(
      caption,
    );
  });
}

function mergeUniquePosts(currentPosts, nextPosts) {
  const seen = new Set(currentPosts.map((post) => String(post.id)));
  const merged = [...currentPosts];

  for (const post of nextPosts) {
    const id = String(post.id);
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(post);
    }
  }

  return merged;
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
  const storedThumbnailUrl = getMediaUrl(post.thumbnailUrl);
  const thumbnailUrl =
    (isVideoMediaUrl(storedThumbnailUrl) ? "" : storedThumbnailUrl) ||
    getCloudinaryVideoThumbnailUrl(mediaUrl);

  return {
    ...post,
    id: String(post._id || post.id),
    creatorId: String(
      creator?._id ||
        post.creatorId ||
        (typeof post.creator === "string" ? post.creator : ""),
    ),
    topics: getPostTopicValues(post),
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

function Home({ onOpenVideo, onOpenPhoto, onDeletePost, currentUserId = "" }) {
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [loadMoreError, setLoadMoreError] = useState("");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    hasNextPage: false,
  });
  const [activeCategory, setActiveCategory] = useState("For You");
  const [followingCreatorIds, setFollowingCreatorIds] = useState(
    () => new Set(),
  );
  const [followingLoaded, setFollowingLoaded] = useState(false);
  const [isLoadingFollowing, setIsLoadingFollowing] = useState(false);
  const [followingError, setFollowingError] = useState("");
  const followingRequestRef = useRef(false);
  const loadMoreRequestRef = useRef(false);
  const feedRequestRef = useRef(0);

  async function loadPosts({ page = 1, append = false } = {}) {
    if (append && loadMoreRequestRef.current) return;
    const requestId = ++feedRequestRef.current;

    if (append) {
      loadMoreRequestRef.current = true;
      setIsLoadingMore(true);
      setLoadMoreError("");
    } else {
      setIsLoading(true);
      setErrorMessage("");
    }

    try {
      const result = await api.posts.getAll(page, 20);

      if (!Array.isArray(result.posts)) {
        throw new Error("The server returned an invalid posts response.");
      }

      if (requestId !== feedRequestRef.current) return;

      const normalizedPosts = result.posts.map(normalizePost);

      if (append) {
        // Keep existing cards in place as new pages arrive; only shuffle the
        // newly fetched page, preserving the feed's established presentation.
        setPosts((current) =>
          mergeUniquePosts(current, shufflePosts(normalizedPosts)),
        );
      } else {
        // Keep the existing For You shuffle behavior unchanged.
        setPosts(shufflePosts(normalizedPosts));
      }

      setPagination(
        result.pagination || { page, limit: 20, hasNextPage: false },
      );
    } catch (error) {
      if (requestId !== feedRequestRef.current) return;

      const message =
        error.message || "Unable to load posts. Please try again.";
      if (append) setLoadMoreError(message);
      else setErrorMessage(message);
    } finally {
      if (requestId === feedRequestRef.current) {
        if (append) setIsLoadingMore(false);
        else setIsLoading(false);
      }
      if (append) loadMoreRequestRef.current = false;
    }
  }

  async function handleCategoryChange(category) {
    setActiveCategory(category);
    if (
      category !== "Following" ||
      followingLoaded ||
      followingRequestRef.current
    )
      return;

    followingRequestRef.current = true;
    setIsLoadingFollowing(true);
    setFollowingError("");

    try {
      const authResult = await api.auth.me();
      const user =
        authResult?.user ||
        authResult?.data?.user ||
        authResult?.data ||
        authResult;
      const userId = user?._id || user?.id || user?.userId;

      if (!userId) {
        setFollowingError("Sign in to see posts from creators you follow.");
        return;
      }

      const ids = new Set();
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const result = await api.users.getFollowList(
          userId,
          "following",
          page,
          50,
        );
        (Array.isArray(result?.users) ? result.users : []).forEach(
          (followedUser) => {
            const id = followedUser?._id || followedUser?.id;
            if (id != null) ids.add(String(id));
          },
        );
        hasMore = Boolean(result?.hasMore);
        page += 1;
      }

      setFollowingCreatorIds(ids);
      setFollowingLoaded(true);
    } catch (error) {
      setFollowingError(
        error?.status === 401
          ? "Sign in to see posts from creators you follow."
          : "Couldn't load the accounts you follow. Select Following to try again.",
      );
    } finally {
      followingRequestRef.current = false;
      setIsLoadingFollowing(false);
    }
  }

  const visiblePosts = useMemo(() => {
    if (activeCategory === "For You") return posts;
    if (activeCategory === "Following") {
      return posts.filter(
        (post) =>
          post.creatorId && followingCreatorIds.has(String(post.creatorId)),
      );
    }
    return posts.filter((post) => postMatchesTopic(post, activeCategory));
  }, [activeCategory, posts, followingCreatorIds]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadPosts();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
      feedRequestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    function handlePostDeleted(event) {
      const postId = String(event.detail?.postId || "");
      if (!postId) return;
      setPosts((current) =>
        current.filter(
          (post) =>
            String(post?._id || post?.id || post?.postId || "") !== postId,
        ),
      );
      setPagination((current) => ({
        ...current,
        totalPosts: Math.max(0, Number(current.totalPosts || 0) - 1),
      }));
    }
    window.addEventListener("spotli:post-deleted", handlePostDeleted);
    return () =>
      window.removeEventListener("spotli:post-deleted", handlePostDeleted);
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

    // Open the selected post through MainLayout on every screen size.
    // Pass the complete shuffled feed so the viewer starts at this exact post
    // and can continue scrolling through the surrounding posts.
    onOpenVideo?.(post, posts);
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
        <CategoryFilters
          activeCategory={activeCategory}
          onChange={handleCategoryChange}
        />

        {isLoading ? (
          <HomeFeedSkeleton label="Loading posts" />
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
        ) : activeCategory === "Following" && isLoadingFollowing ? (
          <HomeFeedSkeleton label="Loading posts from creators you follow" />
        ) : activeCategory === "Following" && followingError ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
            <p className="max-w-md text-sm text-gray-500">{followingError}</p>
            {followingError.startsWith("Sign in") && (
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="rounded-lg bg-[#FF2D4A] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Sign in
              </button>
            )}
          </div>
        ) : visiblePosts.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-2 text-center">
            <h2 className="text-base font-semibold text-gray-900">
              {activeCategory === "For You"
                ? "No posts yet"
                : activeCategory === "Following"
                  ? "No posts from followed creators yet"
                  : `No ${activeCategory} posts yet`}
            </h2>
            <p className="max-w-xs text-sm text-gray-500">
              {activeCategory === "For You"
                ? "Videos and photos shared by Spotli creators will appear here."
                : activeCategory === "Following"
                  ? followingLoaded && followingCreatorIds.size === 0
                    ? "Follow creators to see their posts here."
                    : "Posts from creators you follow will appear here."
                  : `Try another category, or load more posts to find content tagged ${activeCategory}.`}
            </p>
          </div>
        ) : (
          <PostGrid
            posts={visiblePosts}
            onOpenVideo={handleOpenPost}
            onOpenPhoto={handleOpenPost}
            onDeletePost={onDeletePost}
            currentUserId={currentUserId}
          />
        )}

        {!isLoading && !errorMessage && pagination.hasNextPage && (
          <div className="flex flex-col items-center gap-2 py-5">
            {loadMoreError && (
              <p className="text-sm text-red-600" role="alert">
                {loadMoreError}
              </p>
            )}
            <button
              type="button"
              disabled={isLoadingMore}
              onClick={() =>
                void loadPosts({
                  page: (pagination.page || 1) + 1,
                  append: true,
                })
              }
              className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
            >
              {isLoadingMore
                ? "Loading more..."
                : loadMoreError
                  ? "Try loading more again"
                  : "Load more posts"}
            </button>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

export default Home;
