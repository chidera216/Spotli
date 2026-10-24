import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Heart,
  Image as ImageIcon,
  MessageCircle,
  Play,
  UserRound,
  MapPin,
  Link as LinkIcon,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import MentionText from "../components/MentionText";
import BottomNav from "../components/BottomNav";
import { useAuth } from "../context/useAuth";

const API_ORIGIN = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/api\/?$/, "");

function getMediaUrl(url) {
  if (!url || typeof url !== "string") return "";

  const value = url.trim();
  if (!value) return "";

  if (/^(https?:\/\/|blob:|data:)/i.test(value)) return value;

  return `${API_ORIGIN}${value.startsWith("/") ? "" : "/"}${value}`;
}

function optimizeImage(url, width = 480) {
  if (
    !url ||
    typeof url !== "string" ||
    !url.includes("res.cloudinary.com") ||
    !url.includes("/upload/") ||
    url.includes("/video/upload/") ||
    /\/upload\/[a-z]{1,3}_[^/]+\//.test(url)
  ) {
    return url || "";
  }

  return url.replace("/upload/", `/upload/f_auto,q_auto,w_${width},c_limit/`);
}

function getVideoCoverUrl(post) {
  const explicit = [
    post?.customThumbnail,
    post?.thumbnailUrl,
    post?.thumbnail,
    post?.posterUrl,
    post?.poster,
    post?.previewImage,
    post?.coverImage,
  ]
    .map((value) => {
      if (typeof value === "string") return value.trim();
      if (value && typeof value === "object") {
        return value.url || value.secure_url || value.src || "";
      }
      return "";
    })
    .find(Boolean);

  if (explicit) return getMediaUrl(explicit);

  const rawVideo =
    post?.mediaUrl ||
    post?.videoUrl ||
    post?.video ||
    (typeof post?.media === "string" ? post.media : "");
  const videoUrl =
    typeof rawVideo === "string"
      ? rawVideo
      : rawVideo?.url || rawVideo?.secure_url || "";
  const marker = "/video/upload/";
  const index = videoUrl.indexOf(marker);

  if (index < 0) return "";

  const assetPath = videoUrl.slice(index + marker.length).split("?")[0];
  const withoutExtension = assetPath.replace(
    /\.(mp4|mov|m4v|webm|avi|mkv)$/i,
    "",
  );

  return `${videoUrl.slice(0, index + marker.length)}so_0,w_240,c_limit,q_auto,f_jpg/${withoutExtension}.jpg`;
}

function getName(user) {
  return (
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    user?.name ||
    "Spotli creator"
  );
}

function initials(name) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "S"
  );
}

