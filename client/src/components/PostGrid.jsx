import { useState } from "react";

import { Heart, MessageCircle, Play, Image as ImageIcon } from "lucide-react";

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

function PostCard({ post, onOpenVideo, onOpenPhoto }) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);

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

  const thumbnail = getImageUrl(
    post.image || post.thumbnailUrl || post.poster,

    720,

    405,
  );

  const videoUrl = getImageUrl(
    post.mediaUrl || post.videoUrl || post.video || "",
  );

  return (
    <article className="min-w-0">
      <div className="group relative">
        <button
          type="button"
          aria-label={`Open video: ${post.caption || "Spotli video"}`}
          onClick={openPost}
          className="relative block aspect-video w-full overflow-hidden rounded-lg bg-gray-950 text-left"
        >
          {thumbnail ? (
            <img
              src={thumbnail}
              alt={post.caption || "Video thumbnail"}
              loading="lazy"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : videoUrl ? (
            <video
              src={videoUrl}
              muted
              playsInline
              preload="metadata"
              className="absolute inset-0 h-full w-full object-cover"
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
      </div>

      <div className="mt-2 flex min-w-0 items-start gap-2">
        <CreatorAvatar post={post} />

        <div className="min-w-0 flex-1">
          <button
            type="button"
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

        return (
          <div
            key={safePost.id}
            className={`min-w-0 ${isPhoto ? "col-span-full" : ""}`}
          >
            <PostCard
              post={safePost}
              onOpenVideo={onOpenVideo}
              onOpenPhoto={onOpenPhoto}
            />
          </div>
        );
      })}
    </section>
  );
}

export default PostGrid;
