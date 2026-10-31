import { useEffect, useMemo, useRef, useState } from "react";

import { useNavigate } from "react-router-dom";

import {
  Camera,
  Heart,
  MessageCircle,
  Play,
  Image as ImageIcon,
  UserRound,
  Search,
  Plus,
  X,
  Save,
  Upload,
  Bookmark,
  Bell,
  MapPin,
  Link as LinkIcon,
  Settings,
  MoreVertical,
  Trash2,
} from "lucide-react";

import api from "../services/api";

import BottomNav from "../components/BottomNav";
import ProfilePostTabs from "../components/ProfilePostTabs";

import { useAuth } from "../context/useAuth";

const BRAND = "#111111";

const API_ORIGIN = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/api\/?$/, "");

function getMediaUrl(url) {
  if (!url || typeof url !== "string") return "";

  if (/^https?:\/\//i.test(url)) return url;

  return `${API_ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`;
}

function optimizeImage(url, width = 480) {
  if (!url || typeof url !== "string") return "";

  // Only transform Cloudinary image/auto assets. Keep video URLs and other
  // storage providers untouched so their URLs continue to work as before.
  if (
    !/res\.cloudinary\.com\//i.test(url) ||
    !/\/(?:image|auto)\/upload\//i.test(url) ||
    /\.(?:mp4|mov|m4v|webm|avi|mkv|m3u8)(?:$|\?)/i.test(url)
  ) {
    return url;
  }

  const uploadMarker = /\/(image|auto)\/upload\//i;
  const match = url.match(uploadMarker);
  if (!match) return url;

  // Avoid repeatedly transforming URLs that already specify image delivery
  // settings. This also prevents malformed/doubled Cloudinary transformations.
  const afterUpload = url.slice(match.index + match[0].length);
  const firstPathSegment = afterUpload.split("/")[0];
  if (
    /^(?:f_auto|q_auto|w_\d+|h_\d+|c_fill|c_limit|c_scale|g_auto|ar_\d+)(?:,|$)/i.test(
      firstPathSegment,
    )
  ) {
    return url;
  }

  return url.replace(
    uploadMarker,
    `/$1/upload/f_auto,q_auto,w_${width},c_limit/`,
  );
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

function formatCount(value) {
  const count = Number(value) || 0;

  if (count >= 1_000_000)
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;

  if (count >= 1_000)
    return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`;

  return String(count);
}

function isPhotoPost(post) {
  const type = post.mediaType || post.type;

  return type === "photo" || type === "image" || post.isImagePost === true;
}

function postOwnerId(post) {
  const creator =
    post.creator && typeof post.creator === "object" ? post.creator : null;

  return String(
    creator?._id ||
      creator?.id ||
      post.creatorId ||
      post.userId ||
      post.authorId ||
      "",
  );
}

function postOwnerEmail(post) {
  const creator =
    post.creator && typeof post.creator === "object" ? post.creator : null;

  return String(creator?.email || post.creatorEmail || "").toLowerCase();
}

function extractMediaValue(value) {
  if (typeof value === "string") return value.trim();

  if (!value || typeof value !== "object") return "";

  return (
    value.url ||
    value.src ||
    value.imageUrl ||
    value.secure_url ||
    value.path ||
    value.location ||
    ""
  );
}

function getPostMedia(post) {
  const isPhoto = isPhotoPost(post);

  const thumbnailCandidates = [
    post.customThumbnail,

    post.thumbnailUrl,

    post.thumbnail,

    post.posterUrl,

    post.poster,

    post.previewImage,

    post.coverImage,

    post.imageUrl,

    post.image,
  ];

  const collectionCandidates = [
    ...(Array.isArray(post.mediaUrls) ? post.mediaUrls : []),

    ...(Array.isArray(post.images) ? post.images : []),

    ...(Array.isArray(post.photos) ? post.photos : []),
  ];

  // Video cards must use an image thumbnail, never the actual video URL.
  // Passing a .webm URL to <img> triggers a media download but cannot render a cover.
  if (!isPhoto) {
    const thumbnail = thumbnailCandidates.map(extractMediaValue).find(Boolean);
    return thumbnail ? getMediaUrl(thumbnail) : getVideoCoverUrl(post);
  }

  const mediaCandidates = [
    ...thumbnailCandidates,
    post.mediaUrl,
    post.media,
    ...collectionCandidates,
  ];

  const media = mediaCandidates.map(extractMediaValue).find(Boolean);
  return media ? getMediaUrl(media) : "";
}

function getPostVideoUrl(post) {
  const candidates = [post.mediaUrl, post.videoUrl, post.video, post.media];

  const value = candidates.map(extractMediaValue).find(Boolean);

  return getMediaUrl(value);
}

function getUserName(user) {
  return (
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    user?.name ||
    "Spotli creator"
  );
}

function getInitials(name) {
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

function ProfilePostCard({
  post,
  onOpenPost,
  onRemoveBookmark,
  onRequestDelete,
  index = 99,
}) {
  const media = getPostMedia(post);

  const isPhoto = isPhotoPost(post);

  const caption = post.caption || post.description || "";

  const likes = post.likesCount ?? post.likes ?? 0;

  const comments = post.commentsCount ?? post.comments ?? 0;

  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [postMenuOpen, setPostMenuOpen] = useState(false);

  return (
    <article className="relative min-w-0">
      <button
        type="button"
        onClick={() => onOpenPost?.(post)}
        className={`group relative block aspect-video w-full overflow-hidden ${isPhoto ? "rounded-xl sm:rounded-2xl lg:rounded-[20px]" : "rounded-md sm:rounded-lg"} bg-stone-100 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2D4A]`}
        aria-label={`Open post: ${caption || "Spotli post"}`}
      >
        {media && !thumbnailFailed ? (
          <img
            src={optimizeImage(media, 320)}
            alt={caption || "Post media"}
            loading={index < 4 ? "eager" : "lazy"}
            fetchPriority={index < 4 ? "high" : "auto"}
            decoding="async"
            onError={() => setThumbnailFailed(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : isPhoto && media ? (
          <span className="flex h-full items-center justify-center text-gray-400">
            <ImageIcon size={32} />
          </span>
        ) : (
          <span className="flex h-full items-center justify-center text-gray-400">
            <ImageIcon size={32} />
          </span>
        )}

        {!isPhoto && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/65 px-2 py-1 text-[11px] font-medium text-white">
            <Play size={12} fill="currentColor" /> Video
          </span>
        )}

        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/65 via-black/25 to-transparent"
          aria-hidden="true"
        />

        <span className="pointer-events-none absolute bottom-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[11px] font-semibold leading-none text-white shadow-sm backdrop-blur-[2px]">
          <Heart size={13} fill="currentColor" /> {formatCount(likes)}
        </span>

        <span
          className="pointer-events-none absolute inset-0 bg-black/0 transition-colors duration-200 md:group-hover:bg-black/25 md:group-focus-visible:bg-black/25"
          aria-hidden="true"
        />

        <span className="pointer-events-none absolute bottom-2 right-2 z-10 hidden items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[11px] font-semibold leading-none text-white opacity-0 shadow-sm transition-opacity duration-200 backdrop-blur-[2px] md:inline-flex md:group-hover:opacity-100 md:group-focus-visible:opacity-100">
          <MessageCircle size={13} /> {formatCount(comments)}
        </span>
      </button>

      {onRequestDelete && (
        <div className="absolute right-2 top-2 z-20">
          <button
            type="button"
            aria-label="Post options"
            aria-haspopup="menu"
            aria-expanded={postMenuOpen}
            title="Post options"
            onClick={(event) => {
              event.stopPropagation();
              setPostMenuOpen((open) => !open);
            }}
            className="grid h-8 w-8 place-items-center rounded-full border border-white/20 bg-black/70 text-white shadow-md backdrop-blur-sm transition hover:bg-black"
          >
            <MoreVertical size={17} />
          </button>
          {postMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-9 min-w-36 overflow-hidden rounded-xl border border-neutral-200 bg-white p-1.5 text-neutral-900 shadow-xl"
            >
              <button
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  setPostMenuOpen(false);
                  onRequestDelete(post);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50"
              >
                <Trash2 size={15} /> Delete post
              </button>
            </div>
          )}
        </div>
      )}

      {caption.trim() && (
        <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-neutral-800">
          {caption.trim()}
        </p>
      )}

      {onRemoveBookmark && (
        <button
          type="button"
          onClick={() => onRemoveBookmark(post)}
          aria-label="Remove saved post"
          title="Remove from saved posts"
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-[#FF2D4A] hover:text-[#FF2D4A]"
        >
          <Bookmark size={14} fill="currentColor" /> Saved · Remove
        </button>
      )}
    </article>
  );
}

function ProfilePostsSkeleton() {
  return (
    <div
      className="mt-4 grid grid-cols-2 gap-1.5 md:grid-cols-3 sm:gap-2.5 lg:gap-3"
      role="status"
      aria-label="Loading posts"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="min-w-0 animate-pulse">
          <div className="aspect-video w-full rounded-xl bg-neutral-200 sm:rounded-2xl lg:rounded-[20px]" />
          <div className="mt-2 h-3 w-3/4 rounded-full bg-neutral-200" />
          <div className="mt-1.5 h-3 w-1/2 rounded-full bg-neutral-100" />
        </div>
      ))}
    </div>
  );
}

function FollowListModal({ title, users, loading, error, onClose, onSelect }) {
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
          {loading ? (
            <p className="px-3 py-8 text-center text-sm text-neutral-600">
              Loading people...
            </p>
          ) : error ? (
            <p className="px-3 py-8 text-center text-sm text-red-600">
              {error}
            </p>
          ) : users.length ? (
            users.map((person) => {
              const name = getUserName(person);

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
                      getInitials(name)
                    )}
                  </span>

                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-neutral-900">
                      {name}
                    </span>

                    <span className="block truncate text-xs text-neutral-600">
                      @{person.username || "creator"}
                    </span>
                  </span>
                </button>
              );
            })
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

async function uploadAvatarToCloudinary(file) {
  const signatureData = await api.posts.createUploadSignature({
    resourceType: "image",
    folder: "spotli/avatars",
    fileSize: file.size,
  });

  const uploadData = new FormData();
  uploadData.append("file", file);
  uploadData.append("api_key", signatureData.apiKey);
  uploadData.append("timestamp", String(signatureData.timestamp));
  uploadData.append("signature", signatureData.signature);
  uploadData.append("folder", signatureData.folder);
  uploadData.append("public_id", signatureData.publicId);
  uploadData.append("overwrite", String(signatureData.overwrite ?? false));
  if (signatureData.context) uploadData.append("context", signatureData.context);
  if (signatureData.transformation) {
    uploadData.append("transformation", signatureData.transformation);
  }
  if (signatureData.format) uploadData.append("format", signatureData.format);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${signatureData.cloudName}/image/upload`,
    { method: "POST", body: uploadData },
  );

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Cloudinary returned an invalid response.");
  }

  if (!response.ok || !result.secure_url) {
    throw new Error(
      result.error?.message || "Unable to upload your profile picture.",
    );
  }

  return result.secure_url;
}