function count(value) {
  const number = Number(value) || 0;

  if (number >= 1_000_000) {
    return `${(number / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }

  if (number >= 1_000) {
    return `${(number / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }

  return String(number);
}

function isPhoto(post) {
  return (
    post.mediaType === "photo" ||
    post.mediaType === "image" ||
    post.type === "photo" ||
    post.type === "image"
  );
}

function getMediaValue(value) {
  if (typeof value === "string") return value.trim();

  if (value && typeof value === "object") {
    return value.url || value.src || value.path || value.secure_url || "";
  }

  return "";
}

function getCustomThumbnail(post) {
  const explicit = getMediaValue(
    post.thumbnailUrl ||
      post.customThumbnail ||
      post.thumbnail ||
      post.posterUrl,
  );
  return explicit ? getMediaUrl(explicit) : getVideoCoverUrl(post);
}

function getVideoUrl(post) {
  const values = [
    post.mediaUrl,
    ...(Array.isArray(post.mediaUrls) ? post.mediaUrls : []),
    post.videoUrl,
  ];

  for (const value of values) {
    const url = getMediaUrl(getMediaValue(value));
    if (url) return url;
  }

  return "";
}

function getPhotoUrl(post) {
  const values = [
    ...(Array.isArray(post.mediaUrls) ? post.mediaUrls : []),
    post.mediaUrl,
  ];

  for (const value of values) {
    const url = getMediaUrl(getMediaValue(value));
    if (url) return url;
  }

  return "";
}

/**
 * Captures a frame from the video when a custom thumbnail
 * has not been provided.
 */
function PostMedia({ post, photo, index = 99 }) {
  const customThumbnail = useMemo(() => getCustomThumbnail(post), [post]);

  const photoUrl = useMemo(() => getPhotoUrl(post), [post]);

  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    setThumbnailFailed(false);
    setPhotoFailed(false);
  }, [post._id, post.id, customThumbnail, photoUrl]);

  let mediaContent;

  if (photo) {
    mediaContent =
      photoUrl && !photoFailed ? (
        <img
          src={optimizeImage(photoUrl, 480)}
          alt={post.caption || "Photo post"}
          loading={index < 4 ? "eager" : "lazy"}
          fetchPriority={index < 4 ? "high" : "auto"}
          decoding="async"
          onError={() => setPhotoFailed(true)}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-gray-400">
          <ImageIcon size={32} />
        </span>
      );
  } else if (customThumbnail && !thumbnailFailed) {
    mediaContent = (
      <img
        src={optimizeImage(customThumbnail, 480)}
        alt={post.caption || "Video thumbnail"}
        loading={index < 4 ? "eager" : "lazy"}
        fetchPriority={index < 4 ? "high" : "auto"}
        decoding="async"
        onError={() => setThumbnailFailed(true)}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
      />
    );
  } else {
    mediaContent = (
      <span className="flex h-full w-full items-center justify-center text-gray-400">
        <Play size={32} />
      </span>
    );
  }

  return (
    <>
      {mediaContent}

      {!photo && (
        <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/65 px-2 py-1 text-[11px] font-medium text-white">
          <Play size={12} fill="currentColor" />
          Video
        </span>
      )}
    </>
  );
}

