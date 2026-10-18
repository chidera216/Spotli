import { useRef, useState } from "react";
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

function toMobilePost(post) {
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

    likes: post.likes ?? post.likesCount ?? "0",
    comments: post.comments ?? post.commentsCount ?? "0",
    shares: post.shares ?? post.sharesCount ?? "0",

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
              className={`h-8 shrink-0 rounded-full px-[14px] text-[13px] font-medium ${
                selected
                  ? "bg-white text-black"
                  : "border border-white/50 bg-black/20 text-white backdrop-blur-sm"
              } ${tap}`}
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
      onClick={onClick}
      className={`flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 text-white drop-shadow-md ${tap}`}
    >
      {children}
    </button>
  );
}

function ActionRail({ post, liked, onLike }) {
  const [following, setFollowing] = useState(false);

  return (
    <aside className="absolute bottom-5 right-3 z-20 flex flex-col items-center gap-4 text-white">
      <button
        type="button"
        aria-label={`Follow ${post.creator.name}`}
        onClick={() => setFollowing((value) => !value)}
        className={`relative mb-1 grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-white drop-shadow-md ${tap}`}
      >
        <Avatar
          name={post.creator.name}
          src={post.creator.avatar}
          className="h-full w-full"
        />

        <span
          className="absolute -bottom-1 left-1/2 grid h-5 w-5 -translate-x-1/2 place-items-center rounded-full text-white"
          style={{ backgroundColor: BRAND }}
        >
          {following ? (
            <span className="text-xs font-bold">✓</span>
          ) : (
            <span className="text-sm font-bold">+</span>
          )}
        </span>
      </button>

      <ActionButton
        label={liked ? "Unlike post" : "Like post"}
        onClick={onLike}
      >
        <Heart
          size={32}
          strokeWidth={2.5}
          fill={liked ? BRAND : "white"}
          color={liked ? BRAND : "white"}
        />
        <span className="text-[13px] font-semibold leading-none">
          {post.likes}
        </span>
      </ActionButton>

      <ActionButton label="Comments">
        <MessageCircleMore
          size={32}
          strokeWidth={2.5}
          fill="white"
          color="white"
        />
        <span className="text-[13px] font-semibold leading-none">
          {post.comments}
        </span>
      </ActionButton>

      <ActionButton label="Share post">
        <Forward size={32} strokeWidth={2.5} fill="white" color="white" />
        <span className="text-[13px] font-semibold leading-none">
          {post.shares}
        </span>
      </ActionButton>

      <ActionButton label="More options">
        <MoreVertical size={24} strokeWidth={2.5} />
      </ActionButton>
    </aside>
  );
}

function PostInfo({ post }) {
  return (
    <div
      className={`pointer-events-none absolute bottom-5 left-4 right-[84px] z-20 text-white ${textShadow}`}
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

function Slide({ post }) {
  const isPhoto = isPhotoPost(post);
  const images = isPhoto ? post.images || [] : [];
  const media = post.media || {};

  const videoRef = useRef(null);
  const lastTapRef = useRef(0);
  const tapTimerRef = useRef(null);
  const indicatorTimerRef = useRef(null);

  const [activeImage, setActiveImage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showPlaybackIcon, setShowPlaybackIcon] = useState(false);
  const [liked, setLiked] = useState(false);
  const [showHeart, setShowHeart] = useState(false);

  function showPlaybackIndicator() {
    setShowPlaybackIcon(true);

    if (indicatorTimerRef.current) {
      clearTimeout(indicatorTimerRef.current);
    }

    indicatorTimerRef.current = setTimeout(() => {
      setShowPlaybackIcon(false);
    }, 750);
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
    setLiked(true);
    setShowHeart(true);

    if (indicatorTimerRef.current) {
      clearTimeout(indicatorTimerRef.current);
    }

    indicatorTimerRef.current = setTimeout(() => {
      setShowHeart(false);
    }, 750);
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

      if (!isPhoto) {
        togglePlayback();
      }
    }, 280);
  }

  function handleImageScroll(event) {
    const track = event.currentTarget;
    const imageWidth = track.clientWidth;

    if (!imageWidth) return;

    const nextIndex = Math.round(track.scrollLeft / imageWidth);

    setActiveImage(Math.max(0, Math.min(nextIndex, images.length - 1)));
  }

  function handleVideoMetadata(event) {
    const video = event.currentTarget;
    const width = video.videoWidth;
    const height = video.videoHeight;

    if (!width || !height) return;

    const ratio = width / height;
    const isWidescreen = ratio >= 1.7 && ratio <= 1.85;

    video.classList.toggle("object-contain", isWidescreen);
    video.classList.toggle("object-cover", !isWidescreen);
    video.dataset.aspectRatio = isWidescreen ? "16:9" : "other";
  }

  return (
    <section className="relative h-full snap-start overflow-hidden bg-black">
      <div className="absolute inset-0 bg-black" onClick={handleMediaTap}>
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
            onLoadedMetadata={handleVideoMetadata}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
            className="h-full w-full object-cover"
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

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[55%] bg-gradient-to-t from-black/80 via-black/35 to-transparent" />

      {isPhoto && images.length > 1 && (
        <>
          <span className="absolute right-3 top-36 z-20 rounded-full bg-black/50 px-3 py-1 text-[12px] font-semibold text-white">
            {activeImage + 1}/{images.length}
          </span>

          <div className="pointer-events-none absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 gap-2">
            {images.map((_, index) => (
              <span
                key={index}
                className={`h-[6px] w-[6px] rounded-full ${
                  index === activeImage ? "bg-white" : "bg-white/40"
                }`}
              />
            ))}
          </div>
        </>
      )}

      <ActionRail
        post={post}
        liked={liked}
        onLike={() => setLiked((value) => !value)}
      />
      <PostInfo post={post} />
    </section>
  );
}

export default function MobileVideoFeed({ posts = [], initialPost, onBack }) {
  const [activeChip, setActiveChip] = useState("For you");

  const feedPosts = posts.map(toMobilePost);

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

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-black text-white">
      <div className="relative min-h-0 flex-1">
        <TopBar
          activeChip={activeChip}
          onChip={setActiveChip}
          onBack={onBack}
        />

        <main
          className={`absolute inset-0 overflow-y-auto snap-y snap-mandatory overscroll-contain ${hideScrollbar}`}
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {orderedPosts.map((post) => (
            <div key={post.id} className="h-full">
              <Slide post={post} />
            </div>
          ))}

          {orderedPosts.length === 0 && (
            <div className="grid h-full place-items-center px-6 text-center text-white/70">
              No posts available yet.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
