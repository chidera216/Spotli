import { useEffect, useRef, useState } from "react";

import {
  ArrowLeft,
  Heart,
  MessageCircle,
  Share2,
  MoreVertical,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Settings,
  Captions,
  CheckCircle2,
} from "lucide-react";

import TopBar from "../components/TopBar";

import CommentSection from "./comments/CommentSection";

import api from "../services/api";

const API_ORIGIN = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/api\/?$/, "");

function getCreatorName(post) {
  const creator = post?.creator;

  if (typeof creator === "string" && creator.trim()) return creator;

  return (
    creator?.name ||
    [creator?.firstName, creator?.lastName].filter(Boolean).join(" ") ||
    post?.creatorName ||
    post?.user?.name ||
    post?.user?.username ||
    "Spotli creator"
  );
}

function getCreatorAvatar(post) {
  const creator = post?.creator;

  const rawAvatar =
    creator?.avatar ||
    creator?.profileImage ||
    creator?.profilePicture ||
    creator?.photoURL ||
    creator?.image ||
    post?.creatorAvatar ||
    post?.avatar ||
    post?.profileImage ||
    post?.profilePicture ||
    post?.user?.avatar ||
    post?.user?.profileImage ||
    post?.user?.profilePicture ||
    post?.user?.photoURL ||
    post?.user?.image ||
    "";

  if (typeof rawAvatar !== "string" || !rawAvatar.trim()) return "";

  if (/^(https?:|data:|blob:)/i.test(rawAvatar)) return rawAvatar;

  if (rawAvatar.startsWith("/")) return `${API_ORIGIN}${rawAvatar}`;

  return rawAvatar;
}

function getPostImages(post) {
  const toUrl = (value) => {
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      return (
        value.url ||
        value.src ||
        value.imageUrl ||
        value.secure_url ||
        value.path ||
        ""
      );
    }
    return "";
  };

  // Prefer explicit video thumbnails/posters. Some Spotli posts store the
  // uploaded thumbnail as an object (customThumbnail.url), not a string.
  const thumbnailCandidates = [
    post?.customThumbnail,
    post?.thumbnailUrl,
    post?.thumbnail,
    post?.posterUrl,
    post?.poster,
    post?.previewImage,
    post?.coverImage,
    post?.imageUrl,
    post?.image,
  ]
    .map(toUrl)
    .filter(Boolean);

  const collections = [post?.mediaUrls, post?.images, post?.photos];
  const collectionImages = collections
    .filter(Array.isArray)
    .flat()
    .map(toUrl)
    .filter(Boolean);

  const photoMedia =
    post?.mediaType === "photo" || post?.mediaType === "image"
      ? [toUrl(post?.mediaUrl), toUrl(post?.media)].filter(Boolean)
      : [];

  return [
    ...new Set([...thumbnailCandidates, ...photoMedia, ...collectionImages]),
  ];
}

function resolveMediaUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";

  const url = value.trim();

  if (/^(https?:|data:|blob:)/i.test(url)) return url;

  if (url.startsWith("//")) {
    return `${window.location.protocol}${url}`;
  }

  if (url.startsWith("/")) {
    return `${API_ORIGIN}${url}`;
  }

  // API responses may return relative paths such as "uploads/thumb.jpg".
  // Resolve those against the backend instead of the frontend page URL.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    return `${API_ORIGIN}/${url.replace(/^\.\//, "")}`;
  }

  return url;
}

function getVideoUrl(post) {
  // The API may return the uploaded video as a string or as a media object.
  // Normalize both formats before resolving the backend URL.
  const toMediaUrl = (value) => {
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      return (
        value.url ||
        value.src ||
        value.videoUrl ||
        value.mediaUrl ||
        value.secure_url ||
        value.path ||
        value.location ||
        ""
      );
    }
    return "";
  };

  const candidates = [
    post?.videoUrl,
    post?.video,
    post?.mediaUrl,
    post?.media,
    post?.videoFile,
    post?.video?.url,
    post?.media?.url,
    post?.mediaUrls?.[0],
    post?.videos?.[0],
    post?.url,
  ];

  for (const candidate of candidates) {
    const rawUrl = toMediaUrl(candidate);
    if (rawUrl) return resolveMediaUrl(rawUrl);
  }

  return "";
}

function getPostImage(post, width = 1200) {
  const image = getPostImages(post)[0];

  if (!image) return "";

  // Preserve support for legacy Unsplash photo IDs.
  if (image.startsWith("photo-")) {
    return `https://images.unsplash.com/${image}?auto=format&fit=crop&w=${width}&q=85`;
  }

  return resolveMediaUrl(image);
}