export default function Profile({ onOpenVideo, onOpenPhoto, onDeletePost }) {
  const { user, setUser } = useAuth();

  const [posts, setPosts] = useState([]);

  const [savedPosts, setSavedPosts] = useState([]);

  const [isLoadingBookmarks, setIsLoadingBookmarks] = useState(false);

  const [bookmarkError, setBookmarkError] = useState("");

  // Use counts already present in the authenticated user payload immediately,
  // then refresh them from the follow-stats endpoint in the background.
  const [followersCount, setFollowersCount] = useState(
    Number(user?.followersCount ?? user?.followers ?? 0) || 0,
  );

  const [followingCount, setFollowingCount] = useState(
    Number(user?.followingCount ?? user?.following ?? 0) || 0,
  );

  const [followListType, setFollowListType] = useState("");

  const [followListUsers, setFollowListUsers] = useState([]);

  const [isFollowListLoading, setIsFollowListLoading] = useState(false);

  const [followListError, setFollowListError] = useState("");

  const [isLoading, setIsLoading] = useState(true);

  const [errorMessage, setErrorMessage] = useState("");

  const [activeTab, setActiveTab] = useState("All Posts");
  const [postToDelete, setPostToDelete] = useState(null);
  const [isDeletingPost, setIsDeletingPost] = useState(false);
  const [deletePostError, setDeletePostError] = useState("");
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [isLoadingMorePosts, setIsLoadingMorePosts] = useState(false);
  const pageRef = useRef(1);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(false);
  const sentinelRef = useRef(null);

  useEffect(() => {
    function handlePostDeleted(event) {
      const postId = String(event.detail?.postId || "");
      if (!postId) return;
      const getId = (post) =>
        String(post?._id || post?.id || post?.postId || "");
      setPosts((current) => current.filter((post) => getId(post) !== postId));
      setSavedPosts((current) =>
        current.filter((post) => getId(post) !== postId),
      );
    }
    window.addEventListener("spotli:post-deleted", handlePostDeleted);
    return () =>
      window.removeEventListener("spotli:post-deleted", handlePostDeleted);
  }, []);

  const [avatarFailed, setAvatarFailed] = useState(false);

  const [isEditOpen, setIsEditOpen] = useState(false);

  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [profileError, setProfileError] = useState("");

  const [profileSuccess, setProfileSuccess] = useState("");

  const [avatarFile, setAvatarFile] = useState(null);

  const [avatarPreview, setAvatarPreview] = useState("");

  const [avatarZoom, setAvatarZoom] = useState(1);

  const [avatarPositionX, setAvatarPositionX] = useState(50);

  const [avatarPositionY, setAvatarPositionY] = useState(50);

  const [editForm, setEditForm] = useState({
    firstName: "",

    lastName: "",

    username: "",

    bio: "",

    location: "",

    website: "",
  });

  const navigate = useNavigate();

  useEffect(() => {
    // Keep displayed counts in sync if auth restores or refreshes the user.
    setFollowersCount(
      Number(user?.followersCount ?? user?.followers ?? 0) || 0,
    );
    setFollowingCount(
      Number(user?.followingCount ?? user?.following ?? 0) || 0,
    );

    const userId = String(user?._id || user?.id || "");

    if (!userId) return undefined;

    let active = true;

    async function loadFollowStats() {
      try {
        const result = await api.users.getFollowStats(userId);

        if (active) {
          setFollowersCount(Number(result.followersCount) || 0);

          setFollowingCount(Number(result.followingCount) || 0);
        }
      } catch (error) {
        console.error("Unable to load follow statistics:", error.message);
      }
    }

    void loadFollowStats();

    return () => {
      active = false;
    };
  }, [user?._id, user?.id]);

  const fullName = getUserName(user);

  const username = (
    user?.username ||
    user?.email?.split("@")[0] ||
    fullName.replace(/\s+/g, "").toLowerCase() ||
    "creator"
  ).replace(/^@/, "");

  const rawAvatar = getMediaUrl(user?.avatar);
  const avatar = optimizeImage(rawAvatar, 256);
  const profileAvatar = optimizeImage(rawAvatar, 480);

  function openEditProfile() {
    setEditForm({
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      username: user?.username || user?.email?.split("@")[0] || "",
      bio: user?.bio || "",
      location: user?.location || "",
      website: user?.website || "",
    });
    setAvatarFile(null);
    setAvatarPreview("");
    setAvatarZoom(1);
    setAvatarPositionX(50);
    setAvatarPositionY(50);
    setProfileError("");
    setProfileSuccess("");
    setIsEditOpen(true);
  }

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  async function createCroppedAvatar(file, zoom, positionX, positionY) {
    const imageUrl = URL.createObjectURL(file);

    try {
      const image = new Image();

      image.src = imageUrl;

      await new Promise((resolve, reject) => {
        image.onload = resolve;

        image.onerror = () =>
          reject(new Error("Unable to read the selected photo."));
      });

      const side = Math.min(image.naturalWidth, image.naturalHeight) / zoom;

      const maxX = Math.max(0, image.naturalWidth - side);

      const maxY = Math.max(0, image.naturalHeight - side);

      const sx = maxX * (positionX / 100);

      const sy = maxY * (positionY / 100);

      const canvas = document.createElement("canvas");

      canvas.width = 640;

      canvas.height = 640;

      const context = canvas.getContext("2d");

      if (!context) throw new Error("Unable to process this photo.");

      context.drawImage(image, sx, sy, side, side, 0, 0, 640, 640);

      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92),
      );

      if (!blob) throw new Error("Unable to process this photo.");

      const baseName = file.name.replace(/\.[^.]+$/, "") || "profile-photo";

      return new File([blob], `${baseName}-cropped.jpg`, {
        type: "image/jpeg",

        lastModified: Date.now(),
      });
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  function updateEditField(event) {
    const { name, value } = event.target;

    setEditForm((current) => ({ ...current, [name]: value }));
  }

  async function handleProfileSave(event) {
    event.preventDefault();
    setIsSavingProfile(true);
    setProfileError("");
    setProfileSuccess("");

    try {
      const updates = {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        username: editForm.username.trim().replace(/^@/, ""),
        bio: editForm.bio,
        location: editForm.location,
        website: editForm.website,
      };

      if (avatarFile) {
        const croppedAvatar = await createCroppedAvatar(
          avatarFile,
          avatarZoom,
          avatarPositionX,
          avatarPositionY,
        );
        updates.avatar = await uploadAvatarToCloudinary(croppedAvatar);
      }

      const result = await api.auth.updateProfile(updates);
      if (result.user) setUser(result.user);
      setAvatarFailed(false);
      setProfileSuccess("Your profile has been updated.");
      setIsEditOpen(false);
    } catch (error) {
      setProfileError(error.message || "Unable to save your profile.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  useEffect(() => {
    let active = true;
    const userId = String(user?._id || user?.id || "");

    async function loadPosts() {
      setIsLoading(true);
      setErrorMessage("");
      setHasMorePosts(false);
      hasMoreRef.current = false;
      pageRef.current = 1;
      loadingMoreRef.current = false;

      if (!userId) {
        setPosts([]);
        setIsLoading(false);
        return;
      }

      try {
        // Fetch this creator's posts directly instead of downloading 100 global posts.
        const result = await api.users.getCreatorPosts(userId, 1, 6);

        if (!Array.isArray(result.posts))
          throw new Error("The server returned an invalid posts response.");

        if (active) {
          setPosts(result.posts);
          pageRef.current = 1;
          hasMoreRef.current = Boolean(result.pagination?.hasNextPage);
          setHasMorePosts(hasMoreRef.current);
        }
      } catch (error) {
        if (active)
          setErrorMessage(error.message || "Unable to load your posts.");
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadPosts();

    return () => {
      active = false;
    };
  }, [user?._id, user?.id]);

  const ownPosts = useMemo(() => {
    const userId = String(user?._id || user?.id || "");

    const email = String(user?.email || "").toLowerCase();

    if (!userId && !email) return [];

    return posts

      .filter((post) => {
        const ownerId = postOwnerId(post);

        const ownerEmail = postOwnerEmail(post);

        return (
          (userId && ownerId && ownerId === userId) ||
          (email && ownerEmail && ownerEmail === email)
        );
      })

      .sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime(),
      );
  }, [posts, user]);

  useEffect(() => {
    if (activeTab !== "Bookmarks") return undefined;

    let active = true;

    async function loadBookmarks() {
      setIsLoadingBookmarks(true);

      setBookmarkError("");

      try {
        const result = await api.bookmarks.getMine();

        if (!Array.isArray(result.posts)) {
          throw new Error(
            "The server returned an invalid saved-posts response.",
          );
        }

        if (active) setSavedPosts(result.posts);
      } catch (error) {
        if (active)
          setBookmarkError(error.message || "Unable to load saved posts.");
      } finally {
        if (active) setIsLoadingBookmarks(false);
      }
    }

    void loadBookmarks();

    return () => {
      active = false;
    };
  }, [activeTab]);

  async function removeSavedPost(post) {
    const postId = String(post?._id || post?.id || "");

    if (!postId) return;

    try {
      await api.bookmarks.remove(postId);

      setSavedPosts((current) =>
        current.filter(
          (item) => String(item?._id || item?.id || "") !== postId,
        ),
      );
    } catch (error) {
      setBookmarkError(error.message || "Unable to remove this saved post.");
    }
  }

  async function confirmDeletePost() {
    if (!postToDelete || isDeletingPost) return;
    const postId = String(
      postToDelete?._id || postToDelete?.id || postToDelete?.postId || "",
    );
    if (!postId) {
      setDeletePostError("This post does not have a valid ID.");
      return;
    }

    setIsDeletingPost(true);
    setDeletePostError("");
    try {
      if (onDeletePost) {
        await onDeletePost(postToDelete);
      } else {
        await api.posts.delete(postId);
        window.dispatchEvent(
          new CustomEvent("spotli:post-deleted", { detail: { postId } }),
        );
      }
      setPostToDelete(null);
    } catch (error) {
      setDeletePostError(error.message || "Unable to delete this post.");
    } finally {
      setIsDeletingPost(false);
    }
  }

  async function openFollowList(type) {
    setFollowListType(type);

    setFollowListUsers([]);

    setFollowListError("");

    setIsFollowListLoading(true);

    try {
      const result = await api.users.getFollowList(
        String(user?._id || user?.id || ""),

        type,
      );

      setFollowListUsers(Array.isArray(result.users) ? result.users : []);
    } catch (error) {
      setFollowListError(error.message || "Unable to load this list.");
    } finally {
      setIsFollowListLoading(false);
    }
  }

  const visiblePosts = useMemo(() => {
    if (activeTab === "Bookmarks") return savedPosts;

    if (activeTab === "Videos")
      return ownPosts.filter((post) => !isPhotoPost(post));

    if (activeTab === "Photos") return ownPosts.filter(isPhotoPost);

    return ownPosts;
  }, [activeTab, ownPosts, savedPosts]);

  useEffect(() => {
    const element = sentinelRef.current;
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

        const userId = String(user?._id || user?.id || "");
        if (!userId) return;

        loadingMoreRef.current = true;
        setIsLoadingMorePosts(true);
        const nextPage = pageRef.current + 1;

        try {
          const result = await api.users.getCreatorPosts(userId, nextPage, 6);
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
        } catch (error) {
          console.error("Unable to load more profile posts:", error.message);
        } finally {
          loadingMoreRef.current = false;
          setIsLoadingMorePosts(false);
        }
      },
      { rootMargin: "250px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMorePosts, isLoading, isLoadingMorePosts, user?._id, user?.id]);

  const photoCount = ownPosts.filter(isPhotoPost).length;

  const videoCount = ownPosts.length - photoCount;

  const tabs = ["All Posts", "Videos", "Photos", "Bookmarks"];

  return (
    <div className="min-h-screen bg-white font-sans text-[#111111] md:ml-40">
      <div className="sticky top-0 z-40 border-b border-black/[0.06] bg-white/95 px-3 py-2.5 backdrop-blur sm:px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Search Spotli"
              onClick={() => navigate("/search")}
              className="grid h-10 w-10 place-items-center rounded-full text-neutral-800 transition hover:bg-neutral-100"
            >
              <Search size={20} />
            </button>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/create")}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-[#FF2D4A] px-4 text-sm font-semibold text-white transition duration-300 hover:scale-[1.02] hover:bg-[#e92742]"
            >
              <Plus size={17} /> Create
            </button>

            <button
              type="button"
              aria-label="Settings"
              title="Settings"
              onClick={() => navigate("/settings")}
              className="grid h-9 w-9 place-items-center rounded-full text-neutral-700 transition hover:bg-neutral-100"
            >
              <Settings size={19} />
            </button>

            <button
              type="button"
              aria-label="Notifications"
              title="Notifications"
              onClick={() => navigate("/notifications")}
              className="relative grid h-9 w-9 place-items-center rounded-full text-black transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2D4A] focus-visible:ring-offset-2"
            >
              <span className="spotli-profile-notification-dot absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#FF2D4A] ring-2 ring-white" />

              <Bell size={19} />
            </button>

            <button
              type="button"
              aria-label="Account menu"
              className="grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-black/10 bg-neutral-100 text-sm font-semibold"
            >
              {avatar && !avatarFailed ? (
                <img
                  src={avatar}
                  alt="Your profile"
                  onError={() => setAvatarFailed(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                getInitials(fullName)
              )}
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto min-h-screen w-full max-w-[1020px] px-2.5 pb-24 pt-2.5 sm:px-4 sm:pb-8 lg:px-6 lg:pt-5">
        <section className="mx-auto w-full max-w-[1000px]">
          <div className="px-1 py-3 sm:px-2 sm:py-4 lg:px-2 lg:py-5">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6 lg:gap-10">
              <div className="relative mx-auto h-24 w-24 shrink-0 rounded-full bg-neutral-100 sm:mx-0 sm:h-28 sm:w-28 lg:h-44 lg:w-44">
                {avatar && !avatarFailed ? (
                  <img
                    src={profileAvatar}
                    alt={`${fullName}'s profile`}
                    fetchPriority="high"
                    decoding="async"
                    onError={() => setAvatarFailed(true)}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center rounded-full bg-neutral-100 text-3xl font-bold text-neutral-600">
                    {getInitials(fullName)}
                  </div>
                )}

                <button
                  type="button"
                  aria-label="Edit profile and change photo"
                  title="Edit profile and change photo"
                  onClick={openEditProfile}
                  className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full border border-neutral-200 bg-white text-black shadow-sm transition hover:bg-neutral-100 lg:h-10 lg:w-10"
                >
                  <Camera size={18} />
                </button>
              </div>

              <div className="min-w-0 flex-1 text-center sm:text-left">
                <h1 className="flex flex-wrap items-center justify-center gap-2 text-2xl font-bold tracking-tight text-black sm:justify-start sm:text-3xl lg:text-[36px]">
                  {fullName}
                </h1>

                <p className="mt-1 text-sm text-neutral-700 sm:text-base">
                  @{username}
                </p>

                {user?.bio?.trim() && (
                  <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-800 sm:text-[15px]">
                    {user.bio}
                  </p>
                )}

                {(user?.location || user?.website) && (
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-neutral-700 sm:justify-start">
                    {user?.location && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin size={15} />

                        {user.location}
                      </span>
                    )}

                    {user?.website && (
                      <a
                        href={
                          /^https?:\/\//i.test(user.website)
                            ? user.website
                            : `https://${user.website}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 underline decoration-neutral-300 underline-offset-2 hover:text-black"
                      >
                        <LinkIcon size={15} />

                        {user.website

                          .replace(/^https?:\/\//i, "")

                          .replace(/\/$/, "")}
                      </a>
                    )}
                  </div>
                )}

                <div className="mt-5 grid grid-cols-3 divide-x divide-neutral-200 sm:max-w-[520px]">
                  <div className="px-2 text-center sm:px-5 sm:text-left">
                    <p className="text-xl font-bold tracking-tight text-black sm:text-2xl">
                      {formatCount(ownPosts.length)}
                    </p>

                    <p className="mt-1 text-xs text-neutral-700 sm:text-sm">
                      Posts
                    </p>
                  </div>

                  <button
                    type="button"
                    aria-label={`View ${followersCount} followers`}
                    onClick={() => openFollowList("followers")}
                    className="rounded-lg px-2 text-center transition hover:bg-neutral-50 sm:px-5 sm:text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2D4A]"
                  >
                    <p className="text-xl font-bold tracking-tight text-black sm:text-2xl">
                      {formatCount(followersCount)}
                    </p>

                    <p className="mt-1 text-xs text-neutral-700 sm:text-sm">
                      Followers
                    </p>
                  </button>

                  <button
                    type="button"
                    aria-label={`View ${followingCount} accounts you follow`}
                    onClick={() => openFollowList("following")}
                    className="rounded-lg px-2 text-center transition hover:bg-neutral-50 sm:px-5 sm:text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2D4A]"
                  >
                    <p className="text-xl font-bold tracking-tight text-black sm:text-2xl">
                      {formatCount(followingCount)}
                    </p>

                    <p className="mt-1 text-xs text-neutral-700 sm:text-sm">
                      Following
                    </p>
                  </button>
                </div>
              </div>

              <div className="flex justify-center sm:ml-auto sm:pt-1">
                <button
                  type="button"
                  onClick={openEditProfile}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-neutral-200 bg-white px-6 text-sm font-semibold text-black transition hover:bg-neutral-50"
                >
                  <UserRound size={16} /> Edit Profile
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between lg:mt-5">
            <ProfilePostTabs
              tabs={tabs}
              activeTab={activeTab}
              onChange={setActiveTab}
              ariaLabel="Filter profile posts"
            />
          </div>

          {activeTab === "Bookmarks" && isLoadingBookmarks ? (
            <ProfilePostsSkeleton />
          ) : activeTab === "Bookmarks" && bookmarkError ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-red-600">{bookmarkError}</p>

              <button
                type="button"
                onClick={() => setActiveTab("All Posts")}
                className="spotli-profile-primary-action rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2D4A]"
              >
                Back to posts
              </button>
            </div>
          ) : activeTab !== "Bookmarks" && isLoading ? (
            <ProfilePostsSkeleton />
          ) : activeTab !== "Bookmarks" && errorMessage ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-red-600">{errorMessage}</p>

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="spotli-profile-primary-action rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2D4A]"
              >
                Try again
              </button>
            </div>
          ) : visiblePosts.length ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-1.5 md:grid-cols-3 sm:gap-2.5 lg:gap-3">
                {visiblePosts.map((post, index) => (
                  <ProfilePostCard
                    key={post._id || post.id}
                    post={post}
                    index={index}
                    onRemoveBookmark={
                      activeTab === "Bookmarks" ? removeSavedPost : undefined
                    }
                    onRequestDelete={
                      activeTab !== "Bookmarks"
                        ? (targetPost) => {
                            setDeletePostError("");
                            setPostToDelete(targetPost);
                          }
                        : undefined
                    }
                    onOpenPost={() => {
                      const openingPhoto = isPhotoPost(post);
                      // Preserve the full mixed photo/video sequence, even when the
                      // grid is filtered. Bookmarks keep their own saved-post order.
                      const relatedPosts =
                        activeTab === "Bookmarks" ? visiblePosts : ownPosts;
                      (openingPhoto ? onOpenPhoto : onOpenVideo)?.(
                        post,
                        relatedPosts,
                      );
                    }}
                  />
                ))}
              </div>
              {hasMorePosts && (
                <div ref={sentinelRef} className="h-px" aria-hidden="true" />
              )}
              {isLoadingMorePosts && <div className="h-4" aria-hidden="true" />}
            </>
          ) : (
            <div className="mt-4 flex min-h-64 flex-col items-center justify-center px-5 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-neutral-100 text-neutral-800">
                <ImageIcon size={25} />
              </div>

              <h2 className="mt-4 text-base font-semibold">
                {activeTab === "Bookmarks"
                  ? "No saved posts yet"
                  : activeTab === "All Posts"
                    ? "No posts yet"
                    : `No ${activeTab.toLowerCase()} yet`}
              </h2>

              <p className="mt-1 max-w-xs text-sm leading-5 text-neutral-500">
                {activeTab === "Bookmarks"
                  ? "Posts you bookmark will appear here so you can find them again."
                  : "Your published photos and videos will appear here."}
              </p>

              {activeTab !== "Bookmarks" && (
                <button
                  type="button"
                  onClick={() => navigate("/create")}
                  className="spotli-profile-primary-action mt-4 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2D4A]"
                >
                  Create a post
                </button>
              )}
            </div>
          )}

          <span className="sr-only">
            {videoCount} videos and {photoCount} photos
          </span>
        </section>
      </main>

      {followListType && (
        <FollowListModal
          title={followListType === "followers" ? "Followers" : "Following"}
          users={followListUsers}
          loading={isFollowListLoading}
          error={followListError}
          onClose={() => setFollowListType("")}
          onSelect={(person) => {
            setFollowListType("");

            navigate(`/profile/${person._id || person.id}`);
          }}
        />
      )}

      {isEditOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-3 py-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSavingProfile)
              setIsEditOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-profile-title"
            className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-stone-200 bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] sm:p-6"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 id="edit-profile-title" className="text-xl font-bold">
                Edit Profile
              </h2>

              <button
                type="button"
                aria-label="Close edit profile"
                onClick={() => setIsEditOpen(false)}
                disabled={isSavingProfile}
                className="grid h-9 w-9 place-items-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleProfileSave} className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-gray-100">
                  {avatarPreview || (avatar && !avatarFailed) ? (
                    <img
                      src={avatarPreview || avatar}
                      alt="Profile preview"
                      className="h-full w-full object-cover transition-transform"
                      style={{
                        objectPosition: `${avatarPositionX}% ${avatarPositionY}%`,

                        transform: `scale(${avatarZoom})`,
                      }}
                      onError={() => {
                        if (!avatarPreview) setAvatarFailed(true);
                      }}
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-xl font-bold text-gray-500">
                      {getInitials(fullName)}
                    </div>
                  )}
                </div>

                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50">
                  <Upload size={15} /> Change photo
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];

                      if (file && file.size > 5 * 1024 * 1024) {
                        setProfileError("Choose an image smaller than 5 MB.");

                        event.target.value = "";

                        return;
                      }

                      setProfileError("");

                      setAvatarZoom(1);

                      setAvatarPositionX(50);

                      setAvatarPositionY(50);

                      const nextFile = file || null;
                      setAvatarFile(nextFile);
                      setAvatarPreview(
                        nextFile ? URL.createObjectURL(nextFile) : "",
                      );
                    }}
                  />
                </label>
              </div>

              {avatarPreview && (
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-sm font-semibold text-gray-800">
                    Adjust profile photo
                  </p>

                  <p className="mt-1 text-xs text-gray-500">
                    Zoom in, then move the photo to frame your face the way you
                    want.
                  </p>

                  <label className="mt-3 block text-xs font-medium text-gray-700">
                    Zoom
                    <input
                      type="range"
                      min="1"
                      max="2.5"
                      step="0.05"
                      value={avatarZoom}
                      onChange={(event) =>
                        setAvatarZoom(Number(event.target.value))
                      }
                      className="mt-2 w-full accent-black"
                    />
                  </label>

                  <label className="mt-3 block text-xs font-medium text-gray-700">
                    Horizontal position
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={avatarPositionX}
                      onChange={(event) =>
                        setAvatarPositionX(Number(event.target.value))
                      }
                      className="mt-2 w-full accent-black"
                    />
                  </label>

                  <label className="mt-3 block text-xs font-medium text-gray-700">
                    Vertical position
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={avatarPositionY}
                      onChange={(event) =>
                        setAvatarPositionY(Number(event.target.value))
                      }
                      className="mt-2 w-full accent-black"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setAvatarZoom(1);

                      setAvatarPositionX(50);

                      setAvatarPositionY(50);
                    }}
                    className="mt-3 text-xs font-semibold text-black"
                  >
                    Reset framing
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-gray-700">
                  First name
                  <input
                    required
                    maxLength={40}
                    name="firstName"
                    value={editForm.firstName}
                    onChange={updateEditField}
                    className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 px-3 text-sm outline-none focus:border-black"
                  />
                </label>

                <label className="block text-sm font-medium text-gray-700">
                  Last name
                  <input
                    required
                    maxLength={40}
                    name="lastName"
                    value={editForm.lastName}
                    onChange={updateEditField}
                    className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 px-3 text-sm outline-none focus:border-black"
                  />
                </label>
              </div>

              <label className="block text-sm font-medium text-gray-700">
                Username
                <div className="mt-1.5 flex h-11 items-center rounded-xl border border-gray-300 px-3 focus-within:border-black">
                  <span className="text-sm text-gray-400">@</span>

                  <input
                    required
                    minLength={3}
                    maxLength={24}
                    pattern="[A-Za-z0-9._]{3,24}"
                    title="Use 3–24 letters, numbers, dots, or underscores."
                    name="username"
                    value={editForm.username}
                    onChange={updateEditField}
                    className="h-full min-w-0 flex-1 border-0 bg-transparent pl-1 text-sm outline-none"
                  />
                </div>
                <span className="mt-1 block text-xs font-normal text-gray-500">
                  3–24 characters: letters, numbers, dots, or underscores.
                </span>
              </label>

              <label className="block text-sm font-medium text-gray-700">
                Bio
                <textarea
                  name="bio"
                  rows={3}
                  maxLength={160}
                  value={editForm.bio}
                  onChange={updateEditField}
                  placeholder="Tell people a little about yourself..."
                  className="mt-1.5 w-full resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
                />
                <span className="mt-1 block text-right text-xs font-normal text-gray-500">
                  {editForm.bio.length}/160
                </span>
              </label>

              <label className="block text-sm font-medium text-gray-700">
                Location{" "}
                <span className="font-normal text-gray-500">(optional)</span>
                <input
                  name="location"
                  value={editForm.location}
                  onChange={updateEditField}
                  maxLength={80}
                  placeholder="e.g. Enugu, Nigeria"
                  className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 px-3 text-sm outline-none focus:border-black"
                />
              </label>

              <label className="block text-sm font-medium text-gray-700">
                Website{" "}
                <span className="font-normal text-gray-500">(optional)</span>
                <input
                  name="website"
                  type="url"
                  value={editForm.website}
                  onChange={updateEditField}
                  maxLength={200}
                  placeholder="https://yourwebsite.com"
                  className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 px-3 text-sm outline-none focus:border-black"
                />
              </label>

              {profileError && (
                <p
                  role="alert"
                  className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {profileError}
                </p>
              )}

              {profileSuccess && (
                <p role="status" className="text-sm text-green-700">
                  {profileSuccess}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={isSavingProfile}
                  onClick={() => setIsEditOpen(false)}
                  className="h-11 rounded-full border border-gray-300 px-5 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: BRAND }}
                >
                  <Save size={16} />

                  {isSavingProfile ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {postToDelete && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/55 px-4 py-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isDeletingPost)
              setPostToDelete(null);
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-post-title"
            className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-900 shadow-2xl"
          >
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-red-50 text-red-600">
                <Trash2 size={19} />
              </span>
              <h2 id="delete-post-title" className="text-lg font-bold">
                Delete this post?
              </h2>
            </div>
            <p className="text-sm leading-6 text-neutral-600">
              This will permanently remove the post and its likes, comments, and
              saved copies. You can't undo this action.
            </p>
            {deletePostError && (
              <p
                role="alert"
                className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {deletePostError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={isDeletingPost}
                onClick={() => setPostToDelete(null)}
                className="h-10 rounded-full border border-neutral-300 px-4 text-sm font-semibold hover:bg-neutral-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingPost}
                onClick={confirmDeletePost}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-[#FF2D4A] px-4 text-sm font-semibold text-white hover:bg-[#e92742] disabled:opacity-60"
              >
                <Trash2 size={15} />
                {isDeletingPost ? "Deleting…" : "Delete post"}
              </button>
            </div>
          </section>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
