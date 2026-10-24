import { useEffect, useState } from "react";
import {
  useEffect as tablet_useEffect,
  useRef as tablet_useRef,
  useState as tablet_useState,
  useCallback as tablet_useCallback,
  useMemo as tablet_useMemo,
} from "react";
import tablet_CommentSection from "./comments/CommentSection";
import tablet_api from "../services/api";
import {
  ArrowLeft as tablet_ArrowLeft,
  Heart as tablet_Heart,
  MessageCircle as tablet_MessageCircle,
  Share2 as tablet_Share2,
  MoreVertical as tablet_MoreVertical,
  Play as tablet_Play,
  Pause as tablet_Pause,
  Volume2 as tablet_Volume2,
  VolumeX as tablet_VolumeX,
  Maximize as tablet_Maximize,
  Settings as tablet_Settings,
  Captions as tablet_Captions,
  Bookmark as tablet_Bookmark,
} from "lucide-react";
import {
  useEffect as desktop_useEffect,
  useMemo as desktop_useMemo,
  useRef as desktop_useRef,
  useState as desktop_useState,
} from "react";
import {
  ArrowLeft as desktop_ArrowLeft,
  Heart as desktop_Heart,
  MessageCircle as desktop_MessageCircle,
  Share2 as desktop_Share2,
  MoreVertical as desktop_MoreVertical,
  Play as desktop_Play,
  Pause as desktop_Pause,
  Volume2 as desktop_Volume2,
  VolumeX as desktop_VolumeX,
  Maximize as desktop_Maximize,
  Settings as desktop_Settings,
  Captions as desktop_Captions,
  CheckCircle2 as desktop_CheckCircle2,
  Bookmark as desktop_Bookmark,
} from "lucide-react";
import desktop_TopBar from "../components/TopBar";
import desktop_CommentSection from "./comments/CommentSection";
import desktop_api from "../services/api";
import MentionText from "./MentionText";

function getSavedPlaybackPreference(key, fallback) {
  try {
    const saved = JSON.parse(
      localStorage.getItem("spotli.settings.preferences") || "{}",
    );
    return saved[key] ?? fallback;
  } catch {
    return fallback;
  }
}