// Show the saved thumbnail when available. If a video has no thumbnail,
// render its first decoded frame as the Up next preview instead of a broken image.
function UpNextThumbnail({ post, loading = "lazy", fetchPriority = "auto" }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const imageUrl = getPostImage(post, 320);
  const videoUrl = getVideoUrl(post);
  const showImage = Boolean(imageUrl) && !imageFailed;
  const showVideo =
    !showImage &&
    post?.mediaType !== "photo" &&
    post?.type !== "photo" &&
    Boolean(videoUrl) &&
    !videoFailed;

  return (
    <>
      {showImage && (
        <img
          src={imageUrl}
          alt=""
          loading={loading}
          decoding="async"
          fetchPriority={fetchPriority}
          onError={() => setImageFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {showVideo && (
        <video
          src={videoUrl}
          muted
          playsInline
          preload="metadata"
          crossOrigin="anonymous"
          onLoadedMetadata={(event) => {
            // Seek a tiny amount so the browser paints a representative frame.
            try {
              if (event.currentTarget.duration > 0.2)
                event.currentTarget.currentTime = 0.1;
            } catch {
              // Some streaming formats do not allow seeking at this point.
            }
          }}
          onError={() => setVideoFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </>
  );
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";

  const minutes = Math.floor(seconds / 60);

  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatCount(value) {
  const number = Number(value) || 0;

  if (number >= 1_000_000) {
    return `${(number / 1_000_000).toFixed(1).replace(/.0$/, "")}M`;
  }

  if (number >= 1_000) {
    return `${(number / 1_000).toFixed(1).replace(/.0$/, "")}K`;
  }

  return String(number);
}

function getPostId(post) {
  return post?._id ?? post?.id;
}

function getPostLikeCount(post) {
  return Math.max(0, Number(post?.likesCount ?? post?.likes) || 0);
}

function DesktopVideoViewer({ posts = [], initialPost, onBack }) {
  const availablePosts = posts.filter((post) => getPostId(post) != null);

  const initialPostId = getPostId(initialPost);

  const matchingInitialPost = availablePosts.find(
    (post) => String(getPostId(post)) === String(initialPostId),
  );

  // Always put the post clicked on Home/Discover first in this viewer.
  // Keep the remaining posts in their original order after it.
  const viewerPosts =
    initialPostId == null
      ? availablePosts
      : matchingInitialPost
        ? [
            matchingInitialPost,

            ...availablePosts.filter(
              (post) => String(getPostId(post)) !== String(initialPostId),
            ),
          ]
        : [initialPost, ...availablePosts];

  // A stable key prevents effects from rerunning just because the parent
  // creates a fresh `posts` array on each render.
  const viewerPostIdsKey = viewerPosts
    .map((post) => String(getPostId(post)))
    .join("|");

  const firstPostId = initialPostId ?? getPostId(viewerPosts[0]);

  const [activeId, setActiveId] = useState(firstPostId);

  const [likedPosts, setLikedPosts] = useState({});

  const [likeCountOverrides, setLikeCountOverrides] = useState({});

  const [animatedLikePostId, setAnimatedLikePostId] = useState(null);

  const [followedCreators, setFollowedCreators] = useState({});

  const [photoIndexes, setPhotoIndexes] = useState({});

  const [, setVideoRatios] = useState({});

  const [muted, setMuted] = useState(false);

  const [paused, setPaused] = useState(false);

  const [playbackFeedback, setPlaybackFeedback] = useState(null);

  const [progress, setProgress] = useState(0);

  const [duration, setDuration] = useState(0);

  const [currentTime, setCurrentTime] = useState(0);

  const [commentsOpen, setCommentsOpen] = useState(false);

  const [showCreatorOverlay, setShowCreatorOverlay] = useState(true);

  const creatorOverlayTimerRef = useRef(null);

  const warmedVideoUrlsRef = useRef(new Map());

  const feedRef = useRef(null);

  const videoRef = useRef(null);

  const postRefs = useRef({});

  const playbackFeedbackTimerRef = useRef(null);

  const likeAnimationTimerRef = useRef(null);

  const likeRequestsRef = useRef(new Set());

  const likedPostsRef = useRef({});

  const userChangedLikesRef = useRef(new Set());

  const lastTapRef = useRef({ time: 0, postId: null, x: 0, y: 0 });

  const activeIndex = Math.max(
    0,

    viewerPosts.findIndex(
      (post) => String(getPostId(post)) === String(activeId),
    ),
  );

  const activePost = viewerPosts[activeIndex];

  const activePostId = getPostId(activePost);

  const [comments, setComments] = useState([]);

  const [commentsLoading, setCommentsLoading] = useState(false);

  const [commentsError, setCommentsError] = useState("");

  // Restore the signed-in user's saved likes from the server.
  useEffect(() => {
    let cancelled = false;

    api.posts

      .getMyLikes()

      .then((response) => {
        if (cancelled) return;

        const likedIds = new Set(
          (Array.isArray(response?.postIds) ? response.postIds : []).map(
            String,
          ),
        );

        setLikedPosts((previous) => {
          const next = { ...previous, ...likedPostsRef.current };

          viewerPosts.forEach((post) => {
            const ids = [post.id, post._id].filter(Boolean).map(String);

            const key = String(getPostId(post));

            // Never let the initial server response overwrite a user's click.
            if (!userChangedLikesRef.current.has(key)) {
              next[key] = ids.some((id) => likedIds.has(id));
            }
          });

          likedPostsRef.current = next;

          return next;
        });
      })

      .catch((error) => {
        console.error(
          "Unable to restore liked posts:",

          error?.message || error,
        );
      });

    return () => {
      cancelled = true;
    };
  }, [viewerPostIdsKey]);

  // Load comments for the currently active post.
  useEffect(() => {
    if (!activePostId) {
      setComments([]);

      setCommentsLoading(false);

      setCommentsError("");

      return undefined;
    }

    let cancelled = false;

    setCommentsLoading(true);

    setCommentsError("");

    api.posts

      .getComments(activePostId)

      .then((result) => {
        if (!cancelled) {
          setComments(Array.isArray(result?.comments) ? result.comments : []);
        }
      })

      .catch((error) => {
        if (!cancelled) {
          setCommentsError(error?.message || "Unable to load comments.");
        }
      })

      .finally(() => {
        if (!cancelled) setCommentsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activePostId]);

  // Open the viewer at the exact post selected from Home/Discover.
  useEffect(() => {
    if (!initialPost) return undefined;

    const initialId = getPostId(initialPost);

    if (initialId == null) return undefined;

    let frameId;

    let attempts = 0;

    let cancelled = false;

    const scrollToSelectedPost = () => {
      if (cancelled) return;

      const feed = feedRef.current;

      const postElement = postRefs.current[String(initialId)];

      // The viewer may need another frame for its post refs/layout to be ready.
      if (!feed || !postElement) {
        if (attempts < 10) {
          attempts += 1;

          frameId = window.requestAnimationFrame(scrollToSelectedPost);
        }

        return;
      }

      // Calculate the target relative to the scroll container instead of relying
      // on offsetTop, which can be relative to a different offset parent.
      const feedTop = feed.getBoundingClientRect().top;

      const postTop = postElement.getBoundingClientRect().top;

      const targetTop = feed.scrollTop + postTop - feedTop;

      feed.scrollTo({ top: Math.max(0, targetTop), behavior: "auto" });

      setActiveId(
        getPostId(
          viewerPosts.find(
            (post) => String(getPostId(post)) === String(initialId),
          ),
        ) ?? initialId,
      );
    };

    // Two frames allow the viewer and its snap-scrolling items to finish layout.
    frameId = window.requestAnimationFrame(() => {
      frameId = window.requestAnimationFrame(scrollToSelectedPost);
    });

    return () => {
      cancelled = true;

      if (frameId != null) window.cancelAnimationFrame(frameId);
    };
  }, [initialPostId, viewerPostIdsKey]);

  // Keep playback and mute state in sync with the active video.
  useEffect(() => {
    const video = videoRef.current;

    if (!video) return;

    video.muted = muted;

    if (paused) {
      video.pause();
    } else {
      video.play().catch(() => {});
    }
  }, [activeId, paused, muted]);

  // Keep creator details visible briefly whenever a new video becomes active.
  useEffect(() => {
    if (creatorOverlayTimerRef.current) {
      window.clearTimeout(creatorOverlayTimerRef.current);

      creatorOverlayTimerRef.current = null;
    }

    setShowCreatorOverlay(true);

    if (
      !activePost ||
      activePost.mediaType === "photo" ||
      activePost.type === "photo"
    ) {
      return undefined;
    }

    creatorOverlayTimerRef.current = window.setTimeout(() => {
      setShowCreatorOverlay(false);

      creatorOverlayTimerRef.current = null;
    }, 5000);

    return () => {
      if (creatorOverlayTimerRef.current) {
        window.clearTimeout(creatorOverlayTimerRef.current);

        creatorOverlayTimerRef.current = null;
      }
    };
  }, [activeId]);

  // Reset playback controls when the active post changes.
  useEffect(() => {
    setProgress(0);

    setCurrentTime(0);

    setDuration(0);

    setPaused(false);

    setPlaybackFeedback(null);

    if (playbackFeedbackTimerRef.current) {
      window.clearTimeout(playbackFeedbackTimerRef.current);

      playbackFeedbackTimerRef.current = null;
    }
  }, [activeId]);

  useEffect(() => {
    return () => {
      if (playbackFeedbackTimerRef.current) {
        window.clearTimeout(playbackFeedbackTimerRef.current);
      }

      if (likeAnimationTimerRef.current) {
        window.clearTimeout(likeAnimationTimerRef.current);
      }

      if (creatorOverlayTimerRef.current) {
        window.clearTimeout(creatorOverlayTimerRef.current);
      }
    };
  }, []);

  // Change the active post only when a slide is mostly visible.
  useEffect(() => {
    const feed = feedRef.current;

    if (!feed || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        let mostVisibleEntry = null;

        for (const entry of entries) {
          if (
            entry.isIntersecting &&
            (!mostVisibleEntry ||
              entry.intersectionRatio > mostVisibleEntry.intersectionRatio)
          ) {
            mostVisibleEntry = entry;
          }
        }

        if (!mostVisibleEntry || mostVisibleEntry.intersectionRatio < 0.6) {
          return;
        }

        const postId = mostVisibleEntry.target.dataset.postId;

        if (postId == null) return;

        const matchingPost = viewerPosts.find(
          (post) => String(getPostId(post)) === postId,
        );

        if (matchingPost) {
          setActiveId((currentId) =>
            String(currentId) === String(getPostId(matchingPost))
              ? currentId
              : getPostId(matchingPost),
          );
        }
      },

      {
        root: feed,

        threshold: [0.6, 0.75, 0.9],
      },
    );

    Object.values(postRefs.current).forEach((element) => {
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [viewerPostIdsKey]);

  function selectPost(post) {
    if (!post) return;

    const postId = getPostId(post);

    const feed = feedRef.current;

    const element = postRefs.current[String(postId)];

    if (!feed || !element) return;

    setActiveId(postId);

    feed.scrollTo({
      top: element.offsetTop,

      behavior: "smooth",
    });
  }

  function revealCreatorOverlay() {
    setShowCreatorOverlay(true);

    if (creatorOverlayTimerRef.current) {
      window.clearTimeout(creatorOverlayTimerRef.current);
    }

    creatorOverlayTimerRef.current = window.setTimeout(() => {
      setShowCreatorOverlay(false);

      creatorOverlayTimerRef.current = null;
    }, 5000);
  }

  function showPlaybackFeedback(icon) {
    setPlaybackFeedback(icon);

    if (playbackFeedbackTimerRef.current) {
      window.clearTimeout(playbackFeedbackTimerRef.current);
    }

    playbackFeedbackTimerRef.current = window.setTimeout(() => {
      setPlaybackFeedback(null);

      playbackFeedbackTimerRef.current = null;
    }, 650);
  }

  function togglePlayback() {
    const video = videoRef.current;

    if (!video) return;

    if (video.paused) {
      video.play().catch(() => {});

      setPaused(false);

      showPlaybackFeedback("play");
    } else {
      video.pause();

      setPaused(true);

      showPlaybackFeedback("pause");
    }
  }

  function handleTimeUpdate() {
    const video = videoRef.current;

    if (!video || !video.duration) return;

    setCurrentTime(video.currentTime);

    setDuration(video.duration);

    setProgress((video.currentTime / video.duration) * 100);
  }

  function handleSeek(event) {
    const video = videoRef.current;

    if (!video || !video.duration) return;

    const nextTime = Number(event.target.value);

    video.currentTime = nextTime;

    setCurrentTime(nextTime);

    setProgress((nextTime / video.duration) * 100);
  }

  // Update the heart/count on the first click, then serialize server changes.
  async function toggleLike(postId) {
    const post = viewerPosts.find(
      (item) => String(getPostId(item)) === String(postId),
    );

    const requestPostId = getPostId(post);

    if (!post || requestPostId == null) return;

    const key = String(requestPostId);

    userChangedLikesRef.current.add(key);

    // Read from a ref so fast clicks never depend on a stale React render.
    const wasLiked = Boolean(likedPostsRef.current[key] ?? likedPosts[key]);

    const nextLiked = !wasLiked;

    likedPostsRef.current = { ...likedPostsRef.current, [key]: nextLiked };

    setLikedPosts((previous) => ({ ...previous, [key]: nextLiked }));

    const currentCount = likeCountOverrides[key] ?? getPostLikeCount(post);

    setLikeCountOverrides((previous) => ({
      ...previous,

      [key]: Math.max(0, currentCount + (nextLiked ? 1 : -1)),
    }));

    // Don't drop a second click while a request is pending. The running loop
    // checks the latest desired state after each request completes.
    if (likeRequestsRef.current.has(key)) return;

    likeRequestsRef.current.add(key);

    let serverLiked = wasLiked;

    try {
      while (serverLiked !== Boolean(likedPostsRef.current[key])) {
        const desiredLiked = Boolean(likedPostsRef.current[key]);

        if (desiredLiked) {
          await api.posts.like(requestPostId);
        } else {
          await api.posts.unlike(requestPostId);
        }

        serverLiked = desiredLiked;
      }
    } catch (error) {
      console.error("Unable to update post like:", error?.message || error);
    } finally {
      likeRequestsRef.current.delete(key);
    }
  }

  function handleDoubleTapLike(postId, event) {
    event?.preventDefault?.();

    // A double tap adds a like but never removes an existing one.
    if (!likedPosts[String(postId)]) {
      void toggleLike(postId);
    }

    // Restart the animation so every double tap gets immediate feedback.
    setAnimatedLikePostId(null);

    if (likeAnimationTimerRef.current) {
      window.clearTimeout(likeAnimationTimerRef.current);
    }

    requestAnimationFrame(() => setAnimatedLikePostId(postId));

    likeAnimationTimerRef.current = window.setTimeout(() => {
      setAnimatedLikePostId(null);

      likeAnimationTimerRef.current = null;
    }, 700);
  }

  function handlePointerUp(postId, event) {
    // Use pointer events for reliable mobile/tablet double-tap detection.
    if (event.pointerType !== "touch") return;

    // Don't treat taps on interactive controls as taps on the media.
    if (event.target.closest("button, input, [role='button']")) {
      lastTapRef.current = { time: 0, postId: null, x: 0, y: 0 };

      return;
    }

    const now = Date.now();

    const key = String(postId);

    const lastTap = lastTapRef.current;

    const elapsed = now - lastTap.time;

    const distance = Math.hypot(
      event.clientX - lastTap.x,

      event.clientY - lastTap.y,
    );

    if (
      lastTap.postId === key &&
      elapsed > 0 &&
      elapsed < 350 &&
      distance < 72
    ) {
      lastTapRef.current = { time: 0, postId: null, x: 0, y: 0 };

      handleDoubleTapLike(postId, event);

      return;
    }

    lastTapRef.current = {
      time: now,

      postId: key,

      x: event.clientX,

      y: event.clientY,
    };
  }

  function toggleFollow(postId) {
    setFollowedCreators((previous) => ({
      ...previous,

      [postId]: !previous[postId],
    }));
  }

  // Warm upcoming video data so selecting an Up next item starts sooner.
  // Limit background preloading to a small number of videos to protect bandwidth.
  function warmVideo(post, preload = "auto") {
    const url = getVideoUrl(post);

    if (!url) return;

    const previousPreload = warmedVideoUrlsRef.current.get(url);
    if (
      previousPreload === "auto" ||
      (previousPreload === "metadata" && preload === "metadata")
    ) {
      return;
    }

    // Allow metadata-only preloads to be upgraded when this becomes the next video.
    warmedVideoUrlsRef.current.set(url, preload);

    const warmVideoElement = document.createElement("video");

    warmVideoElement.preload = preload;

    warmVideoElement.muted = true;

    warmVideoElement.src = url;

    warmVideoElement.load();
  }

  // Prepare the next two videos in the background. Never preload the whole feed.
  useEffect(() => {
    const nextPosts = viewerPosts.slice(activeIndex + 1, activeIndex + 3);
    nextPosts.forEach((post, index) => {
      warmVideo(post, index === 0 ? "auto" : "metadata");
    });
  }, [activeIndex, viewerPostIdsKey]);

  async function submitComment(text) {
    if (!activePostId || !text?.trim()) {
      throw new Error("Choose a post and enter a comment first.");
    }

    const result = await api.posts.addComment(activePostId, text.trim());

    if (result?.comment) {
      setComments((previous) => [result.comment, ...previous]);
    }
  }

  function toggleFullscreen(postId) {
    const postElement = postRefs.current[String(postId)];

    const videoStage = postElement?.querySelector("[data-video-stage]");

    if (!videoStage) return;

    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      videoStage.requestFullscreen?.().catch(() => {});
    }
  }

  function handlePhotoScroll(postId, event) {
    const gallery = event.currentTarget;

    const index = Math.round(gallery.scrollLeft / gallery.clientWidth);

    setPhotoIndexes((previous) => ({
      ...previous,

      [postId]: index,
    }));
  }

  function goToPhoto(postId, index) {
    const gallery = document.getElementById(`photo-gallery-${postId}`);

    if (!gallery) return;

    gallery.scrollTo({
      left: index * gallery.clientWidth,

      behavior: "smooth",
    });
  }

  if (!activePost) return null;

  return (
    <div className="fixed inset-y-0 left-40 right-0 z-[100] overflow-hidden bg-white text-black">
      <style>{`

        .spotli-double-tap-heart {

          animation: spotli-heart-pop 700ms cubic-bezier(.18, .89, .32, 1.28) both;

          transform-origin: center;

          filter: drop-shadow(0 0 18px rgba(255, 45, 74, .65));

        }

        .spotli-like-button:active .spotli-like-icon {

          transform: scale(1.35);

        }

        .spotli-like-icon {

          transition: transform 140ms ease, color 160ms ease, fill 160ms ease;

        }

        @keyframes spotli-heart-pop {

          0% { opacity: 0; transform: scale(.15) rotate(-24deg); }

          18% { opacity: 1; transform: scale(1.35) rotate(10deg); }

          36% { opacity: 1; transform: scale(.88) rotate(-6deg); }

          52% { opacity: 1; transform: scale(1.12) rotate(3deg); }

          68% { opacity: 1; transform: scale(1) rotate(0); }

          100% { opacity: 0; transform: scale(1.45) translateY(-14px); }

        }

        [data-video-stage]:fullscreen {

          position: fixed;

          inset: 0;

          width: 100vw;

          height: 100vh;

          max-width: none;

          overflow: hidden;

          background: #000;

        }

        [data-video-stage]:fullscreen video {

          position: absolute;

          inset: 0;

          width: 100%;

          height: 100%;

          max-width: none;

          transform: none;

          object-fit: contain;

        }

      `}</style>

      <div className="flex h-full min-h-0 flex-col">
        <div className="px-4 pt-4">
          <TopBar />
        </div>

        <div className="h-0 shrink-0" />

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(280px,340px)] overflow-hidden">
          <section
            ref={feedRef}
            className="relative min-h-0 min-w-0 overflow-x-hidden overflow-y-auto snap-y snap-mandatory overscroll-y-contain bg-[#080808] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{
              scrollBehavior: "smooth",

              scrollSnapType: "y mandatory",

              WebkitOverflowScrolling: "touch",
            }}
          >
            {viewerPosts.map((post) => {
              const postId = getPostId(post);

              const postThumbnail = getPostImage(post);

              const videoUrl = getVideoUrl(post);

              const photoSet = getPostImages(post);

              const postIsImage =
                post.type === "image" ||
                post.type === "photo" ||
                post.mediaType === "image" ||
                post.mediaType === "photo" ||
                post.isImagePost === true ||
                post.isPhotoPost === true ||
                (!videoUrl && photoSet.length > 0);

              const photoIndex = photoIndexes[postId] || 0;

              const isActive = String(postId) === String(activeId);

              const isLiked = Boolean(likedPosts[String(postId)]);

              const displayedLikeCount =
                likeCountOverrides[String(postId)] ?? getPostLikeCount(post);

              return (
                <article
                  key={postId}
                  ref={(element) => {
                    if (element) {
                      postRefs.current[String(postId)] = element;
                    } else {
                      delete postRefs.current[String(postId)];
                    }
                  }}
                  data-post-id={String(postId)}
                  className="relative h-full min-h-full w-full snap-start snap-always overflow-hidden bg-[#080808]"
                  style={{
                    scrollSnapAlign: "start",

                    scrollSnapStop: "always",
                  }}
                >
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 scale-110 bg-cover bg-center blur-3xl"
                    style={{
                      backgroundImage:
                        isActive && postThumbnail
                          ? `url("${postThumbnail}")`
                          : "none",
                    }}
                  />

                  <div className="absolute inset-0 bg-black/60" />

                  <button
                    type="button"
                    onClick={onBack}
                    aria-label="Back to home"
                    className="absolute left-3 top-3 z-30 grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white hover:bg-black/75"
                  >
                    <ArrowLeft size={19} />
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleFullscreen(postId)}
                    aria-label="Fullscreen"
                    className="absolute right-3 top-3 z-30 grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white hover:bg-black/75"
                  >
                    <Maximize size={17} />
                  </button>

                  <div
                    data-video-stage
                    onPointerDown={() => {
                      if (isActive && !postIsImage) revealCreatorOverlay();
                    }}
                    onMouseMove={() => {
                      if (isActive && !postIsImage) revealCreatorOverlay();
                    }}
                    onDoubleClick={(event) =>
                      handleDoubleTapLike(postId, event)
                    }
                    onPointerUp={(event) => handlePointerUp(postId, event)}
                    className="absolute inset-0 overflow-hidden bg-black [touch-action:manipulation]"
                  >
                    {postIsImage ? (
                      <>
                        <div
                          id={`photo-gallery-${postId}`}
                          onScroll={(event) => handlePhotoScroll(postId, event)}
                          className="absolute inset-0 snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                        >
                          <div className="flex h-full w-full">
                            {photoSet.map((photo, index) => (
                              <div
                                key={`${postId}-${photo}-${index}`}
                                className="relative h-full w-full shrink-0 snap-center"
                              >
                                <img
                                  src={getPostImage({ image: photo })}
                                  alt={`${post.caption} — photo ${index + 1}`}
                                  draggable="false"
                                  className="h-full w-full select-none object-contain"
                                />
                              </div>
                            ))}
                          </div>
                        </div>

                        {photoSet.length > 1 && (
                          <>
                            <span className="absolute right-5 top-5 z-30 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                              {photoIndex + 1} / {photoSet.length}
                            </span>

                            <div className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5">
                              {photoSet.map((_, index) => (
                                <button
                                  key={`${postId}-dot-${index}`}
                                  type="button"
                                  aria-label={`Go to photo ${index + 1}`}
                                  aria-current={
                                    photoIndex === index ? "true" : undefined
                                  }
                                  onClick={() => goToPhoto(postId, index)}
                                  className={`h-1.5 rounded-full transition-all duration-200 ${
                                    photoIndex === index
                                      ? "w-4 bg-[#FF2D4A]"
                                      : "w-1.5 bg-white/60 hover:bg-white"
                                  }`}
                                />
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    ) : isActive ? (
                      <video
                        key={postId}
                        ref={videoRef}
                        src={videoUrl || undefined}
                        poster={postThumbnail || undefined}
                        autoPlay={!paused}
                        preload="auto"
                        muted={muted}
                        loop
                        playsInline
                        onClick={togglePlayback}
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={(event) => {
                          const video = event.currentTarget;

                          setDuration(video.duration || 0);

                          setVideoRatios((previous) => ({
                            ...previous,

                            [postId]:
                              video.videoWidth / Math.max(video.videoHeight, 1),
                          }));
                        }}
                        onError={(event) => {
                          console.error("Spotli video failed to load", {
                            postId,
                            src: event.currentTarget.currentSrc || videoUrl,
                            error:
                              event.currentTarget.error?.message ||
                              "Unknown media error",
                          });
                        }}
                        onPlay={() => setPaused(false)}
                        onPause={() => setPaused(true)}
                        className="absolute inset-0 h-full w-full object-contain"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-black">
                        {postThumbnail ? (
                          <img
                            src={postThumbnail}
                            alt=""
                            loading={isActive ? "eager" : "lazy"}
                            fetchPriority={isActive ? "high" : "low"}
                            decoding="async"
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-2 text-white/70">
                            <Play size={36} />

                            <span className="text-xs">Scroll to play</span>
                          </div>
                        )}

                        <span className="absolute bottom-5 right-5 rounded-full bg-black/60 p-2 text-white">
                          <Play size={18} fill="currentColor" />
                        </span>
                      </div>
                    )}

                    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-black/15 to-transparent" />

                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-64 bg-gradient-to-t from-black/75 via-black/35 via-45% to-transparent" />

                    {String(animatedLikePostId) === String(postId) && (
                      <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
                        <Heart
                          size={104}
                          fill="#FF2D4A"
                          color="#FF2D4A"
                          strokeWidth={1.5}
                          className="spotli-double-tap-heart drop-shadow-[0_8px_24px_rgba(255,45,74,0.45)]"
                        />
                      </div>
                    )}

                    {isActive && playbackFeedback && !postIsImage && (
                      <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm">
                          {playbackFeedback === "play" ? (
                            <Play
                              size={30}
                              fill="currentColor"
                              className="ml-1"
                            />
                          ) : (
                            <Pause size={30} fill="currentColor" />
                          )}
                        </span>
                      </div>
                    )}

                    {(!isActive || postIsImage || showCreatorOverlay) && (
                      <div className="absolute bottom-14 left-4 right-16 z-20 text-white drop-shadow-[0_2px_5px_rgba(0,0,0,0.95)]">
                        <div className="mb-1.5 flex items-center gap-1.5">
                          {getCreatorAvatar(post) ? (
                            <img
                              src={getCreatorAvatar(post)}
                              alt={`${getCreatorName(post)}'s profile`}
                              loading="lazy"
                              decoding="async"
                              onError={(event) => {
                                event.currentTarget.onerror = null;

                                event.currentTarget.style.display = "none";
                              }}
                              className="h-7 w-7 shrink-0 rounded-full border-2 border-white object-cover shadow-lg"
                            />
                          ) : (
                            <span
                              aria-label={`${getCreatorName(post)}'s profile`}
                              className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-white bg-[#FF2D4A] text-[10px] font-bold text-white shadow-lg"
                            >
                              {getCreatorName(post).charAt(0).toUpperCase()}
                            </span>
                          )}

                          <div className="min-w-0">
                            <p className="flex items-center gap-1 text-xs font-bold text-white">
                              {getCreatorName(post)}

                              <CheckCircle2
                                size={12}
                                className="text-sky-400"
                              />
                            </p>

                            <p className="text-xs font-medium text-white/90">
                              {post.time || "Recently"}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => toggleFollow(postId)}
                            className="rounded-full border border-white px-2.5 py-1 text-[10px] font-bold text-white shadow-md backdrop-blur-sm"
                          >
                            {followedCreators[postId] ? "Following" : "Follow"}
                          </button>
                        </div>

                        <p className="mt-0.5 max-w-[92%] text-xs font-bold leading-snug text-white [text-shadow:0_2px_5px_rgba(0,0,0,0.95)]">
                          {post.caption}
                        </p>

                        <p className="mt-0.5 text-[10px] leading-snug text-white/95 [text-shadow:0_1px_4px_rgba(0,0,0,0.95)]">
                          Beautiful moments, good food and great people. Share
                          your story on Spotli.
                        </p>

                        <p className="mt-1 text-[10px] font-medium text-white/90">
                          ♫ Original sound · {getCreatorName(post)}
                        </p>
                      </div>
                    )}

                    <aside className="absolute bottom-[28%] right-2 z-20 flex flex-col items-center gap-4 text-white">
                      <button
                        type="button"
                        onClick={() => toggleLike(postId)}
                        aria-label={isLiked ? "Unlike post" : "Like post"}
                        aria-pressed={isLiked}
                        className="spotli-like-button group flex flex-col items-center gap-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      >
                        <span className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-md transition-colors group-hover:bg-black/85">
                          <Heart
                            size={21}
                            fill={isLiked ? "#FF2D4A" : "none"}
                            color={isLiked ? "#FF2D4A" : "white"}
                            strokeWidth={2.2}
                            className="spotli-like-icon transition-colors duration-200"
                          />
                        </span>

                        <span className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
                          {formatCount(displayedLikeCount)}
                        </span>
                      </button>

                      <button
                        type="button"
                        aria-label="Comments"
                        aria-pressed={commentsOpen}
                        onClick={() => setCommentsOpen((open) => !open)}
                        className="group flex flex-col items-center gap-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      >
                        <span className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-md transition-colors group-hover:bg-black/85">
                          <MessageCircle size={17} />
                        </span>

                        <span className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
                          {formatCount(
                            activePost?.commentsCount ?? comments.length,
                          )}
                        </span>
                      </button>

                      <button
                        type="button"
                        aria-label="Share post"
                        onClick={() => {
                          if (navigator.share) {
                            navigator

                              .share({
                                title: "Spotli",

                                text: post.caption,

                                url: window.location.href,
                              })

                              .catch(() => {});
                          } else if (navigator.clipboard) {
                            navigator.clipboard

                              .writeText(window.location.href)

                              .catch(() => {});
                          }
                        }}
                        className="group flex flex-col items-center gap-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      >
                        <span className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-md transition-colors group-hover:bg-black/85">
                          <Share2 size={16} />
                        </span>

                        <span className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
                          Share
                        </span>
                      </button>

                      <button
                        type="button"
                        aria-label="More options"
                        className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-md transition-colors hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      >
                        <MoreVertical size={16} />
                      </button>
                    </aside>

                    {isActive && !postIsImage && (
                      <div className="absolute bottom-2 left-3 right-3 z-30 flex items-center gap-2 text-white">
                        <button
                          type="button"
                          onClick={togglePlayback}
                          aria-label={paused ? "Play" : "Pause"}
                        >
                          {paused ? <Play size={14} /> : <Pause size={14} />}
                        </button>

                        <span className="whitespace-nowrap text-[11px]">
                          {formatTime(currentTime)} / {formatTime(duration)}
                        </span>

                        <input
                          aria-label="Video progress"
                          type="range"
                          min="0"
                          max={duration || 1}
                          step="0.1"
                          value={Math.min(currentTime, duration || 1)}
                          onChange={handleSeek}
                          className="h-1 min-w-0 flex-1 cursor-pointer accent-[#FF2D4A]"
                          style={{
                            background: `linear-gradient(to right, #FF2D4A ${progress}%, rgba(255,255,255,.4) ${progress}%)`,
                          }}
                        />

                        <button
                          type="button"
                          onClick={() => setMuted((value) => !value)}
                          aria-label={muted ? "Unmute" : "Mute"}
                        >
                          {muted ? (
                            <VolumeX size={14} />
                          ) : (
                            <Volume2 size={14} />
                          )}
                        </button>

                        <button type="button" aria-label="Captions">
                          <Captions size={14} />
                        </button>

                        <button type="button" aria-label="Settings">
                          <Settings size={14} />
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleFullscreen(postId)}
                          aria-label="Fullscreen"
                        >
                          <Maximize size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </section>

          <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-gray-100 bg-white">
            {!commentsOpen ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-between px-3 py-3">
                  <h2 className="text-sm font-bold">Up next</h2>

                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    Autoplay
                    <input
                      type="checkbox"
                      defaultChecked
                      className="accent-[#FF2D4A]"
                    />
                  </label>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {viewerPosts

                    .filter(
                      (post) =>
                        String(getPostId(post)) !== String(activePostId),
                    )

                    .map((post, index) => (
                      <button
                        key={getPostId(post)}
                        type="button"
                        onMouseEnter={() => warmVideo(post)}
                        onFocus={() => warmVideo(post)}
                        onClick={() => selectPost(post)}
                        className="flex w-full gap-2 text-left"
                      >
                        <div className="relative h-[58px] w-[100px] shrink-0 overflow-hidden rounded-md bg-gray-100">
                          <UpNextThumbnail
                            post={post}
                            loading={index < 4 ? "eager" : "lazy"}
                            fetchPriority={index < 2 ? "high" : "auto"}
                          />

                          <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 text-[10px] text-white">
                            {post.duration || "0:30"}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-xs font-semibold leading-snug">
                            {post.caption}
                          </p>

                          <p className="mt-1 truncate text-xs text-gray-600">
                            {getCreatorName(post)}
                          </p>

                          <p className="mt-1 text-[10px] text-gray-500">
                            {post.views || "—"} views ·{" "}
                            {post.time || "Recently"}
                          </p>
                        </div>

                        <MoreVertical
                          size={14}
                          className="shrink-0 text-gray-400"
                        />
                      </button>
                    ))}
                </div>
              </div>
            ) : (
              <div
                id="desktop-comments"
                className="flex min-h-0 flex-1 flex-col"
              >
                <CommentSection
                  post={activePost}
                  comments={comments}
                  loading={commentsLoading}
                  error={commentsError}
                  onSubmit={submitComment}
                  onClose={() => setCommentsOpen(false)}
                  variant="panel"
                />
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

export default DesktopVideoViewer;
