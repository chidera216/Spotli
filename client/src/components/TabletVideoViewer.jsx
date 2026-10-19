import { useEffect, useRef, useState, useCallback } from "react";
import CommentSection from "./comments/CommentSection";
import api from "../services/api";

import {
  ArrowLeft,
  Heart,
  MessageCircle,
  Share2,
  MoreVertical,
  Play,
} from "lucide-react";

const API_ORIGIN = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/api\/?$/, "");

const DEMO_VIDEO =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

const getPostId = (post) => post?.id || post?._id;

function resolveMediaUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";

  if (/^https?:\/\//i.test(value)) return value;

  if (value.startsWith("/")) return `${API_ORIGIN}${value}`;

  return value;
}

function getAvatarUrl(post) {
  const creator =
    post?.creator && typeof post.creator === "object" ? post.creator : {};

  const user = post?.user && typeof post.user === "object" ? post.user : {};

  return resolveMediaUrl(
    post?.creatorAvatar ||
      creator.avatar ||
      creator.profilePicture ||
      creator.profileImage ||
      creator.avatarUrl ||
      user.avatar ||
      user.profilePicture ||
      user.profileImage ||
      user.avatarUrl ||
      post?.avatar ||
      post?.profileImage ||
      post?.profilePicture ||
      "",
  );
}

function getCreatorName(post) {
  const creator =
    post?.creator && typeof post.creator === "object" ? post.creator : {};

  const user = post?.user && typeof post.user === "object" ? post.user : {};

  if (typeof post?.creator === "string" && post.creator.trim()) {
    return post.creator;
  }

  return (
    [creator.firstName, creator.lastName].filter(Boolean).join(" ") ||
    creator.username ||
    creator.name ||
    user.username ||
    user.name ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    post?.username ||
    post?.name ||
    "Spotli creator"
  );
}

function getCreatorHandle(post) {
  const creator =
    post?.creator && typeof post.creator === "object" ? post.creator : {};

  const user = post?.user && typeof post.user === "object" ? post.user : {};

  return (
    post?.handle ||
    creator.handle ||
    creator.username ||
    user.handle ||
    user.username ||
    ""
  );
}

function getPostImages(post) {
  const sources = [
    ...(Array.isArray(post?.images) ? post.images : []),

    ...(Array.isArray(post?.mediaUrls) ? post.mediaUrls : []),

    ...(Array.isArray(post?.photos) ? post.photos : []),
  ];

  const images = sources

    .map((item) => {
      if (typeof item === "string") return resolveMediaUrl(item);

      if (item && typeof item === "object") {
        return resolveMediaUrl(
          item.url || item.src || item.imageUrl || item.secure_url || "",
        );
      }

      return "";
    })

    .filter(Boolean);

  if (images.length) return [...new Set(images)];

  const single =
    post?.imageUrl ||
    post?.image ||
    post?.thumbnailUrl ||
    post?.thumbnail ||
    "";

  if (typeof single !== "string" || !single) return [];

  if (/^https?:\/\//i.test(single) || single.startsWith("/")) {
    return [resolveMediaUrl(single)];
  }

  return [
    `https://images.unsplash.com/${single}?auto=format&fit=crop&w=1200&q=90`,
  ];
}

function getVideoUrl(post) {
  return resolveMediaUrl(
    post?.videoUrl ||
      post?.video ||
      post?.mediaUrl ||
      (typeof post?.media === "string" ? post.media : "") ||
      post?.url ||
      "",
  );
}

function isPhotoPost(post) {
  const type = String(post?.type || post?.mediaType || "").toLowerCase();

  if (
    ["image", "photo", "photos", "gallery"].includes(type) ||
    post?.isImagePost === true
  ) {
    return true;
  }

  if (["video", "reel"].includes(type) || post?.isVideoPost === true) {
    return false;
  }

  return !getVideoUrl(post) && getPostImages(post).length > 0;
}