function createTabletViewerImplementation() {
  // Keep the original tablet viewer's imports scoped to its implementation.
  const useEffect = tablet_useEffect;
  const useRef = tablet_useRef;
  const useState = tablet_useState;
  const useCallback = tablet_useCallback;
  const useMemo = tablet_useMemo;
  const CommentSection = tablet_CommentSection;
  const api = tablet_api;
  const ArrowLeft = tablet_ArrowLeft;
  const Heart = tablet_Heart;
  const MessageCircle = tablet_MessageCircle;
  const Share2 = tablet_Share2;
  const MoreVertical = tablet_MoreVertical;
  const Play = tablet_Play;
  const Pause = tablet_Pause;
  const Volume2 = tablet_Volume2;
  const VolumeX = tablet_VolumeX;
  const Maximize = tablet_Maximize;
  const Settings = tablet_Settings;
  const Captions = tablet_Captions;
  const Bookmark = tablet_Bookmark;

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
      return `${(number / 1_000_000).toFixed(1).replace(/\\.0$/, "")}M`;
    }

    if (number >= 1_000) {
      return `${(number / 1_000).toFixed(1).replace(/\\.0$/, "")}K`;
    }

    return String(number);
  }

  function TabletVideoViewer({
    posts: sourcePosts = [],

    initialPost,

    onBack,
  }) {
    // Start with the exact post selected on Home, then shuffle every other
    // post once for this viewer session. This never scrolls the Home page.
    const initialPostId = getPostId(initialPost);

    const posts = useMemo(() => {
      if (initialPostId == null) return sourcePosts;

      const selectedPost =
        sourcePosts.find(
          (post) => String(getPostId(post)) === String(initialPostId),
        ) || initialPost;

      if (!selectedPost) return sourcePosts;

      const remainingPosts = sourcePosts.filter(
        (post) => String(getPostId(post)) !== String(initialPostId),
      );

      for (let i = remainingPosts.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [remainingPosts[i], remainingPosts[j]] = [
          remainingPosts[j],
          remainingPosts[i],
        ];
      }

      return [selectedPost, ...remainingPosts];
    }, [sourcePosts, initialPostId, initialPost]);

    const feedRef = useRef(null);

    const videoRefs = useRef({});

    const postRefs = useRef({});

    const tapTimerRef = useRef(null);

    const detailsTimerRef = useRef(null);
    const playbackTimerRef = useRef(null);

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

    const [bookmarkedPosts, setBookmarkedPosts] = useState({});
    const bookmarkRequestsRef = useRef(new Set());
    const userChangedBookmarksRef = useRef(new Set());

    const [likeCounts, setLikeCounts] = useState({});
    // Refs keep rapid taps and in-flight API requests in sync with the latest intent.
    const likedPostsRef = useRef({});

    const likeCountsRef = useRef({});

    const confirmedLikeCountsRef = useRef({});

    const likeRequestsRef = useRef(new Set());

    const userChangedLikesRef = useRef(new Set());

    const [detailsVisible, setDetailsVisible] = useState(true);
    const [playbackVisible, setPlaybackVisible] = useState(true);

    const [commentsPost, setCommentsPost] = useState(null);

    const [comments, setComments] = useState([]);

    const [commentCounts, setCommentCounts] = useState({});

    const [commentsLoading, setCommentsLoading] = useState(false);

    const [commentsError, setCommentsError] = useState("");

    const [followedCreators, setFollowedCreators] = useState({});

    const [paused, setPaused] = useState(false);
    const [muted, setMuted] = useState(() =>
      Boolean(getSavedPlaybackPreference("startMuted", true)),
    );
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [, setProgress] = useState({});
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [captionsEnabled, setCaptionsEnabled] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(
      () => Number(getSavedPlaybackPreference("playbackRate", "1")) || 1,
    );
    const [playbackFeedback, setPlaybackFeedback] = useState(null);
    const playbackFeedbackTimerRef = useRef(null);
    const playbackFeedbackKeyRef = useRef(0);

    const [photoIndexes, setPhotoIndexes] = useState({});

    const [videoOrientations, setVideoOrientations] = useState({});

    const [loveAnimations, setLoveAnimations] = useState({});

    const activePost = posts[activeIndex];

    useEffect(() => {
      let cancelled = false;

      api.bookmarks
        .getMine()
        .then((response) => {
          if (cancelled) return;
          const savedIds = new Set(
            (Array.isArray(response?.posts) ? response.posts : [])
              .map((post) => getPostId(post))
              .filter((id) => id != null)
              .map(String),
          );

          setBookmarkedPosts((previous) => {
            const next = { ...previous };
            posts.forEach((post) => {
              const key = String(getPostId(post));
              if (!userChangedBookmarksRef.current.has(key)) {
                next[key] = savedIds.has(key);
              }
            });
            return next;
          });
        })
        .catch(() => {
          // Keep the viewer usable when the user is signed out.
        });

      return () => {
        cancelled = true;
      };
    }, [posts]);

    async function toggleBookmark(postId) {
      if (postId == null) return;
      const key = String(postId);
      if (bookmarkRequestsRef.current.has(key)) return;

      const wasBookmarked = Boolean(bookmarkedPosts[key]);
      bookmarkRequestsRef.current.add(key);
      userChangedBookmarksRef.current.add(key);
      setBookmarkedPosts((previous) => ({
        ...previous,
        [key]: !wasBookmarked,
      }));

      try {
        if (wasBookmarked) {
          await api.bookmarks.remove(postId);
        } else {
          await api.bookmarks.add(postId);
        }
      } catch (error) {
        setBookmarkedPosts((previous) => ({
          ...previous,
          [key]: wasBookmarked,
        }));
        userChangedBookmarksRef.current.delete(key);
        if (typeof window !== "undefined") {
          window.alert(error?.message || "Please sign in to save posts.");
        }
      } finally {
        bookmarkRequestsRef.current.delete(key);
      }
    }

    useEffect(() => {
      const video = videoRefs.current[getPostId(activePost)];
      if (!video) {
        setCurrentTime(0);
        setDuration(0);
        setSettingsOpen(false);
        return;
      }
      setCurrentTime(video.currentTime || 0);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    }, [activePost]);
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
        // A new `posts` array may arrive on every parent render. Returning the// same state object when nothing changed prevents an update loop.
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
    // Show creator details whenever a new post becomes active, then hide them// after five seconds unless the viewer touches the video again.
    const revealDetails = useCallback(() => {
      setDetailsVisible(true);
      setPlaybackVisible(true);

      if (detailsTimerRef.current) window.clearTimeout(detailsTimerRef.current);
      if (playbackTimerRef.current)
        window.clearTimeout(playbackTimerRef.current);

      // Creator details disappear first; playback controls remain a little longer.
      detailsTimerRef.current = window.setTimeout(() => {
        setDetailsVisible(false);
        detailsTimerRef.current = null;
      }, 3000);

      playbackTimerRef.current = window.setTimeout(() => {
        setPlaybackVisible(false);
        playbackTimerRef.current = null;
      }, 7000);
    }, []);

    useEffect(() => {
      if (detailsTimerRef.current) window.clearTimeout(detailsTimerRef.current);
      if (playbackTimerRef.current)
        window.clearTimeout(playbackTimerRef.current);

      detailsTimerRef.current = window.setTimeout(() => {
        setDetailsVisible(false);
        detailsTimerRef.current = null;
      }, 3000);

      playbackTimerRef.current = window.setTimeout(() => {
        setPlaybackVisible(false);
        playbackTimerRef.current = null;
      }, 7000);

      return () => {
        if (detailsTimerRef.current) {
          window.clearTimeout(detailsTimerRef.current);
          detailsTimerRef.current = null;
        }
        if (playbackTimerRef.current) {
          window.clearTimeout(playbackTimerRef.current);
          playbackTimerRef.current = null;
        }
      };
    }, [activePostId]);
    // Seed comment counts from the feed, then poll the active/visible post so// comments made by other people update the icon without refreshing the page.
    // The feed count seed intentionally synchronizes incoming props into local count state.
    useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
          ...new Set(
            [activePostId, commentsPostId].filter(Boolean).map(String),
          ),
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
            } catch {
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
        // eslint-disable-next-line react-hooks/set-state-in-effect
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
      const loveTimers = loveTimerRef.current;
      const playbackFeedbackTimer = playbackFeedbackTimerRef.current;

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

        if (playbackFeedbackTimer) {
          window.clearTimeout(playbackFeedbackTimer);
        }

        Object.values(loveTimers).forEach((timer) => {
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

      const willPlay = video.paused;

      if (willPlay) {
        video.play().catch(() => {});
        setPaused(false);
      } else {
        video.pause();
        setPaused(true);
      }

      setPlaybackFeedback({
        postId: String(postId),
        action: willPlay ? "play" : "pause",
        key: ++playbackFeedbackKeyRef.current,
      });

      if (playbackFeedbackTimerRef.current) {
        window.clearTimeout(playbackFeedbackTimerRef.current);
      }

      playbackFeedbackTimerRef.current = window.setTimeout(() => {
        setPlaybackFeedback(null);
        playbackFeedbackTimerRef.current = null;
      }, 850);
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
      // One request loop per post: rapid taps update the desired state immediately,// and the loop serializes API changes until the server matches that state.
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
        likedPostsRef.current = {
          ...likedPostsRef.current,
          [key]: serverLiked,
        };

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

        [postId]:
          video.videoWidth > video.videoHeight ? "landscape" : "portrait",
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

    function formatTime(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
      const minutes = Math.floor(seconds / 60);
      const remaining = Math.floor(seconds % 60);
      return `${minutes}:${String(remaining).padStart(2, "0")}`;
    }

    function seekVideo(postId, value) {
      const video = videoRefs.current[postId];
      if (!video || !Number.isFinite(video.duration)) return;
      video.currentTime = Number(value);
      setCurrentTime(video.currentTime);
      setProgress((previous) => ({
        ...previous,
        [postId]: video.duration
          ? (video.currentTime / video.duration) * 100
          : 0,
      }));
    }

    function toggleMute(postId) {
      const nextMuted = !muted;
      setMuted(nextMuted);
      Object.values(videoRefs.current).forEach((video) => {
        if (video) video.muted = nextMuted;
      });
      const video = videoRefs.current[postId];
      if (video) video.muted = nextMuted;
    }

    function toggleCaptions(postId) {
      const nextEnabled = !captionsEnabled;
      setCaptionsEnabled(nextEnabled);
      const video = videoRefs.current[postId];
      if (!video?.textTracks) return;
      Array.from(video.textTracks).forEach((track) => {
        track.mode = nextEnabled ? "showing" : "hidden";
      });
    }

    function changePlaybackRate(postId, rate) {
      setPlaybackRate(rate);
      Object.values(videoRefs.current).forEach((video) => {
        if (video) video.playbackRate = rate;
      });
      const video = videoRefs.current[postId];
      if (video) video.playbackRate = rate;
      setSettingsOpen(false);
    }

    function showLoveAnimation(postId) {
      if (
        !(likedPostsRef.current[String(postId)] ?? likedPosts[String(postId)])
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

      // eslint-disable-next-line react-hooks/purity
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

      // eslint-disable-next-line react-hooks/purity
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
      <div className="fixed inset-0 z-100 block overflow-hidden bg-[#080808] text-white lg:hidden">
        <main
          ref={feedRef}
          onScroll={handleFeedScroll}
          onTouchStart={revealDetails}
          onTouchMove={revealDetails}
          onWheel={revealDetails}
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
                        controls={false}
                        muted
                        loop
                        playsInline
                        preload={isActive ? "auto" : "none"}
                        onLoadedMetadata={(event) => {
                          handleVideoMetadata(postId, event);
                          if (isActive) {
                            setCurrentTime(
                              event.currentTarget.currentTime || 0,
                            );
                            setDuration(
                              Number.isFinite(event.currentTarget.duration)
                                ? event.currentTarget.duration
                                : 0,
                            );
                          }
                        }}
                        onTimeUpdate={(event) => {
                          handleTimeUpdate(postId);
                          if (isActive)
                            setCurrentTime(
                              event.currentTarget.currentTime || 0,
                            );
                        }}
                        onDurationChange={(event) => {
                          if (isActive)
                            setDuration(
                              Number.isFinite(event.currentTarget.duration)
                                ? event.currentTarget.duration
                                : 0,
                            );
                        }}
                        onClick={() => handleVideoTap(postId)}
                        className={`h-full w-full ${
                          isLandscape ? "object-contain" : "object-cover"
                        }`}
                      />
                    </>
                  )}

                  {playbackFeedback?.postId === String(postId) && isActive && (
                    <div
                      key={playbackFeedback.key}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center"
                    >
                      <span className="grid h-20 w-20 place-items-center rounded-full bg-black/45 text-white shadow-xl">
                        {playbackFeedback.action === "play" ? (
                          <Play size={38} fill="currentColor" />
                        ) : (
                          <Pause size={38} fill="currentColor" />
                        )}
                      </span>
                    </div>
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

                {!photoPost && isActive && playbackVisible && (
                  <div
                    className="absolute inset-x-0 bottom-0 z-60 w-full bg-transparent px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 text-white transition-opacity duration-300"
                    onClick={(event) => event.stopPropagation()}
                    onTouchStart={(event) => event.stopPropagation()}
                  >
                    <div className="flex w-full items-center gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => togglePlayback(postId)}
                        aria-label={paused ? "Play video" : "Pause video"}
                        className="shrink-0 p-1"
                      >
                        {paused ? (
                          <Play size={17} fill="currentColor" />
                        ) : (
                          <Pause size={17} />
                        )}
                      </button>
                      <span className="shrink-0 tabular-nums">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleMute(postId)}
                        aria-label={muted ? "Unmute video" : "Mute video"}
                        className="shrink-0 p-1"
                      >
                        {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleCaptions(postId)}
                        aria-label={
                          captionsEnabled
                            ? "Turn captions off"
                            : "Turn captions on"
                        }
                        className={`shrink-0 p-1 ${captionsEnabled ? "text-[#FF2D4A]" : "text-white"}`}
                      >
                        <Captions size={17} />
                      </button>
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={() => setSettingsOpen((open) => !open)}
                          aria-label="Playback settings"
                          className="p-1"
                        >
                          <Settings size={17} />
                        </button>
                        {settingsOpen && (
                          <div className="absolute bottom-9 right-0 z-70 min-w-28 rounded-lg bg-black/95 p-2 shadow-xl">
                            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                              <button
                                key={rate}
                                type="button"
                                onClick={() => changePlaybackRate(postId, rate)}
                                className={`block w-full rounded px-3 py-2 text-left text-xs ${playbackRate === rate ? "text-[#FF2D4A]" : "text-white"}`}
                              >
                                {rate === 1 ? "Normal" : `${rate}x`}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const video = videoRefs.current[postId];
                          if (!video) return;
                          if (document.fullscreenElement)
                            document.exitFullscreen?.();
                          else video.requestFullscreen?.();
                        }}
                        aria-label="Fullscreen video"
                        className="shrink-0 p-1"
                      >
                        <Maximize size={17} />
                      </button>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={duration || 0}
                      step="0.1"
                      value={Math.min(currentTime, duration || 0)}
                      onChange={(event) =>
                        seekVideo(postId, event.target.value)
                      }
                      aria-label="Seek video"
                      className="mt-2 block h-1.5 w-full cursor-pointer accent-white"
                    />
                  </div>
                )}

                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-28 bg-linear-to-b from-black/70 to-transparent" />

                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-72 bg-linear-to-t from-black/90 via-black/35 to-transparent" />

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

                <aside className="absolute bottom-32 right-2 z-40 flex flex-col items-center gap-5">
                  <button
                    type="button"
                    onClick={() => toggleLike(postId)}
                    aria-label={
                      likedPosts[postId] ? "Unlike post" : "Like post"
                    }
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
                            post.likesCount ??
                              post.likeCount ??
                              post.likes ??
                              0,
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

                  <button
                    type="button"
                    onClick={() => toggleBookmark(postId)}
                    aria-label={
                      bookmarkedPosts[String(postId)]
                        ? "Remove bookmark"
                        : "Bookmark post"
                    }
                    aria-pressed={Boolean(bookmarkedPosts[String(postId)])}
                    title={
                      bookmarkedPosts[String(postId)]
                        ? "Remove from saved posts"
                        : "Save post"
                    }
                    className="flex flex-col items-center gap-1"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-black/35 backdrop-blur-sm">
                      <Bookmark
                        size={23}
                        fill={
                          bookmarkedPosts[String(postId)]
                            ? "currentColor"
                            : "none"
                        }
                      />
                    </span>
                    <span className="text-[10px] font-semibold">Save</span>
                  </button>
                </aside>

                <div
                  className={`absolute bottom-24 left-5 right-28 z-30 max-w-4xl transition-opacity duration-300 ${
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
                      <MentionText
                        text={post.caption}
                        mentions={post.mentions}
                      />
                    </p>
                  )}

                  {post.location && (
                    <p className="mt-2 text-xs text-white/70">
                      {post.location}
                    </p>
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
              className="fixed inset-0 z-99 bg-black/45"
            />

            <aside
              className="fixed right-0 top-0 z-100 h-dvh max-h-dvh overflow-hidden border-l border-black/10 bg-white shadow-2xl"
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

  return TabletVideoViewer;
}
const TabletViewerImplementation = createTabletViewerImplementation();

function createDesktopViewerImplementation() {
  // Keep the original desktop viewer's imports scoped to its implementation.
  const useEffect = desktop_useEffect;
  const useMemo = desktop_useMemo;
  const useRef = desktop_useRef;
  const useState = desktop_useState;
  const ArrowLeft = desktop_ArrowLeft;
  const Heart = desktop_Heart;
  const MessageCircle = desktop_MessageCircle;
  const Share2 = desktop_Share2;
  const MoreVertical = desktop_MoreVertical;
  const Play = desktop_Play;
  const Pause = desktop_Pause;
  const Volume2 = desktop_Volume2;
  const VolumeX = desktop_VolumeX;
  const Maximize = desktop_Maximize;
  const Settings = desktop_Settings;
  const Captions = desktop_Captions;
  const CheckCircle2 = desktop_CheckCircle2;
  const Bookmark = desktop_Bookmark;
  const TopBar = desktop_TopBar;
  const CommentSection = desktop_CommentSection;
  const api = desktop_api;

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
            preload="none"
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
    const availablePosts = useMemo(
      () => posts.filter((post) => getPostId(post) != null),
      [posts],
    );

    const initialPostId = getPostId(initialPost);

    const matchingInitialPost = availablePosts.find(
      (post) => String(getPostId(post)) === String(initialPostId),
    );

    // Open directly on the selected Home post, then shuffle the remaining
    // feed once for this viewing session. The Home page itself is not scrolled.
    const viewerPosts = useMemo(() => {
      if (initialPostId == null) return availablePosts;

      const selectedPost = matchingInitialPost || initialPost;
      if (!selectedPost) return availablePosts;

      const remainingPosts = availablePosts.filter(
        (post) => String(getPostId(post)) !== String(initialPostId),
      );

      for (let i = remainingPosts.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [remainingPosts[i], remainingPosts[j]] = [
          remainingPosts[j],
          remainingPosts[i],
        ];
      }

      return [selectedPost, ...remainingPosts];
    }, [availablePosts, initialPost, initialPostId, matchingInitialPost]);

    // A stable key prevents effects from rerunning just because the parent
    // creates a fresh `posts` array on each render.
    const viewerPostIdsKey = viewerPosts
      .map((post) => String(getPostId(post)))
      .join("|");

    // Effects keyed by stable post IDs read the latest post objects through this ref.
    const viewerPostsRef = useRef(viewerPosts);

    useEffect(() => {
      viewerPostsRef.current = viewerPosts;
    }, [viewerPosts]);

    const firstPostId = initialPostId ?? getPostId(viewerPosts[0]);

    const [activeId, setActiveId] = useState(firstPostId);

    const [likedPosts, setLikedPosts] = useState({});

    const [bookmarkedPosts, setBookmarkedPosts] = useState({});
    const bookmarkRequestsRef = useRef(new Set());
    const userChangedBookmarksRef = useRef(new Set());

    const [likeCountOverrides, setLikeCountOverrides] = useState({});

    const [animatedLikePostId, setAnimatedLikePostId] = useState(null);

    const [followedCreators, setFollowedCreators] = useState({});

    const [photoIndexes, setPhotoIndexes] = useState({});

    const [, setVideoRatios] = useState({});

    const [muted, setMuted] = useState(() =>
      Boolean(getSavedPlaybackPreference("startMuted", true)),
    );

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

    // Restore saved bookmarks for the current viewer posts.
    useEffect(() => {
      let cancelled = false;

      api.bookmarks
        .getMine()
        .then((response) => {
          if (cancelled) return;

          const savedIds = new Set(
            (Array.isArray(response?.posts) ? response.posts : [])
              .map((post) => getPostId(post))
              .filter((id) => id != null)
              .map(String),
          );

          setBookmarkedPosts((previous) => {
            const next = { ...previous };
            viewerPostsRef.current.forEach((post) => {
              const key = String(getPostId(post));
              if (!userChangedBookmarksRef.current.has(key)) {
                next[key] = savedIds.has(key);
              }
            });
            return next;
          });
        })
        .catch(() => {
          // Keep the viewer usable when the user is signed out.
        });

      return () => {
        cancelled = true;
      };
    }, [viewerPostIdsKey]);

    async function toggleBookmark(postId) {
      if (postId == null) return;
      const key = String(postId);
      if (bookmarkRequestsRef.current.has(key)) return;

      const wasBookmarked = Boolean(bookmarkedPosts[key]);
      bookmarkRequestsRef.current.add(key);
      userChangedBookmarksRef.current.add(key);
      setBookmarkedPosts((previous) => ({
        ...previous,
        [key]: !wasBookmarked,
      }));

      try {
        if (wasBookmarked) {
          await api.bookmarks.remove(postId);
        } else {
          await api.bookmarks.add(postId);
        }
      } catch (error) {
        setBookmarkedPosts((previous) => ({
          ...previous,
          [key]: wasBookmarked,
        }));
        userChangedBookmarksRef.current.delete(key);
        if (typeof window !== "undefined") {
          window.alert(error?.message || "Please sign in to save posts.");
        }
      } finally {
        bookmarkRequestsRef.current.delete(key);
      }
    }

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

            viewerPostsRef.current.forEach((post) => {
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
      if (!activePostId) return undefined;

      let cancelled = false;

      // Defer loading-state updates so the effect starts the request first.
      Promise.resolve().then(() => {
        if (cancelled) return;
        setCommentsLoading(true);
        setCommentsError("");
      });

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
      const initialId = initialPostId;

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
            viewerPostsRef.current.find(
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
    const activePostMediaType = activePost?.mediaType;
    const activePostType = activePost?.type;

    useEffect(() => {
      if (creatorOverlayTimerRef.current) {
        window.clearTimeout(creatorOverlayTimerRef.current);

        creatorOverlayTimerRef.current = null;
      }

      let revealFrameId = window.requestAnimationFrame(() => {
        setShowCreatorOverlay(true);
        revealFrameId = null;
      });

      if (
        !activePostId ||
        activePostMediaType === "photo" ||
        activePostType === "photo"
      ) {
        return () => {
          if (revealFrameId != null) window.cancelAnimationFrame(revealFrameId);
        };
      }

      creatorOverlayTimerRef.current = window.setTimeout(() => {
        setShowCreatorOverlay(false);
        creatorOverlayTimerRef.current = null;
      }, 5000);

      return () => {
        if (revealFrameId != null) window.cancelAnimationFrame(revealFrameId);
        if (creatorOverlayTimerRef.current) {
          window.clearTimeout(creatorOverlayTimerRef.current);
          creatorOverlayTimerRef.current = null;
        }
      };
    }, [activeId, activePostId, activePostMediaType, activePostType]);

    // Reset playback controls after the active post changes.
    useEffect(() => {
      const frameId = window.requestAnimationFrame(() => {
        setProgress(0);
        setCurrentTime(0);
        setDuration(0);
        setPaused(false);
        setPlaybackFeedback(null);
      });

      if (playbackFeedbackTimerRef.current) {
        window.clearTimeout(playbackFeedbackTimerRef.current);
        playbackFeedbackTimerRef.current = null;
      }

      return () => window.cancelAnimationFrame(frameId);
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

          const matchingPost = viewerPostsRef.current.find(
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
      const nextPosts = viewerPostsRef.current.slice(
        activeIndex + 1,
        activeIndex + 3,
      );
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
      <div className="fixed inset-y-0 left-40 right-0 z-100 overflow-hidden bg-white text-black">
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
              className="relative min-h-0 min-w-0 overflow-x-hidden overflow-y-auto snap-y snap-mandatory overscroll-y-contain bg-[#080808] scrollbar-none [&::-webkit-scrollbar]:hidden"
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
                      className="absolute inset-0 overflow-hidden bg-black touch-manipulation"
                    >
                      {postIsImage ? (
                        <>
                          <div
                            id={`photo-gallery-${postId}`}
                            onScroll={(event) =>
                              handlePhotoScroll(postId, event)
                            }
                            className="absolute inset-0 snap-x snap-mandatory overflow-x-auto overflow-y-hidden scrollbar-none [&::-webkit-scrollbar]:hidden"
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
                                video.videoWidth /
                                Math.max(video.videoHeight, 1),
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

                      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-linear-to-b from-black/15 to-transparent" />

                      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-64 bg-linear-to-t from-black/75 via-black/35 via-45% to-transparent" />

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
                              {followedCreators[postId]
                                ? "Following"
                                : "Follow"}
                            </button>
                          </div>

                          <p className="mt-0.5 max-w-[92%] text-xs font-bold leading-snug text-white [text-shadow:0_2px_5px_rgba(0,0,0,0.95)]">
                            <MentionText
                              text={post.caption}
                              mentions={post.mentions}
                            />
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

                      <aside className="absolute right-2 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-2 text-white">
                        <button
                          type="button"
                          onClick={() => toggleLike(postId)}
                          aria-label={isLiked ? "Unlike post" : "Like post"}
                          aria-pressed={isLiked}
                          className="spotli-like-button group flex flex-col items-center gap-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                          <span className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-md transition-colors group-hover:bg-black/85">
                            <Heart
                              size={17}
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
                          <span className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-md transition-colors group-hover:bg-black/85">
                            <MessageCircle size={15} />
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
                          <span className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-md transition-colors group-hover:bg-black/85">
                            <Share2 size={14} />
                          </span>

                          <span className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
                            Share
                          </span>
                        </button>

                        <button
                          type="button"
                          aria-label="More options"
                          className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-md transition-colors hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                          <MoreVertical size={14} />
                        </button>

                        <button
                          type="button"
                          aria-label={
                            bookmarkedPosts[String(postId)]
                              ? "Remove bookmark"
                              : "Bookmark post"
                          }
                          aria-pressed={Boolean(
                            bookmarkedPosts[String(postId)],
                          )}
                          title={
                            bookmarkedPosts[String(postId)]
                              ? "Remove from saved posts"
                              : "Save post"
                          }
                          onClick={() => toggleBookmark(postId)}
                          className="group flex flex-col items-center gap-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                          <span className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-md transition-colors group-hover:bg-black/85">
                            <Bookmark
                              size={16}
                              fill={
                                bookmarkedPosts[String(postId)]
                                  ? "currentColor"
                                  : "none"
                              }
                            />
                          </span>
                          <span className="rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            Save
                          </span>
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

                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3 scrollbar-none [&::-webkit-scrollbar]:hidden">
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
                          <div className="relative h-14.5 w-25 shrink-0 overflow-hidden rounded-md bg-gray-100">
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
                              <MentionText
                                text={post.caption}
                                mentions={post.mentions}
                              />
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

  return DesktopVideoViewer;
}
const DesktopViewerImplementation = createDesktopViewerImplementation();

/**
 * One responsive Spotli video viewer entry point. Mobile and tablet share the
 * same tablet implementation, handlers, playback state, and interaction logic.
 * Desktop continues to use its existing implementation.
 */
export default function VideoViewer({ posts = [], initialPost, onBack }) {
  const getDevice = () => {
    if (typeof window === "undefined") return "mobile";
    if (window.matchMedia("(min-width: 1024px)").matches) return "desktop";
    if (window.matchMedia("(min-width: 768px)").matches) return "tablet";
    return "mobile";
  };
  const [device, setDevice] = useState(getDevice);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 767px)");
    const tablet = window.matchMedia(
      "(min-width: 768px) and (max-width: 1023px)",
    );
    const desktop = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      if (desktop.matches) setDevice("desktop");
      else if (tablet.matches) setDevice("tablet");
      else setDevice("mobile");
    };
    update();
    mobile.addEventListener?.("change", update);
    tablet.addEventListener?.("change", update);
    desktop.addEventListener?.("change", update);
    return () => {
      mobile.removeEventListener?.("change", update);
      tablet.removeEventListener?.("change", update);
      desktop.removeEventListener?.("change", update);
    };
  }, []);

  const viewerProps = { posts, initialPost, onBack };
  if (device === "desktop")
    return <DesktopViewerImplementation {...viewerProps} />;
  // Mobile and tablet intentionally share the same implementation.
  return <TabletViewerImplementation {...viewerProps} />;
}