function FollowListModal({
  title,
  users,
  loading,
  loadingMore,
  hasMore,
  error,
  onClose,
  onLoadMore,
  onSelect,
}) {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 px-3 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[min(80vh,620px)] w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <h2 className="text-base font-bold text-neutral-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close list"
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[calc(min(80vh,620px)-68px)] overflow-y-auto p-2">
          {loading && users.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-neutral-600">
              Loading people...
            </p>
          ) : error && users.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-red-600">
              {error}
            </p>
          ) : users.length ? (
            <>
              {users.map((person) => {
                const name = getName(person);
                const personAvatar = getMediaUrl(person.avatar);
                return (
                  <button
                    key={person._id || person.id}
                    type="button"
                    onClick={() => onSelect(person)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-neutral-50"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-neutral-100 text-sm font-semibold text-neutral-700">
                      {personAvatar ? (
                        <img
                          src={personAvatar}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        initials(name)
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-neutral-900">
                        {name}
                      </span>
                      <span className="block truncate text-xs text-neutral-500">
                        @
                        {person.username ||
                          person.email?.split("@")[0] ||
                          "creator"}
                      </span>
                    </span>
                  </button>
                );
              })}
              {error && (
                <p className="px-3 py-2 text-center text-xs text-red-600">
                  {error}
                </p>
              )}
              {hasMore && (
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={onLoadMore}
                  className="mx-auto my-2 block rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              )}
            </>
          ) : (
            <p className="px-3 py-8 text-center text-sm text-neutral-600">
              No people to show yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

export default function PublicProfile({ userId, onOpenVideo, onOpenPhoto }) {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();

  const [creator, setCreator] = useState(null);
  const [posts, setPosts] = useState([]);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [isLoadingMorePosts, setIsLoadingMorePosts] = useState(false);
  const pageRef = useRef(1);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(false);
  const postsSentinelRef = useRef(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isRequested, setIsRequested] = useState(false);
  const [activeTab, setActiveTab] = useState("All Posts");
  const [isLoading, setIsLoading] = useState(true);
  const [isPostsLoading, setIsPostsLoading] = useState(true);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [error, setError] = useState("");
  const [followListType, setFollowListType] = useState("");
  const [followListUsers, setFollowListUsers] = useState([]);
  const [followListLoading, setFollowListLoading] = useState(false);
  const [followListLoadingMore, setFollowListLoadingMore] = useState(false);
  const [followListHasMore, setFollowListHasMore] = useState(false);
  const [followListPage, setFollowListPage] = useState(1);
  const [followListError, setFollowListError] = useState("");

  const isOwnProfile =
    String(currentUser?._id || currentUser?.id || "") === String(userId);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setIsLoading(true);
      setIsPostsLoading(true);
      setError("");
      setCreator(null);
      setPosts([]);

      try {
        const profileAndStatsPromise = Promise.all([
          api.users.getProfile(userId),
          api.users.getFollowStats(userId),
        ]);
        const postsPromise = api.users
          .getCreatorPosts(userId, 1, 12)
          .catch((postsError) => {
            if (
              postsError.status === 403 ||
              postsError.code === "PRIVATE_ACCOUNT"
            ) {
              return { posts: [] };
            }
            throw postsError;
          });

        const [profileResult, statsResult] = await profileAndStatsPromise;
        if (!active) return;

        setCreator(profileResult.user || null);
        setFollowersCount(Number(statsResult.followersCount) || 0);
        setFollowingCount(Number(statsResult.followingCount) || 0);
        setIsFollowing(Boolean(statsResult.isFollowing));
        setIsRequested(Boolean(statsResult.isRequested));
        setIsLoading(false);

        const postsResult = await postsPromise;
        if (!active) return;
        const initialPosts = Array.isArray(postsResult.posts)
          ? postsResult.posts
          : [];
        setPosts(initialPosts);
        pageRef.current = 1;
        hasMoreRef.current = Boolean(postsResult.pagination?.hasNextPage);
        setHasMorePosts(hasMoreRef.current);
        setIsPostsLoading(false);
      } catch (loadError) {
        if (active) {
          setError(
            loadError.message || "Unable to load this creator's profile.",
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
          setIsPostsLoading(false);
        }
      }
    }

    if (userId) {
      void loadProfile();
    } else {
      setError("Creator not found.");
      setIsLoading(false);
    }

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    const element = postsSentinelRef.current;
    if (!element || !hasMorePosts || isLoading || isLoadingMorePosts) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (
          !entry.isIntersecting ||
          loadingMoreRef.current ||
          !hasMoreRef.current
        ) {
          return;
        }

        loadingMoreRef.current = true;
        setIsLoadingMorePosts(true);
        const nextPage = pageRef.current + 1;

        try {
          const result = await api.users.getCreatorPosts(userId, nextPage, 12);
          if (!Array.isArray(result.posts)) {
            throw new Error("The server returned an invalid posts response.");
          }

          setPosts((current) => {
            const existingIds = new Set(
              current.map((post) => String(post._id || post.id)),
            );
            return [
              ...current,
              ...result.posts.filter(
                (post) => !existingIds.has(String(post._id || post.id)),
              ),
            ];
          });
          pageRef.current = nextPage;
          hasMoreRef.current = Boolean(result.pagination?.hasNextPage);
          setHasMorePosts(hasMoreRef.current);
        } catch (loadMoreError) {
          console.error(
            "Unable to load more creator posts:",
            loadMoreError.message,
          );
        } finally {
          loadingMoreRef.current = false;
          setIsLoadingMorePosts(false);
        }
      },
      { rootMargin: "600px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMorePosts, isLoading, isLoadingMorePosts, userId]);

  async function openFollowList(type) {
    setFollowListType(type);
    setFollowListUsers([]);
    setFollowListError("");
    setFollowListPage(1);
    setFollowListHasMore(false);
    setFollowListLoading(true);

    try {
      const result = await api.users.getFollowList(userId, type, 1, 20);
      const users = Array.isArray(result?.users) ? result.users : [];
      setFollowListUsers(users);
      setFollowListHasMore(users.length === 20);
    } catch (listError) {
      setFollowListError(listError.message || "Unable to load this list.");
    } finally {
      setFollowListLoading(false);
    }
  }

  async function loadMoreFollowList() {
    if (followListLoadingMore || !followListHasMore || !followListType) return;

    const nextPage = followListPage + 1;
    setFollowListLoadingMore(true);
    setFollowListError("");

    try {
      const result = await api.users.getFollowList(
        userId,
        followListType,
        nextPage,
        20,
      );
      const users = Array.isArray(result?.users) ? result.users : [];
      setFollowListUsers((current) => {
        const seen = new Set(
          current.map((person) => String(person?._id || person?.id || "")),
        );
        return [
          ...current,
          ...users.filter(
            (person) => !seen.has(String(person?._id || person?.id || "")),
          ),
        ];
      });
      setFollowListPage(nextPage);
      setFollowListHasMore(users.length === 20);
    } catch (listError) {
      setFollowListError(listError.message || "Unable to load more people.");
    } finally {
      setFollowListLoadingMore(false);
    }
  }

  const visiblePosts = useMemo(() => {
    if (activeTab === "Videos") {
      return posts.filter((post) => !isPhoto(post));
    }

    if (activeTab === "Photos") {
      return posts.filter(isPhoto);
    }

    return posts;
  }, [activeTab, posts]);

  async function handleFollowToggle() {
    if (isFollowLoading || !creator) return;

    setIsFollowLoading(true);
    setError("");

    try {
      const result =
        isFollowing || isRequested
          ? await api.users.unfollow(userId)
          : await api.users.follow(userId);

      setIsFollowing(Boolean(result.isFollowing));
      setIsRequested(Boolean(result.isRequested));
      setFollowersCount(Number(result.followersCount) || 0);
      setFollowingCount(Number(result.followingCount) || 0);
    } catch (followError) {
      setError(followError.message || "Unable to update follow status.");
    } finally {
      setIsFollowLoading(false);
    }
  }

  const fullName = getName(creator);
  const avatar = getMediaUrl(creator?.avatar);
  const photoCount = posts.filter(isPhoto).length;
  const videoCount = posts.length - photoCount;

  return (
    <div className="min-h-screen bg-white font-sans text-[#111111] md:ml-40">
      <main className="mx-auto min-h-screen w-full max-w-[1720px] px-2.5 pb-24 pt-3 sm:px-3 sm:pb-8 lg:px-6 lg:pt-5 xl:px-8">
        {isLoading ? (
          <div
            className="animate-pulse px-1 py-3 sm:px-2 sm:py-4 lg:py-5"
            role="status"
            aria-label="Loading profile"
          >
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6 lg:gap-10">
              <div className="mx-auto h-24 w-24 shrink-0 rounded-full bg-neutral-200 sm:mx-0 sm:h-28 sm:w-28 lg:h-44 lg:w-44" />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="mx-auto h-7 w-48 rounded-full bg-neutral-200 sm:mx-0" />
                <div className="mx-auto h-4 w-32 rounded-full bg-neutral-100 sm:mx-0" />
                <div className="mx-auto h-4 max-w-xl rounded-full bg-neutral-100 sm:mx-0" />
                <div className="mx-auto h-4 w-3/4 max-w-md rounded-full bg-neutral-100 sm:mx-0" />
                <div className="mt-5 grid grid-cols-3 gap-3 sm:max-w-[520px]">
                  {Array.from({ length: 3 }, (_, index) => (
                    <div
                      key={index}
                      className="h-14 rounded-xl bg-neutral-100"
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 6 }, (_, index) => (
                <div
                  key={index}
                  className="aspect-video rounded-xl bg-neutral-100"
                />
              ))}
            </div>
          </div>
        ) : error && !creator ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-red-600">{error}</p>

            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white"
            >
              Go back
            </button>
          </div>
        ) : creator ? (
          <>
            <section className="px-1 py-3 sm:px-2 sm:py-4 lg:py-5">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6 lg:gap-10">
                <div className="mx-auto h-24 w-24 shrink-0 overflow-hidden rounded-full bg-neutral-100 sm:mx-0 sm:h-28 sm:w-28 lg:h-44 lg:w-44">
                  {avatar ? (
                    <img
                      src={avatar}
                      alt={`${fullName}'s profile`}
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-3xl font-bold text-neutral-600">
                      {initials(fullName)}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <h1 className="flex flex-wrap items-center justify-center gap-2 text-2xl font-bold tracking-tight text-black sm:justify-start sm:text-3xl lg:text-[36px]">
                    {fullName}
                  </h1>

                  <p className="mt-1 text-sm text-neutral-500 sm:text-base">
                    @
                    {creator.username ||
                      creator.email?.split("@")[0] ||
                      "creator"}
                  </p>

                  {creator.bio?.trim() && (
                    <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-700 sm:text-[15px]">
                      {creator.bio}
                    </p>
                  )}

                  {(creator.location || creator.website) && (
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-neutral-600 sm:justify-start">
                      {creator.location && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin size={15} /> {creator.location}
                        </span>
                      )}
                      {creator.website && (
                        <a
                          href={
                            /^https?:\/\//i.test(creator.website)
                              ? creator.website
                              : `https://${creator.website}`
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 underline decoration-neutral-300 underline-offset-2 hover:text-black"
                        >
                          <LinkIcon size={15} />
                          {creator.website
                            .replace(/^https?:\/\//i, "")
                            .replace(/\/$/, "")}
                        </a>
                      )}
                    </div>
                  )}

                  <div className="mt-5 grid grid-cols-3 divide-x divide-neutral-200 sm:max-w-[520px]">
                    <div className="px-2 text-center sm:px-5 sm:text-left">
                      <p className="text-xl font-bold tracking-tight text-black sm:text-2xl">
                        {count(posts.length)}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500 sm:text-sm">
                        Posts
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => openFollowList("followers")}
                      className="rounded-lg px-2 text-center transition hover:bg-neutral-50 sm:px-5 sm:text-left"
                    >
                      <p className="text-xl font-bold tracking-tight text-black sm:text-2xl">
                        {count(followersCount)}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500 sm:text-sm">
                        Followers
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => openFollowList("following")}
                      className="rounded-lg px-2 text-center transition hover:bg-neutral-50 sm:px-5 sm:text-left"
                    >
                      <p className="text-xl font-bold tracking-tight text-black sm:text-2xl">
                        {count(followingCount)}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500 sm:text-sm">
                        Following
                      </p>
                    </button>
                  </div>
                </div>

                <div className="flex justify-center sm:ml-auto sm:pt-1">
                  {isOwnProfile ? (
                    <button
                      type="button"
                      onClick={() => navigate("/profile")}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-neutral-200 bg-white px-6 text-sm font-semibold text-black transition hover:bg-neutral-50"
                    >
                      <UserRound size={16} />
                      Edit Profile
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isFollowLoading}
                      onClick={handleFollowToggle}
                      className={`inline-flex h-10 min-w-28 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-60 ${
                        isFollowing || isRequested
                          ? "border border-neutral-200 bg-white text-black hover:bg-neutral-50"
                          : "bg-[#FF2D4A] text-white hover:brightness-95"
                      }`}
                    >
                      {isFollowLoading
                        ? "Please wait..."
                        : isFollowing
                          ? "Following"
                          : isRequested
                            ? "Requested"
                            : "Follow"}
                    </button>
                  )}
                </div>
              </div>
            </section>

            {error && (
              <p
                role="alert"
                className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </p>
            )}

            {creator?.isPrivate && !isOwnProfile && !isFollowing && (
              <div className="my-5 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-5 text-center">
                <h2 className="text-base font-semibold text-neutral-900">
                  This account is private
                </h2>
                <p className="mt-1 text-sm text-neutral-600">
                  Follow this creator to request access to their posts.
                </p>
              </div>
            )}

            <section className="mt-4">
              <div className="inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-full bg-[#F0F0F0] p-1">
                {["All Posts", "Videos", "Photos"].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition duration-300 ${
                      activeTab === tab
                        ? "bg-black text-white shadow-sm"
                        : "text-neutral-600 hover:bg-white hover:text-black"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {isPostsLoading ? (
                <div
                  className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 xl:gap-4"
                  role="status"
                  aria-label="Loading posts"
                >
                  {Array.from({ length: 6 }, (_, index) => (
                    <div
                      key={index}
                      className="aspect-video animate-pulse rounded-xl bg-neutral-100 sm:rounded-2xl"
                    />
                  ))}
                </div>
              ) : visiblePosts.length ? (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 xl:gap-4">
                    {visiblePosts.map((post, index) => {
                      const photo = isPhoto(post);

                      const openPost = () =>
                        (photo ? onOpenPhoto : onOpenVideo)?.(
                          post,
                          visiblePosts,
                        );

                      return (
                        <article key={post._id || post.id} className="min-w-0">
                          <button
                            type="button"
                            onClick={openPost}
                            aria-label={`Open post: ${post.caption || "Spotli post"}`}
                            className="group relative block aspect-video w-full overflow-hidden rounded-xl bg-stone-100 text-left shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-transform duration-300 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black sm:rounded-2xl lg:rounded-[20px]"
                          >
                            <PostMedia
                              post={post}
                              photo={photo}
                              index={index}
                            />
                          </button>

                          <p
                            className="mt-2 min-h-5 truncate px-0.5 text-xs text-stone-800"
                            title={post.caption || ""}
                          >
                            <MentionText
                              text={post.caption || "No caption"}
                              mentions={post.mentions}
                            />
                          </p>

                          <div className="mt-1.5 flex items-center gap-4 px-0.5 text-xs text-stone-500">
                            <span className="inline-flex items-center gap-1.5">
                              <Heart size={16} fill="#FF2D4A" color="#FF2D4A" />
                              {count(post.likesCount ?? post.likes)}
                            </span>

                            <span className="inline-flex items-center gap-1.5">
                              <MessageCircle size={16} />
                              {count(post.commentsCount ?? post.comments)}
                            </span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  {hasMorePosts && (
                    <div
                      ref={postsSentinelRef}
                      className="h-px"
                      aria-hidden="true"
                    />
                  )}
                  {isLoadingMorePosts && (
                    <div className="h-4" aria-hidden="true" />
                  )}
                </>
              ) : (
                <div className="mt-4 flex min-h-64 flex-col items-center justify-center px-5 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-neutral-100 text-neutral-800">
                    <ImageIcon size={25} />
                  </div>

                  <h2 className="mt-4 text-base font-semibold">
                    {activeTab === "All Posts"
                      ? "No posts yet"
                      : `No ${activeTab.toLowerCase()} yet`}
                  </h2>

                  <p className="mt-1 max-w-xs text-sm leading-5 text-neutral-500">
                    This creator's published photos and videos will appear here.
                  </p>
                </div>
              )}

              <span className="sr-only">
                {videoCount} videos and {photoCount} photos
              </span>
            </section>
          </>
        ) : null}
      </main>

      {followListType && (
        <FollowListModal
          title={followListType === "followers" ? "Followers" : "Following"}
          users={followListUsers}
          loading={followListLoading}
          loadingMore={followListLoadingMore}
          hasMore={followListHasMore}
          error={followListError}
          onClose={() => setFollowListType("")}
          onLoadMore={loadMoreFollowList}
          onSelect={(person) => {
            setFollowListType("");
            navigate(`/profile/${person._id || person.id}`);
          }}
        />
      )}

      <BottomNav />
    </div>
  );
}
