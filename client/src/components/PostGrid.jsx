import { useEffect, useRef, useState } from "react";
import { preloadCloudinaryVideoStream } from "./VideoViewer";

import {
  Heart,
  MessageCircle,
  Play,
  Image as ImageIcon,
  Bookmark,
} from "lucide-react";

import api from "../services/api";

import samplePosts from "./postData";

const API_ORIGIN = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/api\/?$/, "");

function getImageUrl(image, width = 1200, height) {
  if (typeof image !== "string" || !image.trim()) return "";

  if (/^https?:\/\//i.test(image)) return image;

  if (image.startsWith("/")) return `${API_ORIGIN}${image}`;

  const dimensions = height
    ? `fit=crop&w=${width}&h=${height}`
    : `fit=max&w=${width}`;

  return `https://images.unsplash.com/${image}?auto=format&${dimensions}&q=90`;
}

// Generate a lightweight still image from a Cloudinary video URL. This avoids
// mounting background video players just to display feed thumbnails.
function getCloudinaryVideoThumbnailUrl(value, width = 720, height = 405) {
  if (typeof value !== "string" || !value.trim()) return "";

  const url = value.trim();
  if (!/^https?:\/\/res\.cloudinary\.com\//i.test(url)) return "";

  const marker = "/video/upload/";
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0) return "";

  const pathStart = markerIndex + marker.length;
  let assetPath = url.slice(pathStart).split(/[?#]/, 1)[0];
  const firstSegment = assetPath.split("/")[0];

  // Uploaded post URLs are normally untransformed. If a transformed URL is
  // supplied, avoid stacking transformations and let the card use its fallback.
  if (!assetPath || firstSegment.includes(",")) return "";

  assetPath = assetPath.replace(/\.(mp4|mov|m4v|webm|avi|mkv)$/i, "");
  if (!assetPath) return "";

  return `${url.slice(0, pathStart)}so_0,w_${width},h_${height},c_fill,q_auto,f_jpg/${assetPath}.jpg`;
}

function getCreatorName(creator) {
  if (typeof creator === "string" && creator.trim()) return creator;

  if (creator && typeof creator === "object") {
    const name = `${creator.firstName || ""} ${creator.lastName || ""}`.trim();

    if (name) return name;
  }

  return "Spotli creator";
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

function getPostImages(post) {
  const rawImages = [
    ...(Array.isArray(post.images) ? post.images : []),

    ...(Array.isArray(post.mediaUrls) ? post.mediaUrls : []),

    post.image,

    post.thumbnailUrl,

    isPhotoPost(post) ? post.mediaUrl : "",
  ];

  return [...new Set(rawImages)].filter(
    (image) => typeof image === "string" && image.trim(),
  );
}

function getPostVideoSource(post) {
  const candidates = [
    post?.mediaUrl,
    post?.videoUrl,
    post?.video,
    typeof post?.media === "string" ? post.media : "",
    post?.media?.url,
    post?.media?.secure_url,
    post?.mediaUrls?.[0],
    post?.videos?.[0]?.url,
    post?.url,
  ];

  for (const candidate of candidates) {
    const value =
      typeof candidate === "string"
        ? candidate
        : candidate && typeof candidate === "object"
          ? candidate.url ||
            candidate.src ||
            candidate.secure_url ||
            candidate.path ||
            ""
          : "";
    if (typeof value === "string" && value.trim())
      return getImageUrl(value.trim());
  }

  return "";
}

function CreatorAvatar({ post }) {
  const [imageFailed, setImageFailed] = useState(false);

  const creatorName = getCreatorName(post.creator);

  const avatarUrl = getImageUrl(
    post.creatorAvatar || post.creator?.avatar || "",

    64,

    64,
  );

  const initials =
    creatorName

      .split(/\s+/)

      .filter(Boolean)

      .slice(0, 2)

      .map((part) => part[0])

      .join("")

      .toUpperCase() || "S";

  if (avatarUrl && !imageFailed) {
    return (
      <img
        src={avatarUrl}
        alt={`${creatorName}'s profile`}
        loading="lazy"
        onError={() => setImageFailed(true)}
        className="h-7 w-7 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-700">
      {initials}
    </span>
  );
}

function PhotoSlide({ image, caption, index }) {
  const [orientation, setOrientation] = useState("unknown");

  const imageUrl = getImageUrl(image, 1600);

  function detectOrientation(event) {
    const { naturalWidth, naturalHeight } = event.currentTarget;

    if (!naturalWidth || !naturalHeight) return;

    const ratio = naturalWidth / naturalHeight;

    setOrientation(ratio >= 1.5 ? "landscape" : "portrait");
  }

  return (
    <div className="relative aspect-video max-h-90 w-full flex-none snap-start overflow-hidden bg-black">
      {imageUrl && (
        <img
          src={imageUrl}
          alt={`${caption || "Post"} — image ${index + 1}`}
          loading={index === 0 ? "eager" : "lazy"}
          onLoad={detectOrientation}
          className={`absolute inset-0 h-full w-full ${
            orientation === "landscape" ? "object-cover" : "object-contain"
          }`}
        />
      )}
    </div>
  );
}

function PostCard({
  post,
  onOpenVideo,
  onOpenPhoto,
  isBookmarked,
  onToggleBookmark,
  isPriorityVideo = false,
}) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const videoPreloadTimerRef = useRef(null);
  const videoCardRef = useRef(null);

  function cancelScheduledVideoPreload() {
    if (videoPreloadTimerRef.current != null) {
      window.clearTimeout(videoPreloadTimerRef.current);
      videoPreloadTimerRef.current = null;
    }
  }

  const isPhoto = isPhotoPost(post);

  const isVideo =
    !isPhoto &&
    (post.type === "video" ||
      Boolean(post.mediaUrl || post.videoUrl || post.video));

  const creatorName = getCreatorName(post.creator);

  const handle =
    typeof post.handle === "string" && post.handle ? post.handle : "@creator";

  const images = getPostImages(post);

  const activeImage = images[activeImageIndex] || "";
  const videoUrl = getPostVideoSource(post);

  // Prepare only lightweight HLS playlists before a card is opened. The active
  // video itself downloads its media segment, avoiding duplicate downloads.
  useEffect(() => {
    if (
      !isVideo ||
      !isPriorityVideo ||
      !videoUrl ||
      typeof IntersectionObserver === "undefined"
    ) {
      return undefined;
    }

    const target = videoCardRef.current;
    if (!target) return undefined;

    let preloaded = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (preloaded) return;

        if (entries.some((entry) => entry.isIntersecting)) {
          preloaded = true;
          preloadCloudinaryVideoStream(videoUrl, "auto", {
            includeFirstSegment: true,
          });
          observer.disconnect();
        }
      },
      {
        // Prepare only cards that are on screen or immediately entering it.
        // Together with the 2-entry preload limit, this avoids downloading a
        // feed full of videos while still warming a tapped video's first segment.
        rootMargin: "0px 0px 100px 0px",
        threshold: 0.35,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [isVideo, isPriorityVideo, videoUrl]);

  function openPost() {
    if (isVideo) {
      onOpenVideo?.(post);

      return;
    }

    const photoPost = {
      ...post,

      type: "photo",

      mediaType: "photo",

      images,

      mediaUrls: images,

      image: activeImage || images[0] || "",

      mediaUrl: activeImage || images[0] || "",
    };

    if (onOpenPhoto) {
      onOpenPhoto(photoPost);
    } else {
      onOpenVideo?.(photoPost);
    }
  }

  function handleCarouselScroll(event) {
    const container = event.currentTarget;

    if (!container.clientWidth || !images.length) return;

    const index = Math.round(container.scrollLeft / container.clientWidth);

    setActiveImageIndex(Math.min(index, images.length - 1));
  }

  if (!isVideo) {
    return (
      <article className="w-full min-w-0">
        <div
          className="group relative w-full cursor-pointer overflow-hidden rounded-xl bg-gray-950"
          role="button"
          tabIndex={0}
          aria-label={`Open photo post: ${post.caption || "Spotli photo"}`}
          onClick={openPost}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();

              openPost();
            }
          }}
        >
          {images.length > 1 ? (
            <div
              className="flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
              style={{
                scrollbarWidth: "none",

                WebkitOverflowScrolling: "touch",
              }}
              onScroll={handleCarouselScroll}
            >
              {images.map((image, index) => (
                <PhotoSlide
                  key={`${post.id}-${index}`}
                  image={image}
                  caption={post.caption}
                  index={index}
                />
              ))}
            </div>
          ) : activeImage ? (
            <PhotoSlide image={activeImage} caption={post.caption} index={0} />
          ) : (
            <div className="flex aspect-video max-h-90 w-full items-center justify-center text-white">
              <ImageIcon size={32} />
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/85 via-black/10 to-transparent" />

          <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/60 p-1.5 text-white">
            <ImageIcon size={16} />
          </span>

          <button
            type="button"
            aria-label={isBookmarked ? "Remove bookmark" : "Bookmark photo"}
            aria-pressed={Boolean(isBookmarked)}
            title={isBookmarked ? "Remove from saved posts" : "Save post"}
            onClick={(event) => {
              event.stopPropagation();
              onToggleBookmark?.(post);
            }}
            className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/65 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Bookmark size={18} fill={isBookmarked ? "currentColor" : "none"} />
          </button>

          {images.length > 1 && (
            <>
              <span className="pointer-events-none absolute right-3 top-3 rounded-md bg-black/65 px-2 py-1 text-xs font-medium text-white">
                {activeImageIndex + 1}/{images.length}
              </span>

              <div className="pointer-events-none absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                {images.map((image, index) => (
                  <span
                    key={`${post.id}-dot-${index}`}
                    className={`h-1.5 rounded-full transition-all ${
                      index === activeImageIndex
                        ? "w-4 bg-white"
                        : "w-1.5 bg-white/60"
                    }`}
                  />
                ))}
              </div>
            </>
          )}

          <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/85 via-black/35 to-transparent px-3 pb-3 pt-10 sm:px-4 sm:pb-4">
            <h3 className="mb-2 text-sm font-semibold leading-snug text-white sm:text-base">
              {post.caption || ""}
            </h3>

            <div className="flex items-center gap-4 text-white">
              <span className="flex items-center gap-1.5">
                <Heart size={19} strokeWidth={2} />

                <span className="text-xs font-semibold sm:text-sm">
                  {post.likes ?? "0"}
                </span>
              </span>

              <span className="flex items-center gap-1.5">
                <MessageCircle size={19} strokeWidth={2} />

                <span className="text-xs font-semibold sm:text-sm">
                  {post.comments ?? "0"}
                </span>
              </span>
            </div>
          </div>
        </div>

        <div className="mt-2 flex min-w-0 items-center gap-2">
          <CreatorAvatar post={post} />

          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold text-gray-900">
              {creatorName} · {handle}
            </p>

            <p className="mt-0.5 text-[10px] text-gray-500">
              {post.views || "0 views"} · {post.time || ""}
            </p>
          </div>
        </div>
      </article>
    );
  }

  const thumbnail =
    getImageUrl(post.image || post.thumbnailUrl || post.poster, 720, 405) ||
    getCloudinaryVideoThumbnailUrl(videoUrl, 720, 405);

  // A short desktop hover is a head start, and pointerdown prewarms the exact
  // first segment for both mouse and touch. The HLS loader shares that request.
  function scheduleVideoPreload(event) {
    if (event?.pointerType && event.pointerType !== "mouse") return;
    cancelScheduledVideoPreload();
    // A short hover is a useful head start; fast mouse movement across the feed
    // doesn't start media downloads. Only the startup segment is warmed.
    videoPreloadTimerRef.current = window.setTimeout(() => {
      videoPreloadTimerRef.current = null;
      preloadCloudinaryVideoStream(videoUrl, "auto", {
        includeFirstSegment: true,
      });
    }, 250);
  }

  return (
    <article className="min-w-0">
      <div className="group relative">
        <button
          ref={videoCardRef}
          type="button"
          aria-label={`Open video: ${post.caption || "Spotli video"}`}
          onPointerEnter={scheduleVideoPreload}
          onPointerLeave={cancelScheduledVideoPreload}
          onPointerDown={() => {
            // The viewer's HLS loader shares this in-flight request, so the
            // player can reuse the startup segment instead of downloading it twice.
            preloadCloudinaryVideoStream(videoUrl, "auto", {
              includeFirstSegment: true,
            });
          }}
          onClick={openPost}
          className="relative block aspect-video w-full overflow-hidden rounded-lg bg-gray-950 text-left"
        >
          {thumbnail ? (
            <img
              src={thumbnail}
              alt={post.caption || "Video thumbnail"}
              loading={isPriorityVideo ? "eager" : "lazy"}
              fetchPriority={isPriorityVideo ? "high" : "low"}
              decoding="async"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <Play size={32} className="text-white/80" />
            </div>
          )}

          <span className="absolute inset-0 bg-linear-to-t from-black/45 via-transparent to-transparent" />

          <span className="absolute bottom-2 left-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/75 text-white">
            <Play size={13} fill="currentColor" />
          </span>

          {post.duration && (
            <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-1 text-[10px] font-medium text-white">
              {post.duration}
            </span>
          )}
        </button>

        <button
          type="button"
          aria-label={isBookmarked ? "Remove bookmark" : "Bookmark video"}
          aria-pressed={Boolean(isBookmarked)}
          title={isBookmarked ? "Remove from saved posts" : "Save post"}
          onClick={() => onToggleBookmark?.(post)}
          className="absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/65 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <Bookmark size={18} fill={isBookmarked ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="mt-2 flex min-w-0 items-start gap-2">
        <CreatorAvatar post={post} />

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onPointerEnter={scheduleVideoPreload}
            onPointerLeave={cancelScheduledVideoPreload}
            onClick={openPost}
            className="block w-full text-left"
          >
            <h3 className="line-clamp-2 text-[11px] font-semibold leading-4 text-gray-900">
              {post.caption || ""}
            </h3>
          </button>

          <p className="mt-0.5 truncate text-[10px] text-gray-600">
            {creatorName} · {handle}
          </p>

          <p className="mt-1 text-[9px] text-gray-500">
            {post.views || "0 views"} · {post.time || ""}
          </p>

          <div className="mt-1.5 flex items-center gap-3 text-[10px] text-gray-500">
            <span className="flex items-center gap-1">
              <Heart size={12} />

              {post.likes ?? "0"}
            </span>

            <span className="flex items-center gap-1">
              <MessageCircle size={12} />

              {post.comments ?? "0"}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function PostGrid({ onOpenVideo, onOpenPhoto, posts: suppliedPosts }) {
  const feedPosts = suppliedPosts ?? samplePosts;
  const firstPriorityVideoUrl =
    feedPosts
      .filter((post) => !isPhotoPost(post))
      .map((post) => getPostVideoSource(post))
      .find(Boolean) || "";

  // Warm the first video's HLS playlists as soon as feed data is available.
  // Keep media-segment downloads under the active player's control so a slow
  // background request cannot delay the tap-to-play path.
  const firstVideoPreloadKey = feedPosts
    .filter((post) => !isPhotoPost(post))
    .map((post) => `${post?._id || post?.id || ""}:${getPostVideoSource(post)}`)
    .filter((entry) => entry.slice(entry.indexOf(":") + 1).length > 0)
    .slice(0, 1)
    .join("|");

  useEffect(() => {
    if (!firstVideoPreloadKey) return undefined;

    const candidates = feedPosts
      .filter((post) => !isPhotoPost(post))
      .map((post) => getPostVideoSource(post))
      .filter(Boolean)
      .slice(0, 1);

    const timers = [];
    candidates.forEach((url, index) => {
      const timer = window.setTimeout(
        () =>
          preloadCloudinaryVideoStream(url, "auto", {
            includeFirstSegment: false,
          }),
        0,
      );
      timers.push(timer);
    });

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [firstVideoPreloadKey]);

  const [bookmarkedIds, setBookmarkedIds] = useState({});
  const [bookmarkBusyIds, setBookmarkBusyIds] = useState({});

  useEffect(() => {
    let cancelled = false;

    api.bookmarks
      .getMine()
      .then((result) => {
        if (cancelled) return;
        const savedPosts = Array.isArray(result?.posts) ? result.posts : [];
        const next = {};
        savedPosts.forEach((post) => {
          const id = post?._id || post?.id;
          if (id != null) next[String(id)] = true;
        });
        setBookmarkedIds(next);
      })
      .catch(() => {
        // Guests or expired sessions can still browse the feed.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleBookmark(post) {
    const id = post?._id || post?.id;
    if (id == null) return;
    const key = String(id);
    if (bookmarkBusyIds[key]) return;

    const wasBookmarked = Boolean(bookmarkedIds[key]);
    setBookmarkBusyIds((current) => ({ ...current, [key]: true }));
    setBookmarkedIds((current) => ({ ...current, [key]: !wasBookmarked }));

    try {
      if (wasBookmarked) {
        await api.bookmarks.remove(id);
      } else {
        await api.bookmarks.add(id);
      }
    } catch (error) {
      setBookmarkedIds((current) => ({ ...current, [key]: wasBookmarked }));
      if (typeof window !== "undefined") {
        window.alert(error?.message || "Please sign in to save posts.");
      }
    } finally {
      setBookmarkBusyIds((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  return (
    <section
      aria-label="Discover posts"
      className="mt-4 grid grid-flow-dense grid-cols-2 items-start gap-x-3 gap-y-5 pb-6 sm:gap-x-4 lg:grid-cols-3 lg:gap-x-3 lg:gap-y-4"
    >
      {feedPosts.map((post, index) => {
        const safePost = {
          ...post,

          id: post.id || post._id || `post-${index}`,

          creator: getCreatorName(post.creator),

          creatorAvatar: post.creatorAvatar || post.creator?.avatar || "",
        };

        const isPhoto = isPhotoPost(safePost);
        const cardVideoUrl = getPostVideoSource(safePost);
        const isPriorityVideo = Boolean(
          firstPriorityVideoUrl && cardVideoUrl === firstPriorityVideoUrl,
        );

        return (
          <div
            key={safePost.id}
            className={`min-w-0 ${isPhoto ? "col-span-full" : ""}`}
          >
            <PostCard
              post={safePost}
              onOpenVideo={onOpenVideo}
              onOpenPhoto={onOpenPhoto}
              isBookmarked={Boolean(
                bookmarkedIds[String(safePost._id || safePost.id)],
              )}
              onToggleBookmark={toggleBookmark}
              isPriorityVideo={isPriorityVideo}
            />
          </div>
        );
      })}
    </section>
  );
}

export default PostGrid;