function formatCount(value) {
  const number = Number(value) || 0;

  if (number >= 1_000_000) {
    return `${(number / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }

  if (number >= 1_000) {
    return `${(number / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }

  return String(number);
}

export default function TabletVideoViewer({
  posts: sourcePosts = [],
  initialPost,
  onBack,
}) {
  // Put the exact post selected on Home/Discover at the beginning of the tablet
  // viewer, regardless of where it appeared in the homepage feed.
  const initialPostId = getPostId(initialPost);
  const matchingInitialPost = sourcePosts.find(
    (post) => String(getPostId(post)) === String(initialPostId),
  );
  const posts =
    initialPostId == null
      ? sourcePosts
      : matchingInitialPost
        ? [
            matchingInitialPost,
            ...sourcePosts.filter(
              (post) => String(getPostId(post)) !== String(initialPostId),
            ),
          ]
        : [initialPost, ...sourcePosts];

  const feedRef = useRef(null);

  const videoRefs = useRef({});

  const postRefs = useRef({});

  const tapTimerRef = useRef(null);
  const detailsTimerRef = useRef(null);
  const loveTimerRef = useRef({});

  const lastTapRef = useRef({ time: 0, postId: null });

  const activeIndexRef = useRef(0);

  const scrollFrameRef = useRef(null);

  const initialScrollDoneRef = useRef(false);

  const [activeIndex, setActiveIndex] = useState(() => {
    const initialId = getPostId(initialPost);

    const index = posts.findIndex(
      (post) => String(getPostId(post)) === String(initialId),
    );

    return index >= 0 ? index : 0;
  });

  const [likedPosts, setLikedPosts] = useState({});
  const [likeCounts, setLikeCounts] = useState({});
  // Refs keep rapid taps and in-flight API requests in sync with the latest intent.
  const likedPostsRef = useRef({});
  const likeCountsRef = useRef({});
  const confirmedLikeCountsRef = useRef({});
  const likeRequestsRef = useRef(new Set());
  const userChangedLikesRef = useRef(new Set());
  const [detailsVisible, setDetailsVisible] = useState(true);
  const [commentsPost, setCommentsPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentCounts, setCommentCounts] = useState({});
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState("");

  const [followedCreators, setFollowedCreators] = useState({});

  const [paused, setPaused] = useState(false);

  const [progress, setProgress] = useState({});

  const [photoIndexes, setPhotoIndexes] = useState({});

  const [videoOrientations, setVideoOrientations] = useState({});
  const [loveAnimations, setLoveAnimations] = useState({});

  const activePost = posts[activeIndex];

  // Restore saved likes from the backend when the tablet viewer opens.
  useEffect(() => {
    let cancelled = false;

    api.posts
      .getMyLikes()
      .then((response) => {
        if (cancelled) return;

        const postIds = Array.isArray(response?.postIds)
          ? response.postIds.map(String)
          : [];

        const restored = Object.fromEntries(postIds.map((id) => [id, true]));
        setLikedPosts((previous) => {
          const next = { ...restored, ...previous };
          userChangedLikesRef.current.forEach((id) => {
            if (Object.prototype.hasOwnProperty.call(previous, id)) {
              next[id] = previous[id];
            }
          });
          likedPostsRef.current = next;
          return next;
        });
      })
      .catch((error) => {
        console.error("Unable to load liked posts:", error.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the displayed counts in sync with the counts returned for each post.
  useEffect(() => {
    setLikeCounts((previous) => {
      let changed = false;
      const next = { ...previous };

      posts.forEach((post) => {
        const rawId = getPostId(post);
        if (rawId == null) return;
        const key = String(rawId);
        if (next[key] === undefined) {
          next[key] =
            Number(post.likesCount ?? post.likeCount ?? post.likes ?? 0) || 0;
          changed = true;
        }
      });

      // A new `posts` array may arrive on every parent render. Returning the
      // same state object when nothing changed prevents an update loop.
      const result = changed ? next : previous;
      likeCountsRef.current = result;
      confirmedLikeCountsRef.current = {
        ...confirmedLikeCountsRef.current,
        ...Object.fromEntries(
          Object.entries(result).filter(
            ([key]) => confirmedLikeCountsRef.current[key] === undefined,
          ),
        ),
      };
      return result;
    });
  }, [posts]);

  const commentsPostId = getPostId(commentsPost);
  const activePostId = getPostId(activePost);

  // Show creator details whenever a new post becomes active, then hide them
  // after five seconds unless the viewer touches the video again.
  const revealDetails = useCallback(() => {
    setDetailsVisible(true);
    if (detailsTimerRef.current) {
      window.clearTimeout(detailsTimerRef.current);
    }
    detailsTimerRef.current = window.setTimeout(() => {
      setDetailsVisible(false);
      detailsTimerRef.current = null;
    }, 5000);
  }, []);

  useEffect(() => {
    setDetailsVisible(true);
    if (detailsTimerRef.current) {
      window.clearTimeout(detailsTimerRef.current);
    }
    detailsTimerRef.current = window.setTimeout(() => {
      setDetailsVisible(false);
      detailsTimerRef.current = null;
    }, 5000);

    return () => {
      if (detailsTimerRef.current) {
        window.clearTimeout(detailsTimerRef.current);
        detailsTimerRef.current = null;
      }
    };
  }, [activePostId]);

  // Seed comment counts from the feed, then poll the active/visible post so
  // comments made by other people update the icon without refreshing the page.
  useEffect(() => {
    setCommentCounts((previous) => {
      let changed = false;
      const next = { ...previous };
      posts.forEach((post) => {
        const rawId = getPostId(post);
        if (rawId == null) return;
        const key = String(rawId);
        if (next[key] === undefined) {
          next[key] =
            Number(
              post.commentsCount ?? post.commentCount ?? post.comments ?? 0,
            ) || 0;
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [posts]);

  useEffect(() => {
    let cancelled = false;

    const refreshCounts = async () => {
      const ids = [
        ...new Set([activePostId, commentsPostId].filter(Boolean).map(String)),
      ];
      await Promise.all(
        ids.map(async (postId) => {
          try {
            const result = await api.posts.getComments(postId);
            if (cancelled) return;
            const list = Array.isArray(result?.comments)
              ? result.comments
              : Array.isArray(result?.data?.comments)
                ? result.data.comments
                : Array.isArray(result)
                  ? result
                  : null;
            const rawCount =
              result?.commentsCount ?? result?.count ?? result?.total;
            const count =
              Number.isFinite(Number(rawCount)) && rawCount !== null
                ? Number(rawCount)
                : list?.length;
            if (count !== undefined) {
              setCommentCounts((previous) => ({
                ...previous,
                [postId]: count,
              }));
            }
            if (commentsPostId && String(commentsPostId) === postId && list) {
              setComments((previous) =>
                previous.some((comment) => comment.pending) ? previous : list,
              );
            }
          } catch (error) {
            // Keep the last known count if a background refresh temporarily fails.
          }
        }),
      );
    };

    refreshCounts();
    const intervalId = setInterval(refreshCounts, 3000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [activePostId, commentsPostId]);

  // Load comments whenever the selected post changes.
  useEffect(() => {
    if (!commentsPostId) {
      setComments([]);
      setCommentsError("");
      setCommentsLoading(false);
      return;
    }

    let cancelled = false;
    setCommentsLoading(true);
    setCommentsError("");

    api.posts
      .getComments(commentsPostId)
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
  }, [commentsPostId]);

  async function submitComment(text) {
    const postId = getPostId(commentsPost);
    if (!postId) throw new Error("Could not identify this post.");

    // Show the comment immediately while the server saves it.
    const temporaryId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticComment = {
      id: temporaryId,
      _id: temporaryId,
      text,
      creator: "You",
      createdAt: new Date().toISOString(),
      likesCount: 0,
      pending: true,
    };

    setComments((previous) => [optimisticComment, ...previous]);

    try {
      const result = await api.posts.addComment(postId, text);
      const savedComment =
        result?.comment ?? result?.data?.comment ?? result?.data;
      setCommentCounts((previous) => ({
        ...previous,
        [String(postId)]: (Number(previous[String(postId)]) || 0) + 1,
      }));

      if (savedComment && typeof savedComment === "object") {
        // Replace the temporary row with the canonical comment returned by the API.
        setComments((previous) => [
          savedComment,
          ...previous.filter(
            (comment) => String(comment._id ?? comment.id) !== temporaryId,
          ),
        ]);
      } else {
        // If the API does not return the created comment, refresh from the server.
        const refreshed = await api.posts.getComments(postId);
        setComments(
          Array.isArray(refreshed?.comments) ? refreshed.comments : [],
        );
      }
    } catch (error) {
      // Remove the optimistic row if saving failed so the UI stays truthful.
      setComments((previous) =>
        previous.filter(
          (comment) => String(comment._id ?? comment.id) !== temporaryId,
        ),
      );
      throw error;
    }
  }

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  // Only align to the initial post once. Never force-scroll on every render.

  useEffect(() => {
    const feed = feedRef.current;

    if (!feed || !posts.length || initialScrollDoneRef.current) return;

    const initialId = getPostId(initialPost);

    const index = posts.findIndex(
      (post) => String(getPostId(post)) === String(initialId),
    );

    const resolvedIndex = index >= 0 ? index : 0;

    const targetPost = posts[resolvedIndex];

    const target = postRefs.current[getPostId(targetPost)];

    if (!target) return;

    initialScrollDoneRef.current = true;

    activeIndexRef.current = resolvedIndex;

    setActiveIndex(resolvedIndex);

    feed.scrollTop = target.offsetTop;
  }, [initialPost, posts]);

  // Play only the active video; do not change the feed scroll position here.

  useEffect(() => {
    posts.forEach((post, index) => {
      const video = videoRefs.current[getPostId(post)];

      if (!video) return;

      if (index === activeIndex && !paused && !isPhotoPost(post)) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, [activeIndex, paused, posts]);

  useEffect(() => {
    return () => {
      if (tapTimerRef.current) {
        window.clearTimeout(tapTimerRef.current);
      }

      if (detailsTimerRef.current) {
        window.clearTimeout(detailsTimerRef.current);
      }

      if (scrollFrameRef.current) {
        cancelAnimationFrame(scrollFrameRef.current);
      }

      Object.values(loveTimerRef.current).forEach((timer) => {
        window.clearTimeout(timer);
      });
    };
  }, []);

  // Update the active post after scrolling settles near a page boundary.

  const handleFeedScroll = useCallback(() => {
    // Any feed movement should reveal the creator details again.
    revealDetails();

    const feed = feedRef.current;

    if (!feed) return;

    if (scrollFrameRef.current) {
      cancelAnimationFrame(scrollFrameRef.current);
    }

    scrollFrameRef.current = requestAnimationFrame(() => {
      const currentFeed = feedRef.current;

      if (!currentFeed || !currentFeed.clientHeight) return;

      const nextIndex = Math.max(
        0,

        Math.min(
          Math.round(currentFeed.scrollTop / currentFeed.clientHeight),

          posts.length - 1,
        ),
      );

      if (nextIndex !== activeIndexRef.current) {
        activeIndexRef.current = nextIndex;

        setActiveIndex(nextIndex);

        setPaused(false);
      }
    });
  }, [posts.length, revealDetails]);

  function togglePlayback(postId) {
    const video = videoRefs.current[postId];

    if (!video) return;

    if (video.paused) {
      video.play().catch(() => {});

      setPaused(false);
    } else {
      video.pause();

      setPaused(true);
    }
  }

  async function toggleLike(postId) {
    const key = String(postId);
    const post = posts.find((item) => String(getPostId(item)) === key);
    if (!post || !key || key === "undefined" || key === "null") return;

    userChangedLikesRef.current.add(key);

    // Read the latest intent, not a possibly stale render closure.
    const wasLiked = Boolean(likedPostsRef.current[key] ?? likedPosts[key]);
    const nextLiked = !wasLiked;
    likedPostsRef.current = { ...likedPostsRef.current, [key]: nextLiked };
    setLikedPosts((previous) => ({ ...previous, [key]: nextLiked }));

    const rawPostCount = [post.likesCount, post.likeCount, post.likes]
      .map(Number)
      .find((value) => Number.isFinite(value) && value >= 0);
    const displayedCount = likeCountsRef.current[key];
    const currentCount = Number.isFinite(Number(displayedCount))
      ? Number(displayedCount)
      : (rawPostCount ?? 0);
    const nextCount = Math.max(0, currentCount + (nextLiked ? 1 : -1));
    likeCountsRef.current = { ...likeCountsRef.current, [key]: nextCount };
    setLikeCounts((previous) => ({ ...previous, [key]: nextCount }));

    // One request loop per post: rapid taps update the desired state immediately,
    // and the loop serializes API changes until the server matches that state.
    if (likeRequestsRef.current.has(key)) return;
    likeRequestsRef.current.add(key);

    let serverLiked = wasLiked;
    try {
      while (serverLiked !== Boolean(likedPostsRef.current[key])) {
        const desiredLiked = Boolean(likedPostsRef.current[key]);
        const response = desiredLiked
          ? await api.posts.like(key)
          : await api.posts.unlike(key);

        serverLiked = desiredLiked;
        if (
          response?.likesCount !== undefined &&
          response?.likesCount !== null
        ) {
          const serverCount = Number(response.likesCount);
          // Only use a server count when it reflects the latest completed action.
          if (Number.isFinite(serverCount) && serverCount >= 0) {
            if (serverLiked === Boolean(likedPostsRef.current[key])) {
              likeCountsRef.current = {
                ...likeCountsRef.current,
                [key]: serverCount,
              };
              confirmedLikeCountsRef.current = {
                ...confirmedLikeCountsRef.current,
                [key]: serverCount,
              };
              setLikeCounts((previous) => ({
                ...previous,
                [key]: serverCount,
              }));
            }
          }
        }
      }
    } catch (error) {
      console.error("Unable to update like:", error?.message || error);
      // Restore the server-confirmed state after a failed request.
      likedPostsRef.current = { ...likedPostsRef.current, [key]: serverLiked };
      setLikedPosts((previous) => ({ ...previous, [key]: serverLiked }));
      const confirmedCount = confirmedLikeCountsRef.current[key];
      const fallbackCount = Number.isFinite(Number(confirmedCount))
        ? Number(confirmedCount)
        : (rawPostCount ?? 0);
      likeCountsRef.current = {
        ...likeCountsRef.current,
        [key]: fallbackCount,
      };
      setLikeCounts((previous) => ({ ...previous, [key]: fallbackCount }));
    } finally {
      likeRequestsRef.current.delete(key);
    }
  }

  function toggleFollow(postId) {
    setFollowedCreators((previous) => ({
      ...previous,

      [postId]: !previous[postId],
    }));
  }

  function handleVideoMetadata(postId, event) {
    const video = event.currentTarget;

    setVideoOrientations((previous) => ({
      ...previous,

      [postId]: video.videoWidth > video.videoHeight ? "landscape" : "portrait",
    }));
  }

  function handleTimeUpdate(postId) {
    const video = videoRefs.current[postId];

    if (!video?.duration) return;

    setProgress((previous) => ({
      ...previous,

      [postId]: (video.currentTime / video.duration) * 100,
    }));
  }

  function showLoveAnimation(postId) {
    if (
      !Boolean(
        likedPostsRef.current[String(postId)] ?? likedPosts[String(postId)],
      )
    ) {
      void toggleLike(postId);
    }

    setLoveAnimations((previous) => ({
      ...previous,

      [postId]: Date.now(),
    }));

    if (loveTimerRef.current[postId]) {
      window.clearTimeout(loveTimerRef.current[postId]);
    }

    loveTimerRef.current[postId] = window.setTimeout(() => {
      setLoveAnimations((previous) => {
        const next = { ...previous };

        delete next[postId];

        return next;
      });

      delete loveTimerRef.current[postId];
    }, 750);
  }

  function handleVideoTap(postId) {
    if (String(postId) === String(activePostId)) revealDetails();

    const now = Date.now();

    const previousTap = lastTapRef.current;

    if (previousTap.postId === postId && now - previousTap.time < 280) {
      if (tapTimerRef.current) {
        window.clearTimeout(tapTimerRef.current);

        tapTimerRef.current = null;
      }

      lastTapRef.current = { time: 0, postId: null };

      showLoveAnimation(postId);

      return;
    }

    lastTapRef.current = { time: now, postId };

    if (tapTimerRef.current) {
      window.clearTimeout(tapTimerRef.current);
    }

    tapTimerRef.current = window.setTimeout(() => {
      const post = posts.find((item) => getPostId(item) === postId);

      if (post && !isPhotoPost(post)) {
        togglePlayback(postId);
      }

      tapTimerRef.current = null;
    }, 280);
  }

  function handlePhotoTap(postId) {
    if (String(postId) === String(activePostId)) revealDetails();

    const now = Date.now();

    const previousTap = lastTapRef.current;

    if (previousTap.postId === postId && now - previousTap.time < 280) {
      if (tapTimerRef.current) {
        window.clearTimeout(tapTimerRef.current);

        tapTimerRef.current = null;
      }

      lastTapRef.current = { time: 0, postId: null };

      showLoveAnimation(postId);

      return;
    }

    lastTapRef.current = { time: now, postId };

    if (tapTimerRef.current) {
      window.clearTimeout(tapTimerRef.current);
    }

    tapTimerRef.current = window.setTimeout(() => {
      tapTimerRef.current = null;
    }, 280);
  }

  async function sharePost(post) {
    const shareData = {
      title: post.caption || "Spotli post",

      text: `${post.caption || ""} — ${getCreatorName(post)} on Spotli`,

      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(
          `${shareData.text}\n${shareData.url}`,
        );
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Unable to share post:", error);
      }
    }
  }

  function openComments(post) {
    setCommentsPost(post);
  }

  function openPostMenu(post) {
    window.dispatchEvent(
      new CustomEvent("spotli:open-post-menu", {
        detail: { post },
      }),
    );
  }

  if (!posts.length || !activePost) return null;

  return (
    <div className="fixed inset-0 z-[100] hidden overflow-hidden bg-[#080808] text-white md:block lg:hidden">
      <main
        ref={feedRef}
        onScroll={handleFeedScroll}
        onTouchStart={revealDetails}
        className="h-full snap-y snap-mandatory overflow-x-hidden overflow-y-auto overscroll-contain scroll-smooth scrollbar-none [&::-webkit-scrollbar]:hidden"
        style={{
          WebkitOverflowScrolling: "touch",

          scrollBehavior: "smooth",
        }}
      >
        {posts.map((post, index) => {
          const postId = getPostId(post);

          const isActive = index === activeIndex;

          const photoPost = isPhotoPost(post);

          const images = getPostImages(post);

          const photoIndex = Math.min(
            photoIndexes[postId] || 0,

            Math.max(images.length - 1, 0),
          );

          const currentImage = images[photoIndex] || "";

          const videoUrl = getVideoUrl(post);

          const orientation = videoOrientations[postId] || "portrait";

          const isLandscape = orientation === "landscape";

          const thumbnail =
            currentImage ||
            resolveMediaUrl(
              post?.thumbnailUrl || post?.imageUrl || post?.image || "",
            );

          const profilePicture = getAvatarUrl(post);

          const creatorName = getCreatorName(post);

          const creatorHandle = getCreatorHandle(post);

          return (
            <section
              key={postId}
              ref={(node) => {
                postRefs.current[postId] = node;
              }}
              className="relative h-dvh min-h-dvh w-full snap-start snap-always overflow-hidden bg-[#080808]"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 scale-110 bg-cover bg-center blur-2xl"
                style={{
                  backgroundImage: thumbnail
                    ? `url("${thumbnail}")`
                    : undefined,
                }}
              />

              <div className="pointer-events-none absolute inset-0 bg-black/55" />

              <div
                className={`absolute overflow-hidden bg-black shadow-2xl ${
                  isLandscape && !photoPost
                    ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                    : "inset-0 h-full w-full"
                }`}
                style={
                  isLandscape && !photoPost
                    ? {
                        width: "min(100vw, 177.7778vh)",

                        height: "min(100vh, 56.25vw)",
                      }
                    : undefined
                }
              >
                {photoPost ? (
                  <div className="relative h-full w-full">
                    {images.length > 0 ? (
                      <div
                        className="h-full w-full overflow-hidden"
                        style={{ touchAction: "pan-x pan-y" }}
                        onClick={() => handlePhotoTap(postId)}
                      >
                        <div
                          className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-none [&::-webkit-scrollbar]:hidden"
                          style={{
                            scrollSnapType: "x mandatory",

                            WebkitOverflowScrolling: "touch",
                          }}
                          onScroll={(event) => {
                            const container = event.currentTarget;

                            const width = container.clientWidth;

                            if (!width) return;

                            const nextIndex = Math.round(
                              container.scrollLeft / width,
                            );

                            setPhotoIndexes((previous) => {
                              if (previous[postId] === nextIndex) {
                                return previous;
                              }

                              return {
                                ...previous,

                                [postId]: nextIndex,
                              };
                            });
                          }}
                        >
                          {images.map((image, imageIndex) => (
                            <div
                              key={`${postId}-${imageIndex}`}
                              className="h-full w-full min-w-full shrink-0 snap-start snap-always overflow-hidden"
                            >
                              <img
                                src={image}
                                alt={`${post.caption || "Post photo"} — image ${imageIndex + 1}`}
                                draggable={false}
                                loading={imageIndex === 0 ? "eager" : "lazy"}
                                className="pointer-events-none h-full w-full select-none object-contain"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-white/60">
                        Image unavailable
                      </div>
                    )}

                    {images.length > 1 && (
                      <>
                        <div className="pointer-events-none absolute right-4 top-20 z-20 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
                          {photoIndex + 1} / {images.length}
                        </div>

                        <div className="pointer-events-none absolute bottom-32 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5">
                          {images.map((image, imageIndex) => (
                            <span
                              key={`${postId}-indicator-${imageIndex}`}
                              className={`h-1.5 rounded-full transition-all ${
                                imageIndex === photoIndex
                                  ? "w-5 bg-white"
                                  : "w-1.5 bg-white/50"
                              }`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <video
                      ref={(node) => {
                        videoRefs.current[postId] = node;
                      }}
                      src={videoUrl || DEMO_VIDEO}
                      poster={thumbnail || undefined}
                      autoPlay={isActive && !paused}
                      muted
                      loop
                      playsInline
                      preload={isActive ? "auto" : "metadata"}
                      onLoadedMetadata={(event) =>
                        handleVideoMetadata(postId, event)
                      }
                      onTimeUpdate={() => handleTimeUpdate(postId)}
                      onClick={() => handleVideoTap(postId)}
                      className={`h-full w-full ${
                        isLandscape ? "object-contain" : "object-cover"
                      }`}
                    />

                    {paused && isActive && (
                      <button
                        type="button"
                        onClick={() => togglePlayback(postId)}
                        aria-label="Resume video"
                        className="absolute left-1/2 top-1/2 z-30 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/50 backdrop-blur-sm"
                      >
                        <Play size={27} fill="white" />
                      </button>
                    )}

                    <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                      <div
                        className="h-full bg-[#FF2D4A]"
                        style={{
                          width: `${progress[postId] || 0}%`,
                        }}
                      />
                    </div>
                  </>
                )}

                {loveAnimations[postId] && (
                  <div
                    key={loveAnimations[postId]}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"
                  >
                    <Heart
                      size={108}
                      fill="#FF2D4A"
                      color="#FF2D4A"
                      strokeWidth={1.5}
                      className="spotli-love-pop drop-shadow-2xl"
                    />
                  </div>
                )}
              </div>

              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-28 bg-gradient-to-b from-black/70 to-transparent" />

              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-72 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />

              <header className="absolute left-4 right-4 top-4 z-40 flex items-center gap-3">
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="Back to home"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black/35 transition hover:bg-black/60"
                >
                  <ArrowLeft size={21} />
                </button>

                <span className="text-lg font-extrabold tracking-tight">
                  Spotli<span className="text-[#FF2D4A]">.</span>
                </span>
              </header>

              <aside className="absolute bottom-36 right-4 z-40 flex flex-col items-center gap-5">
                <button
                  type="button"
                  onClick={() => toggleLike(postId)}
                  aria-label={likedPosts[postId] ? "Unlike post" : "Like post"}
                  className="flex flex-col items-center gap-1"
                >
                  <span
                    className={`grid h-11 w-11 place-items-center rounded-full bg-black/35 backdrop-blur-sm ${
                      likedPosts[postId] ? "text-[#FF2D4A]" : "text-white"
                    }`}
                  >
                    <Heart
                      size={35}
                      fill={likedPosts[postId] ? "currentColor" : "none"}
                    />
                  </span>

                  <span className="text-xs font-semibold">
                    {formatCount(
                      likeCounts[String(postId)] ??
                        Number(
                          post.likesCount ?? post.likeCount ?? post.likes ?? 0,
                        ),
                    )}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => openComments(post)}
                  aria-label="Comments"
                  className="flex flex-col items-center gap-1"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-black/35 backdrop-blur-sm">
                    <MessageCircle size={35} />
                  </span>

                  <span className="text-xs font-semibold">
                    {formatCount(
                      commentCounts[String(getPostId(post))] ??
                        post.commentsCount ??
                        post.commentCount ??
                        post.comments ??
                        0,
                    )}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => sharePost(post)}
                  aria-label="Share post"
                  className="flex flex-col items-center gap-1"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-black/35 backdrop-blur-sm">
                    <Share2 size={23} />
                  </span>

                  <span className="text-xs font-semibold">
                    {formatCount(post.shares || 0)}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => openPostMenu(post)}
                  aria-label="More post options"
                  className="flex flex-col items-center gap-1"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-black/35 backdrop-blur-sm">
                    <MoreVertical size={25} />
                  </span>
                </button>
              </aside>

              <div
                className={`absolute bottom-8 left-5 right-28 z-30 max-w-4xl transition-opacity duration-300 ${
                  isActive && detailsVisible
                    ? "opacity-100"
                    : "pointer-events-none opacity-0"
                }`}
              >
                <div className="mb-3 flex items-center gap-2">
                  {profilePicture ? (
                    <img
                      src={profilePicture}
                      alt={`${creatorName}'s profile`}
                      onError={(event) => {
                        event.currentTarget.onerror = null;

                        event.currentTarget.style.display = "none";
                      }}
                      className="h-10 w-10 shrink-0 rounded-full border border-white/70 object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/70 bg-white/15 text-sm font-bold">
                      {creatorName

                        .split(/\s+/)

                        .filter(Boolean)

                        .slice(0, 2)

                        .map((part) => part[0])

                        .join("")

                        .toUpperCase() || "S"}
                    </span>
                  )}

                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {creatorName}
                    </p>

                    <p className="truncate text-xs text-white/70">
                      {creatorHandle}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleFollow(postId)}
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      followedCreators[postId]
                        ? "border-white/30 bg-white/15"
                        : "border-white/80 bg-black/15"
                    }`}
                  >
                    {followedCreators[postId] ? "Following" : "Follow"}
                  </button>
                </div>

                {post.caption && (
                  <p className="whitespace-pre-wrap text-lg leading-relaxed">
                    {post.caption}
                  </p>
                )}

                {post.location && (
                  <p className="mt-2 text-xs text-white/70">{post.location}</p>
                )}
              </div>
            </section>
          );
        })}
      </main>

      {commentsPost && (
        <>
          <button
            type="button"
            aria-label="Close comments"
            onClick={() => setCommentsPost(null)}
            className="fixed inset-0 z-[99] bg-black/45"
          />
          <aside
            className="fixed right-0 top-0 z-[100] h-dvh max-h-dvh overflow-hidden border-l border-black/10 bg-white shadow-2xl"
            style={{ width: "clamp(300px, 42vw, 420px)" }}
          >
            <CommentSection
              post={commentsPost}
              comments={comments}
              loading={commentsLoading}
              error={commentsError}
              onSubmit={submitComment}
              onClose={() => setCommentsPost(null)}
              variant="panel"
            />
          </aside>
        </>
      )}
    </div>
  );
}
