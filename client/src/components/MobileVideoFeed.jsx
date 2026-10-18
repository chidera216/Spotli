import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Search,
  Heart,
  MessageCircleMore,
  Forward,
  MoreVertical,
  BadgeCheck,
  Music2,
  ChevronDown,
  Play,
  Pause,
} from "lucide-react";
import api from "../services/api";
import CommentSection from "./comments/CommentSection";

const BRAND = "#FF2D4A";
const CHIPS = ["For you", "Following", "ESUT", "Tech", "Travel"];
const hideScrollbar = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
const tap = "transition-transform active:scale-95";
const textShadow = "[text-shadow:0_1px_3px_rgba(0,0,0,0.8)]";

const API_ORIGIN = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/api\/?$/, "");

function photo(id, width = 900) {
  if (typeof id !== "string" || !id.trim()) return "";
  if (/^https?:\/\//i.test(id)) return id;
  if (id.startsWith("/")) return `${API_ORIGIN}${id}`;
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`;
}

function isPhotoPost(post) {
  return (
    post.type === "photo" ||
    post.type === "image" ||
    post.mediaType === "photo" ||
    post.mediaType === "image" ||
    post.isImagePost === true
  );
}

function toMobilePost(post = {}) {
  const creatorName =
    typeof post.creator === "string"
      ? post.creator
      : post.creator?.name ||
        [post.creator?.firstName, post.creator?.lastName]
          .filter(Boolean)
          .join(" ") ||
        post.creatorName ||
        "Spotli creator";
  const originalMedia = post.media || {};
  const isPhoto = isPhotoPost(post);
  const rawImages = [
    ...(Array.isArray(post.images) ? post.images : []),
    ...(Array.isArray(post.mediaUrls) ? post.mediaUrls : []),
    post.image,
    post.thumbnailUrl,
    post.poster,
    isPhoto ? post.mediaUrl : "",
  ];
  const images = [
    ...new Set(
      rawImages
        .filter((image) => typeof image === "string" && image.trim())
        .map((image) => photo(image, 1200)),
    ),
  ];
  const firstImage = images[0] || "";

  return {
    ...post,
    id: String(post.id || post._id || ""),
    type: isPhoto ? "photo" : "video",
    mediaType: isPhoto ? "photo" : "video",
    creator: {
      name: creatorName,
      avatar: photo(
        post.creator?.avatar || post.creatorAvatar || post.avatar || "",
        200,
      ),
      verified: Boolean(post.creator?.verified || post.verified),
    },
    age: post.age || post.time || "Recently",
    title: post.title || post.caption || "Untitled post",
    caption: post.caption || post.title || "",
    sound: post.sound || "",
    likes: post.likes ?? post.likesCount ?? 0,
    comments: post.comments ?? post.commentsCount ?? 0,
    shares: post.shares ?? post.sharesCount ?? 0,
    media: {
      ...originalMedia,
      src: isPhoto
        ? ""
        : originalMedia.src ||
          post.mediaUrl ||
          post.videoUrl ||
          post.video ||
          "",
      poster: photo(
        originalMedia.poster ||
          post.poster ||
          post.thumbnailUrl ||
          post.image ||
          firstImage,
        1200,
      ),
    },
    images,
  };
}

function numericCount(value) {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "number" && Number.isFinite(value))
    return Math.max(0, value);
  const parsed = Number(String(value ?? "0").replace(/,/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function displayCount(value) {
  const count = numericCount(value);
  if (count >= 1_000_000)
    return `${(count / 1_000_000).toFixed(count >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (count >= 1_000)
    return `${(count / 1_000).toFixed(count >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(count);
}

function getCommentList(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.comments)) return result.comments;
  if (Array.isArray(result?.data?.comments)) return result.data.comments;
  if (Array.isArray(result?.data)) return result.data;
  return [];
}

function getCreatedComment(result) {
  return result?.comment || result?.data?.comment || result?.data || null;
}

function Avatar({ name = "", src, className = "" }) {
  return (
    <div
      className={`shrink-0 overflow-hidden rounded-full bg-neutral-600 ${className}`}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          draggable={false}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <span className="grid h-full w-full place-items-center font-semibold text-white">
          {name.charAt(0)}
        </span>
      )}
    </div>
  );
}

function TopBar({ activeChip, onChip, onBack }) {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-black/80 via-black/45 to-transparent pb-4 pt-[env(safe-area-inset-top)]">
      <div className="pointer-events-auto flex h-12 items-center justify-between px-3">
        <button
          type="button"
          aria-label="Back to homepage"
          onClick={onBack}
          className={`grid h-11 w-11 place-items-center rounded-full text-white ${tap}`}
        >
          <ArrowLeft size={26} />
        </button>
        <button
          type="button"
          aria-label="Search"
          className={`grid h-11 w-11 place-items-center text-white ${tap}`}
        >
          <Search size={24} />
        </button>
      </div>
      <div
        className={`pointer-events-auto mt-2 flex items-center gap-2 overflow-x-auto px-4 ${hideScrollbar}`}
      >
        {CHIPS.map((chip) => {
          const selected = activeChip === chip;
          return (
            <button
              key={chip}
              type="button"
              aria-pressed={selected}
              onClick={() => onChip(chip)}
              className={`h-8 shrink-0 rounded-full px-[14px] text-[13px] font-medium ${selected ? "bg-white text-black" : "border border-white/50 bg-black/20 text-white backdrop-blur-sm"} ${tap}`}
            >
              {chip}
            </button>
          );
        })}
        <button
          type="button"
          aria-label="More categories"
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/50 bg-black/20 text-white backdrop-blur-sm ${tap}`}
        >
          <ChevronDown size={16} />
        </button>
      </div>
    </header>
  );
}

function ActionButton({ label, children, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      className={`relative z-50 flex min-h-10 min-w-10 touch-manipulation flex-col items-center justify-center gap-1 text-white drop-shadow-md ${tap}`}
    >
      {children}
    </button>
  );
}

function ActionRail({
  post,
  liked,
  likeCount,
  commentCount,
  onLike,
  onComments,
}) {
  return (
    <aside className="absolute right-3 top-[66%] z-40 flex -translate-y-1/2 flex-col items-center gap-2.5 text-white drop-shadow-[0_2px_5px_rgba(0,0,0,0.98)]">
      <ActionButton
        label={liked ? "Unlike post" : "Like post"}
        onClick={onLike}
      >
        <Heart
          size={28}
          strokeWidth={2.5}
          fill={liked ? BRAND : "white"}
          color={liked ? BRAND : "white"}
        />
        <span className="text-[13px] font-semibold leading-none">
          {displayCount(likeCount)}
        </span>
      </ActionButton>
      <ActionButton label="Comments" onClick={onComments}>
        <MessageCircleMore
          size={28}
          strokeWidth={2.5}
          fill="white"
          color="white"
        />
        <span className="text-[13px] font-semibold leading-none">
          {displayCount(commentCount)}
        </span>
      </ActionButton>
      <ActionButton label="Share post">
        <Forward size={28} strokeWidth={2.5} fill="white" color="white" />
        <span className="text-[13px] font-semibold leading-none">
          {displayCount(post.shares)}
        </span>
      </ActionButton>
      <ActionButton label="More options">
        <MoreVertical size={24} strokeWidth={2.5} />
      </ActionButton>
    </aside>
  );
}

function PostInfo({ post, visible }) {
  return (
    <div
      className={`pointer-events-none absolute bottom-5 left-4 right-[84px] z-20 text-white ${textShadow} transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Avatar
          name={post.creator.name}
          src={post.creator.avatar}
          className="h-9 w-9"
        />
        <span className="truncate text-[15px] font-semibold">
          {post.creator.name}
        </span>
        {post.creator.verified && (
          <BadgeCheck
            size={16}
            fill="#3B82F6"
            color="#3B82F6"
            className="shrink-0"
          />
        )}
        <span className="shrink-0 text-[13px] text-white/70">{post.age}</span>
      </div>
      <h2 className="mt-2 text-[17px] font-bold leading-snug">{post.title}</h2>
      <p className="mt-1 line-clamp-3 text-[14px] leading-snug text-white/90">
        {post.caption}
      </p>
      {post.type !== "photo" && post.sound && (
        <div className="mt-2 flex min-w-0 items-center gap-2 text-[13px]">
          <Music2 size={16} className="shrink-0" />
          <span className="truncate">{post.sound}</span>
        </div>
      )}
    </div>
  );
}

function Slide({
  post,
  liked,
  likeCount,
  commentCount,
  onLike,
  onComments,
  isActive,
}) {
  const isPhoto = isPhotoPost(post);
  const images = isPhoto ? post.images || [] : [];
  const media = post.media || {};
  const videoRef = useRef(null);
  const lastTapRef = useRef(0);
  const tapTimerRef = useRef(null);
  const indicatorTimerRef = useRef(null);
  const heartTimerRef = useRef(null);
  const infoTimerRef = useRef(null);
  const [showPostInfo, setShowPostInfo] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showPlaybackIcon, setShowPlaybackIcon] = useState(false);
  const [showHeart, setShowHeart] = useState(false);

  useEffect(
    () => () => {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (indicatorTimerRef.current) clearTimeout(indicatorTimerRef.current);
      if (heartTimerRef.current) clearTimeout(heartTimerRef.current);
      if (infoTimerRef.current) clearTimeout(infoTimerRef.current);
    },
    [],
  );

  const revealPostInfo = useCallback(() => {
    setShowPostInfo(true);
    if (infoTimerRef.current) clearTimeout(infoTimerRef.current);
    infoTimerRef.current = setTimeout(() => setShowPostInfo(false), 5000);
  }, []);

  useEffect(() => {
    if (isActive) revealPostInfo();
  }, [isActive, revealPostInfo]);

  function showPlaybackIndicator() {
    setShowPlaybackIcon(true);
    if (indicatorTimerRef.current) clearTimeout(indicatorTimerRef.current);
    indicatorTimerRef.current = setTimeout(
      () => setShowPlaybackIcon(false),
      750,
    );
  }

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          setPaused(true);
          showPlaybackIndicator();
        });
      }
      setPaused(false);
    } else {
      video.pause();
      setPaused(true);
    }
    showPlaybackIndicator();
  }

  function likePost() {
    onLike(post);
    setShowHeart(true);
    if (heartTimerRef.current) clearTimeout(heartTimerRef.current);
    heartTimerRef.current = setTimeout(() => setShowHeart(false), 750);
  }

  function handleMediaTap() {
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < 280;
    if (isDoubleTap) {
      lastTapRef.current = 0;
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      likePost();
      return;
    }
    lastTapRef.current = now;
    tapTimerRef.current = setTimeout(() => {
      tapTimerRef.current = null;
      if (!isPhoto) togglePlayback();
    }, 280);
  }

  function handleImageScroll(event) {
    const track = event.currentTarget;
    if (!track.clientWidth) return;
    const nextIndex = Math.round(track.scrollLeft / track.clientWidth);
    setActiveImage(Math.max(0, Math.min(nextIndex, images.length - 1)));
  }

  function handleVideoMetadata(event) {
    const video = event.currentTarget;
    if (!video.videoWidth || !video.videoHeight) return;

    const ratio = video.videoWidth / video.videoHeight;
    const isWidescreen = ratio >= 1.7 && ratio <= 1.85;
    const isPortrait = ratio >= 0.52 && ratio <= 0.62;

    // Portrait 9:16 videos fill the mobile viewer; landscape videos stay uncropped.
    // A portrait video may crop slightly on screens whose aspect ratio differs from 9:16.
    video.classList.toggle("object-cover", isPortrait);
    video.classList.toggle("object-contain", !isPortrait);
    video.dataset.aspectRatio = isWidescreen
      ? "16:9"
      : isPortrait
        ? "9:16"
        : "other";
  }

  return (
    <section
      className="relative h-full snap-start overflow-hidden bg-black"
      onTouchStart={revealPostInfo}
      onWheel={revealPostInfo}
    >
      <div
        className="absolute inset-0 bg-black"
        onClick={isPhoto ? handleMediaTap : undefined}
        onPointerDown={revealPostInfo}
      >
        {isPhoto && images.length > 0 ? (
          <div
            onScroll={handleImageScroll}
            className={`flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden touch-pan-x ${hideScrollbar}`}
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {images.map((image, index) => (
              <div
                key={`${post.id}-${index}`}
                className="h-full w-full min-w-full shrink-0 snap-start overflow-hidden"
              >
                <img
                  src={image}
                  alt={`${post.title} — image ${index + 1}`}
                  draggable={false}
                  loading={index === 0 ? "eager" : "lazy"}
                  className="h-full w-full select-none object-contain"
                />
              </div>
            ))}
          </div>
        ) : !isPhoto && media.src ? (
          <video
            ref={videoRef}
            src={media.src}
            poster={media.poster}
            autoPlay
            muted
            loop
            playsInline
            controls
            onClick={(event) => event.stopPropagation()}
            onPointerDown={revealPostInfo}
            onLoadedMetadata={handleVideoMetadata}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
            className="relative z-[2] h-full w-full object-contain bg-black"
            style={{ maxWidth: "100%", maxHeight: "100%" }}
          />
        ) : isPhoto && media.poster ? (
          <img
            src={media.poster}
            alt={post.title}
            draggable={false}
            className="h-full w-full object-contain"
          />
        ) : !isPhoto && media.poster ? (
          <img
            src={media.poster}
            alt={post.title}
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center px-6 text-center text-white/70">
            Preview unavailable
          </div>
        )}
      </div>
      {!isPhoto && showPlaybackIcon && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center">
          <span className="grid h-[76px] w-[76px] place-items-center rounded-full bg-black/55 text-white shadow-lg">
            {paused ? (
              <Pause size={36} fill="white" />
            ) : (
              <Play size={36} fill="white" className="ml-1" />
            )}
          </span>
        </div>
      )}
      {showHeart && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center">
          <Heart
            size={104}
            strokeWidth={1.5}
            fill={BRAND}
            color={BRAND}
            className="animate-ping"
          />
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-[44px] z-[1] h-[45%] bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
      {isPhoto && images.length > 1 && (
        <>
          <span className="absolute right-3 top-36 z-20 rounded-full bg-black/50 px-3 py-1 text-[12px] font-semibold text-white">
            {activeImage + 1}/{images.length}
          </span>
          <div className="pointer-events-none absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 gap-2">
            {images.map((_, index) => (
              <span
                key={index}
                className={`h-[6px] w-[6px] rounded-full ${index === activeImage ? "bg-white" : "bg-white/40"}`}
              />
            ))}
          </div>
        </>
      )}
      <ActionRail
        post={post}
        liked={liked}
        likeCount={likeCount}
        commentCount={commentCount}
        onLike={() => onLike(post)}
        onComments={() => onComments(post)}
      />
      <PostInfo post={post} visible={showPostInfo} />
    </section>
  );
}

export default function MobileVideoFeed({ posts = [], initialPost, onBack }) {
  const [activeChip, setActiveChip] = useState("For you");
  const [activeSlideId, setActiveSlideId] = useState("");
  const [likedPosts, setLikedPosts] = useState({});
  const [likeCounts, setLikeCounts] = useState({});
  const [commentCounts, setCommentCounts] = useState({});
  const [commentsPost, setCommentsPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState("");
  const likedPostsRef = useRef({});
  const likeCountsRef = useRef({});
  const likeRequestsRef = useRef(new Set());
  const changedLikesRef = useRef(new Set());
  const commentRequestRef = useRef(0);

  const feedPosts = useMemo(() => posts.map(toMobilePost), [posts]);
  const selectedId = initialPost
    ? String(initialPost.id || initialPost._id || "")
    : "";
  const selectedPost = selectedId
    ? feedPosts.find((post) => String(post.id) === selectedId) ||
      toMobilePost(initialPost)
    : feedPosts[0];
  const orderedPosts = selectedPost
    ? [
        selectedPost,
        ...feedPosts.filter(
          (post) => String(post.id) !== String(selectedPost.id),
        ),
      ]
    : feedPosts;

  useEffect(() => {
    const nextCounts = {};
    for (const post of orderedPosts)
      nextCounts[post.id] = numericCount(post.likes);
    likeCountsRef.current = { ...likeCountsRef.current, ...nextCounts };
    setLikeCounts((current) => ({ ...nextCounts, ...current }));
    setCommentCounts((current) => {
      const next = { ...current };
      for (const post of orderedPosts) {
        if (next[post.id] === undefined)
          next[post.id] = numericCount(post.comments);
      }
      return next;
    });
  }, [posts, initialPost]);

  useEffect(() => {
    let cancelled = false;
    async function restoreLikes() {
      try {
        const result = await api.posts.getMyLikes();
        const ids = result?.postIds || result?.data?.postIds || [];
        if (cancelled || !Array.isArray(ids)) return;
        const restored = {};
        for (const id of ids)
          restored[String(typeof id === "object" ? id._id || id.id : id)] =
            true;
        for (const id of changedLikesRef.current)
          restored[id] = Boolean(likedPostsRef.current[id]);
        likedPostsRef.current = { ...likedPostsRef.current, ...restored };
        setLikedPosts((current) => ({ ...current, ...restored }));
      } catch (error) {
        // Keep the feed usable when the viewer is signed out or likes cannot load.
        console.warn("Could not restore liked posts:", error?.message || error);
      }
    }
    restoreLikes();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleLike = useCallback(async (post) => {
    const postId = String(post?.id || post?._id || "");
    if (!postId) return;

    // Update the UI immediately. If another tap arrives while the request is
    // running, the in-flight worker will send the latest desired state next.
    const currentLiked = Boolean(likedPostsRef.current[postId]);
    const nextLiked = !currentLiked;
    const currentCount =
      likeCountsRef.current[postId] ?? numericCount(post.likes);
    const nextCount = Math.max(0, currentCount + (nextLiked ? 1 : -1));

    likedPostsRef.current = { ...likedPostsRef.current, [postId]: nextLiked };
    likeCountsRef.current = { ...likeCountsRef.current, [postId]: nextCount };
    changedLikesRef.current.add(postId);
    setLikedPosts((current) => ({ ...current, [postId]: nextLiked }));
    setLikeCounts((current) => ({ ...current, [postId]: nextCount }));

    if (likeRequestsRef.current.has(postId)) return;
    likeRequestsRef.current.add(postId);

    let serverLiked = currentLiked;
    let lastServerCount;
    try {
      while (serverLiked !== Boolean(likedPostsRef.current[postId])) {
        const desiredLiked = Boolean(likedPostsRef.current[postId]);
        const result = desiredLiked
          ? await api.posts.like(postId)
          : await api.posts.unlike(postId);
        serverLiked =
          typeof result?.liked === "boolean" ? result.liked : desiredLiked;
        if (typeof result?.likesCount === "number")
          lastServerCount = result.likesCount;
      }

      // Reconcile with the backend only after all rapid taps have been applied.
      if (typeof lastServerCount === "number") {
        likeCountsRef.current = {
          ...likeCountsRef.current,
          [postId]: lastServerCount,
        };
        setLikeCounts((current) => ({ ...current, [postId]: lastServerCount }));
      }
      likedPostsRef.current = {
        ...likedPostsRef.current,
        [postId]: serverLiked,
      };
      setLikedPosts((current) => ({ ...current, [postId]: serverLiked }));
    } catch (error) {
      // Restore the last state confirmed by the backend and surface the failure.
      likedPostsRef.current = {
        ...likedPostsRef.current,
        [postId]: serverLiked,
      };
      setLikedPosts((current) => ({ ...current, [postId]: serverLiked }));
      if (typeof lastServerCount === "number") {
        likeCountsRef.current = {
          ...likeCountsRef.current,
          [postId]: lastServerCount,
        };
        setLikeCounts((current) => ({ ...current, [postId]: lastServerCount }));
      } else {
        const fallbackCount = Math.max(
          0,
          (likeCountsRef.current[postId] ?? currentCount) +
            (serverLiked === currentLiked ? 0 : serverLiked ? 1 : -1),
        );
        likeCountsRef.current = {
          ...likeCountsRef.current,
          [postId]: fallbackCount,
        };
        setLikeCounts((current) => ({ ...current, [postId]: fallbackCount }));
      }
      console.error("Could not update post like:", error?.message || error);
    } finally {
      likeRequestsRef.current.delete(postId);
    }
  }, []);

  const openComments = useCallback(async (post) => {
    const postId = String(post?.id || post?._id || "");
    if (!postId) return;
    const requestId = ++commentRequestRef.current;
    setCommentsPost(post);
    setComments([]);
    setCommentsError("");
    setCommentsLoading(true);
    try {
      const result = await api.posts.getComments(postId);
      if (requestId !== commentRequestRef.current) return;
      const loadedComments = getCommentList(result);
      setComments(loadedComments);
      const serverCount =
        result?.commentsCount ?? result?.count ?? result?.data?.commentsCount;
      if (typeof serverCount === "number")
        setCommentCounts((current) => ({ ...current, [postId]: serverCount }));
    } catch (error) {
      if (requestId !== commentRequestRef.current) return;
      setCommentsError(
        error?.message || "Could not load comments. Please try again.",
      );
    } finally {
      if (requestId === commentRequestRef.current) setCommentsLoading(false);
    }
  }, []);

  const handleFeedScroll = useCallback(
    (event) => {
      const feed = event.currentTarget;
      if (!feed.clientHeight) return;
      const index = Math.max(
        0,
        Math.min(
          orderedPosts.length - 1,
          Math.round(feed.scrollTop / feed.clientHeight),
        ),
      );
      const nextId = orderedPosts[index]?.id || "";
      setActiveSlideId((current) => (current === nextId ? current : nextId));
    },
    [orderedPosts],
  );

  const closeComments = useCallback(() => {
    commentRequestRef.current += 1;
    setCommentsPost(null);
    setCommentsLoading(false);
    setCommentsError("");
  }, []);

  const submitComment = useCallback(
    async (text) => {
      const postId = String(commentsPost?.id || commentsPost?._id || "");
      if (!postId)
        throw new Error(
          "Could not identify this post. Close comments and try again.",
        );
      const result = await api.posts.addComment(postId, text);
      const savedComment = getCreatedComment(result);
      if (savedComment && typeof savedComment === "object") {
        setComments((current) => {
          const savedId = String(savedComment._id || savedComment.id || "");
          if (
            savedId &&
            current.some(
              (item) => String(item._id || item.id || "") === savedId,
            )
          )
            return current;
          return [...current, savedComment];
        });
      }
      const serverCount =
        result?.commentsCount ??
        result?.post?.commentsCount ??
        result?.data?.commentsCount;
      setCommentCounts((current) => ({
        ...current,
        [postId]:
          typeof serverCount === "number"
            ? serverCount
            : (current[postId] || 0) + 1,
      }));
      return result;
    },
    [commentsPost],
  );

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-black text-white">
      <div className="relative min-h-0 flex-1">
        <TopBar
          activeChip={activeChip}
          onChip={setActiveChip}
          onBack={onBack}
        />
        <main
          onScroll={handleFeedScroll}
          className={`absolute inset-0 overflow-y-auto snap-y snap-mandatory overscroll-contain ${hideScrollbar}`}
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {orderedPosts.map((post, index) => (
            <div key={post.id} className="h-full">
              <Slide
                post={post}
                liked={Boolean(likedPosts[post.id])}
                likeCount={likeCounts[post.id] ?? numericCount(post.likes)}
                commentCount={
                  commentCounts[post.id] ?? numericCount(post.comments)
                }
                onLike={toggleLike}
                onComments={openComments}
                isActive={
                  activeSlideId ? activeSlideId === post.id : index === 0
                }
              />
            </div>
          ))}
          {orderedPosts.length === 0 && (
            <div className="grid h-full place-items-center px-6 text-center text-white/70">
              No posts available yet.
            </div>
          )}
        </main>
      </div>
      {commentsPost && (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            aria-label="Close comments"
            className="absolute inset-0 bg-black/55"
            onClick={closeComments}
          />
          <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[430px]">
            <CommentSection
              post={commentsPost}
              comments={comments}
              loading={commentsLoading}
              error={commentsError}
              onSubmit={submitComment}
              onClose={closeComments}
              variant="sheet"
            />
          </div>
        </div>
      )}
    </div>
  );
}
