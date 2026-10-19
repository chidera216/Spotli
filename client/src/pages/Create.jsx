import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import {
  Video,
  Image as ImageIcon,
  Type,
  UploadCloud,
  X,
  Plus,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Hash,
  AtSign,
  MapPin,
  Globe,
  FileText,
  LockKeyhole,
  ArrowLeft,
} from "lucide-react";

const MAX_CAPTION_LENGTH = 2000;
const MAX_FILE_SIZE = 500 * 1024 * 1024;
const MAX_THUMBNAIL_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_DURATION = 10 * 60;

const TOPICS = [
  "ESUT",
  "Tech",
  "Study",
  "Travel",
  "Food",
  "Lifestyle",
  "Music",
];

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "Video";

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function Create() {
  const navigate = useNavigate();

  const fileInputRef = useRef(null);
  const thumbnailInputRef = useRef(null);
  const objectUrlsRef = useRef(new Set());

  const [postType, setPostType] = useState("video");
  const [media, setMedia] = useState([]);
  const [customThumbnail, setCustomThumbnail] = useState(null);
  const [caption, setCaption] = useState("");
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [visibility, setVisibility] = useState("public");
  const [allowComments, setAllowComments] = useState(true);
  const [allowDownloads, setAllowDownloads] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const [isDraftSaved, setIsDraftSaved] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));

      objectUrlsRef.current.clear();
    };
  }, []);

  const currentMedia = media[0];

  function createPreviewUrl(file) {
    const url = URL.createObjectURL(file);
    objectUrlsRef.current.add(url);

    return url;
  }

  function releasePreviewUrl(url) {
    if (!url) return;

    URL.revokeObjectURL(url);
    objectUrlsRef.current.delete(url);
  }

  function clearMedia() {
    media.forEach((item) => releasePreviewUrl(item.url));
    setMedia([]);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function clearCustomThumbnail() {
    setCustomThumbnail((current) => {
      if (current) releasePreviewUrl(current.url);
      return null;
    });

    if (thumbnailInputRef.current) {
      thumbnailInputRef.current.value = "";
    }
  }

  function switchPostType(type) {
    if (type === postType) return;

    clearMedia();
    clearCustomThumbnail();

    setPostType(type);
    setNotice("");
    setIsDraftSaved(false);
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handleFiles(fileList) {
    setNotice("");
    setIsDraftSaved(false);

    const incomingFiles = Array.from(fileList || []);

    if (!incomingFiles.length) return;

    const acceptedFiles = [];

    for (const file of incomingFiles) {
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");

      if (postType === "video" && !isVideo) {
        setNotice("Video mode accepts video files only.");
        continue;
      }

      if (postType === "photo" && !isImage) {
        setNotice("Photo mode accepts image files only.");
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        setNotice(`${file.name} exceeds the 500 MB size limit.`);
        continue;
      }

      if (
        postType === "video" &&
        !["video/mp4", "video/quicktime", "video/webm"].includes(file.type)
      ) {
        setNotice("Use MP4, MOV, or WebM video files.");
        continue;
      }

      if (
        postType === "photo" &&
        !["image/jpeg", "image/png", "image/webp"].includes(file.type)
      ) {
        setNotice("Use JPG, PNG, or WebP images.");
        continue;
      }

      acceptedFiles.push(file);
    }

    if (!acceptedFiles.length) return;

    const availableSlots =
      postType === "video"
        ? Math.max(0, 1 - media.length)
        : Math.max(0, 10 - media.length);

    if (!availableSlots) {
      setNotice(
        postType === "video"
          ? "Remove the current video before selecting another."
          : "You can add up to 10 photos to one post.",
      );

      return;
    }

    const filesToAdd = acceptedFiles.slice(0, availableSlots);

    const newMedia = filesToAdd.map((file) => ({
      id: crypto.randomUUID(),
      file,
      url: createPreviewUrl(file),
      name: file.name,
      type: postType,
      duration: null,
    }));

    setMedia((current) => [...current, ...newMedia]);

    if (acceptedFiles.length > filesToAdd.length) {
      setNotice(
        "Some files were not added because the selection limit was reached.",
      );
    }
  }

  function handleVideoMetadata(id, event) {
    const duration = event.currentTarget.duration;

    setMedia((current) =>
      current.map((item) => (item.id === id ? { ...item, duration } : item)),
    );

    if (duration > MAX_VIDEO_DURATION) {
      setNotice("Videos must be 10 minutes or shorter.");
    }
  }

  function removeMedia(id) {
    const removedItem = media.find((item) => item.id === id);

    if (removedItem) {
      releasePreviewUrl(removedItem.url);
    }

    setMedia((current) => current.filter((item) => item.id !== id));

    setNotice("");
  }

  function moveMedia(index, direction) {
    const destination = index + direction;

    if (destination < 0 || destination >= media.length) return;

    setMedia((current) => {
      const reordered = [...current];

      [reordered[index], reordered[destination]] = [
        reordered[destination],
        reordered[index],
      ];

      return reordered;
    });
  }

  function handleThumbnailChange(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setNotice("Choose a JPG, PNG, or WebP thumbnail.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_THUMBNAIL_SIZE) {
      setNotice("Your thumbnail must be 10 MB or smaller.");
      event.target.value = "";
      return;
    }

    const url = createPreviewUrl(file);

    setCustomThumbnail((current) => {
      if (current) releasePreviewUrl(current.url);

      return { file, url };
    });

    setNotice("");
    setIsDraftSaved(false);
    event.target.value = "";
  }

  function toggleTopic(topic) {
    setSelectedTopics((current) =>
      current.includes(topic)
        ? current.filter((item) => item !== topic)
        : [...current, topic],
    );

    setIsDraftSaved(false);
  }

  function insertCaptionText(value) {
    setCaption(
      (current) =>
        `${current}${current && !current.endsWith(" ") ? " " : ""}${value}`,
    );

    setIsDraftSaved(false);
  }

  function saveDraft() {
    setIsDraftSaved(true);

    setNotice(
      "Draft preview saved for this session. Persistent draft storage is not connected yet.",
    );
  }

  async function publishPost() {
    if (isPublishing) return;

    if (postType === "text") {
      setNotice("Text-only publishing is not supported by the backend yet.");
      return;
    }

    if (media.length === 0) {
      setNotice("Select at least one media file before publishing.");
      return;
    }

    if (
      postType === "video" &&
      media.some(
        (item) => item.duration !== null && item.duration > MAX_VIDEO_DURATION,
      )
    ) {
      setNotice("Please choose a video that is 10 minutes or shorter.");
      return;
    }

    if (media.some((item) => item.file.size > MAX_FILE_SIZE)) {
      setNotice("Each media file must be 500 MB or smaller.");
      return;
    }

    if (caption.length > MAX_CAPTION_LENGTH) {
      setNotice("Your caption is too long.");
      return;
    }

    const formData = new FormData();

    media.forEach((item) => {
      formData.append("media", item.file);
    });

    if (postType === "video" && customThumbnail) {
      formData.append("thumbnail", customThumbnail.file);
    }

    formData.append("caption", caption);

    setIsPublishing(true);
    setNotice("");

    try {
      const result = await api.posts.create(formData);

      setIsDraftSaved(false);
      clearMedia();
      clearCustomThumbnail();
      setCaption("");
      setSelectedTopics([]);

      navigate("/home", {
        replace: true,
        state: {
          refreshFeed: true,
          postPublished: true,
          message: result.message || "Post published successfully.",
        },
      });
    } catch (error) {
      setNotice(error.message || "Unable to publish your post.");
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <div className="min-h-screen w-full min-w-0 bg-white text-gray-950">
      <main className="ml-0 min-h-screen w-full min-w-0">
        {/* Mobile and tablet back arrow */}
        <div className="px-3 pt-4 sm:px-5 sm:hidden">
          <button
            type="button"
            onClick={() => navigate("/home", { replace: true })}
            aria-label="Go back to Home"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-900 transition hover:bg-gray-100 active:scale-95"
          >
            <ArrowLeft size={21} />
          </button>
        </div>

        <div className="grid w-full min-w-0 grid-cols-1 items-start gap-5 px-3 py-4 sm:gap-6 sm:px-5 sm:py-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:gap-6 lg:px-6">
          <section className="min-w-0">
            <div className="mb-6">
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Create a post
              </h1>

              <p className="mt-2 text-sm text-gray-500 sm:text-base">
                Share your story with the Spotli community.
              </p>
            </div>

            {/* Post type */}
            <div className="mb-5 flex flex-wrap gap-2">
              {[
                { id: "video", label: "Video", Icon: Video },
                { id: "photo", label: "Photo", Icon: ImageIcon },
                { id: "text", label: "Text", Icon: Type },
              ].map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => switchPostType(id)}
                  className={`inline-flex min-w-32 items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-medium transition ${
                    postType === id
                      ? "border-black bg-black text-white"
                      : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50"
                  }`}
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </div>

            {/* Mobile and tablet: tap to upload */}
            {postType !== "text" && (
              <div className="rounded-2xl border border-gray-200 bg-gray-50/50 px-5 py-8 text-center lg:hidden">
                <UploadCloud
                  size={40}
                  strokeWidth={1.5}
                  className="mx-auto mb-3 text-gray-800"
                />

                <h2 className="text-base font-semibold">
                  Upload {postType === "video" ? "a video" : "photos"}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  {postType === "video"
                    ? "MP4, MOV, WebM · Up to 10 minutes · Max 500 MB"
                    : "JPG, PNG, WebP · Up to 10 images · Max 500 MB per file"}
                </p>

                <button
                  type="button"
                  onClick={openFilePicker}
                  className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-red-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-600 active:scale-[0.98]"
                >
                  <UploadCloud size={18} />
                  Tap to upload
                </button>
              </div>
            )}

            {/* Desktop: drag and drop */}
            {postType !== "text" && (
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setIsDragging(false);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  handleFiles(event.dataTransfer.files);
                }}
                className={`hidden rounded-2xl border border-dashed px-5 py-10 text-center transition sm:px-8 lg:block ${
                  isDragging
                    ? "border-red-400 bg-red-50"
                    : "border-gray-300 bg-gray-50/40"
                }`}
              >
                <UploadCloud
                  size={43}
                  strokeWidth={1.5}
                  className="mx-auto mb-4 text-gray-800"
                />

                <h2 className="text-base font-semibold">
                  Drag and drop your {postType === "video" ? "video" : "photos"}{" "}
                  here
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  or{" "}
                  <button
                    type="button"
                    onClick={openFilePicker}
                    className="font-medium text-red-500 underline underline-offset-2"
                  >
                    browse files
                  </button>
                </p>

                <p className="mt-3 text-xs text-gray-500">
                  {postType === "video"
                    ? "MP4, MOV, WebM · Up to 10 minutes · Max 500 MB"
                    : "JPG, PNG, WebP · Up to 10 images · Max 500 MB per file"}
                </p>
              </div>
            )}

            {/* Shared file input */}
            {postType !== "text" && (
              <input
                ref={fileInputRef}
                type="file"
                accept={
                  postType === "video"
                    ? "video/mp4,video/quicktime,video/webm"
                    : "image/jpeg,image/png,image/webp"
                }
                multiple={postType === "photo"}
                className="hidden"
                onChange={(event) => {
                  handleFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            )}

            {/* Selected media */}
            {media.length > 0 && (
              <section className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">
                    Selected {postType === "video" ? "video" : "photos"}
                  </h2>

                  <span className="text-xs text-gray-500">
                    {media.length} selected
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {media.map((item, index) => (
                    <div
                      key={item.id}
                      className="group relative min-w-0 overflow-hidden rounded-xl border border-gray-200"
                    >
                      {item.type === "video" ? (
                        <video
                          src={item.url}
                          onLoadedMetadata={(event) =>
                            handleVideoMetadata(item.id, event)
                          }
                          className="aspect-[4/3] w-full bg-gray-100 object-cover"
                          muted
                          playsInline
                        />
                      ) : (
                        <img
                          src={item.url}
                          alt={item.name}
                          className="aspect-[4/3] w-full bg-gray-100 object-cover"
                        />
                      )}

                      <button
                        type="button"
                        onClick={() => removeMedia(item.id)}
                        aria-label={`Remove ${item.name}`}
                        className="absolute right-2 top-2 rounded-full bg-black/75 p-1.5 text-white hover:bg-red-500"
                      >
                        <X size={15} />
                      </button>

                      {item.type === "video" && (
                        <span className="absolute bottom-2 left-2 rounded bg-black/75 px-2 py-1 text-xs text-white">
                          {formatDuration(item.duration)}
                        </span>
                      )}

                      {item.type === "photo" && (
                        <div className="flex items-center justify-between gap-1 p-2">
                          <span className="truncate text-xs text-gray-500">
                            {item.name}
                          </span>

                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => moveMedia(index, -1)}
                              aria-label="Move photo earlier"
                              className="rounded border border-gray-200 px-2 py-1 text-xs disabled:opacity-30"
                            >
                              ←
                            </button>

                            <button
                              type="button"
                              disabled={index === media.length - 1}
                              onClick={() => moveMedia(index, 1)}
                              aria-label="Move photo later"
                              className="rounded border border-gray-200 px-2 py-1 text-xs disabled:opacity-30"
                            >
                              →
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {postType === "photo" && media.length < 10 && (
                    <button
                      type="button"
                      onClick={openFilePicker}
                      className="flex aspect-[4/3] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-gray-500 hover:bg-gray-100"
                    >
                      <Plus size={28} />
                      <span className="mt-1 text-xs">Add more</span>
                    </button>
                  )}
                </div>
              </section>
            )}

            {/* Custom video thumbnail */}
            {postType === "video" && media.length > 0 && (
              <section className="mt-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">Video thumbnail</h2>

                    <p className="mt-1 text-xs text-gray-500">
                      Choose the cover people will see before playing your
                      video.
                    </p>
                  </div>

                  <span className="shrink-0 text-xs text-gray-400">
                    Optional
                  </span>
                </div>

                <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 p-4 sm:flex-row sm:items-center">
                  <div className="flex h-36 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100">
                    {customThumbnail ? (
                      <img
                        src={customThumbnail.url}
                        alt="Custom video thumbnail"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="px-2 text-center">
                        <Video size={25} className="mx-auto text-gray-400" />

                        <p className="mt-2 text-xs text-gray-500">
                          No cover selected
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="wrap-break-word text-sm font-semibold">
                      {customThumbnail
                        ? customThumbnail.file.name
                        : "Upload a custom cover"}
                    </p>

                    <p className="mt-1 text-xs text-gray-500">
                      JPG, PNG, or WebP · Maximum 10 MB
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => thumbnailInputRef.current?.click()}
                        className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                      >
                        {customThumbnail ? "Change thumbnail" : "Choose image"}
                      </button>

                      {customThumbnail && (
                        <button
                          type="button"
                          onClick={clearCustomThumbnail}
                          className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <input
                      ref={thumbnailInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleThumbnailChange}
                      className="hidden"
                    />
                  </div>
                </div>
              </section>
            )}

            {/* Caption */}
            <section className="mt-6">
              <label
                htmlFor="post-caption"
                className="mb-2 block text-sm font-semibold"
              >
                {postType === "text" ? "Your post" : "Caption"}
              </label>

              <textarea
                id="post-caption"
                value={caption}
                onChange={(event) => {
                  setCaption(event.target.value.slice(0, MAX_CAPTION_LENGTH));
                  setIsDraftSaved(false);
                }}
                maxLength={MAX_CAPTION_LENGTH}
                rows={4}
                placeholder={
                  postType === "text"
                    ? "Share your thoughts with the community..."
                    : "Write a caption..."
                }
                className="w-full resize-y rounded-xl border border-gray-200 bg-white p-4 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-400"
              />

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1">
                  {[
                    { label: "Hashtag", Icon: Hash, value: "#" },
                    { label: "Mention", Icon: AtSign, value: "@" },
                    { label: "Location", Icon: MapPin, value: "" },
                  ].map(({ label, Icon, value }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => insertCaptionText(value)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      <Icon size={14} />
                      {label}
                    </button>
                  ))}
                </div>

                <span className="text-xs text-gray-400">
                  {caption.length} / {MAX_CAPTION_LENGTH}
                </span>
              </div>
            </section>

            {/* Topics */}
            <section className="mt-6">
              <h2 className="mb-3 text-sm font-semibold">
                Add a topic{" "}
                <span className="font-normal text-gray-400">(optional)</span>
              </h2>

              <div className="flex flex-wrap gap-2">
                {TOPICS.map((topic) => {
                  const selected = selectedTopics.includes(topic);

                  return (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => toggleTopic(topic)}
                      className={`rounded-full border px-4 py-2 text-sm transition ${
                        selected
                          ? "border-black bg-black text-white"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {selected ? "✓ " : ""}
                      {topic}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Mobile settings */}
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
              <label className="rounded-xl border border-gray-200 p-3">
                <span className="mb-2 block text-xs font-semibold">
                  Visibility
                </span>

                <select
                  value={visibility}
                  onChange={(event) => setVisibility(event.target.value)}
                  className="w-full bg-transparent text-sm outline-none"
                >
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
              </label>

              <div className="rounded-xl border border-gray-200 p-3">
                <span className="mb-3 block text-xs font-semibold">
                  Comments
                </span>

                <Toggle
                  label="Allow comments"
                  checked={allowComments}
                  onChange={setAllowComments}
                />
              </div>
            </div>

            {/* Feedback */}
            {notice && (
              <div
                role="status"
                className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700"
              >
                {notice}
              </div>
            )}

            {isDraftSaved && (
              <p className="mt-2 text-xs text-green-700">
                Draft preview saved for this session.
              </p>
            )}

            {/* Actions */}
            <div className="mt-7 flex flex-col gap-3 pb-10 sm:flex-row">
              <button
                type="button"
                onClick={publishPost}
                disabled={isPublishing}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-black px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <UploadCloud size={18} />
                {isPublishing ? "Publishing..." : "Publish post"}
              </button>

              <button
                type="button"
                onClick={saveDraft}
                className="flex items-center justify-center gap-2 rounded-full border border-gray-200 px-6 py-3.5 text-sm font-medium hover:bg-gray-50"
              >
                <FileText size={18} />
                Save draft
              </button>
            </div>

            <p className="mb-8 flex items-center justify-center gap-2 text-center text-xs text-gray-400">
              <LockKeyhole size={14} />
              Publishing and persistent drafts will be connected to the backend
              later.
            </p>
          </section>

          {/* Desktop preview and settings */}
          <aside className="hidden min-w-0 space-y-4 lg:block">
            <section className="rounded-2xl border border-gray-100 p-5 shadow-sm">
              <h2 className="text-base font-bold">Post preview</h2>

              <p className="mt-1 text-xs text-gray-500">
                This is how your post will appear to others.
              </p>

              <div className="mx-auto mt-4 w-full max-w-[500px] overflow-hidden rounded-2xl border border-gray-200 bg-black text-white">
                {postType === "video" ? (
                  currentMedia ? (
                    <video
                      src={currentMedia.url}
                      poster={customThumbnail?.url}
                      playsInline
                      className="max-h-[460px] w-full bg-black object-contain"
                    />
                  ) : (
                    <div className="flex aspect-[9/16] max-h-[460px] flex-col items-center justify-center bg-gray-950 px-6 text-center">
                      <Video size={40} strokeWidth={1.5} />

                      <p className="mt-4 text-sm font-semibold">
                        Your video preview
                      </p>

                      <p className="mt-2 text-xs text-gray-400">
                        Select a video to see how your post will look.
                      </p>
                    </div>
                  )
                ) : postType === "photo" ? (
                  currentMedia ? (
                    <div className="bg-white text-gray-950">
                      <img
                        src={currentMedia.url}
                        alt="Selected post preview"
                        className="aspect-[4/5] max-h-[460px] w-full object-contain"
                      />

                      {media.length > 1 && (
                        <div className="flex items-center justify-center gap-2 border-b border-gray-100 p-2">
                          {media.map((item, index) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => moveMedia(index, 0)}
                              className={`h-2 w-2 rounded-full ${
                                item.id === currentMedia.id
                                  ? "bg-black"
                                  : "bg-gray-300"
                              }`}
                              aria-label={`Photo ${index + 1}`}
                            />
                          ))}
                        </div>
                      )}

                      <div className="p-3">
                        <div className="mb-2 flex items-center gap-3">
                          <Heart size={20} />
                          <MessageCircle size={20} />
                          <Share2 size={20} />
                          <Bookmark size={20} className="ml-auto" />
                        </div>

                        <p className="text-sm font-semibold">@yourhandle</p>

                        <p className="mt-1 whitespace-pre-wrap text-sm">
                          {caption || "Your caption will appear here."}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex aspect-[4/5] max-h-[460px] flex-col items-center justify-center bg-gray-50 px-6 text-center text-gray-500">
                      <ImageIcon size={40} strokeWidth={1.5} />

                      <p className="mt-4 text-sm font-semibold text-gray-800">
                        Your photo preview
                      </p>

                      <p className="mt-2 text-xs">
                        Select one or more photos to preview your post.
                      </p>
                    </div>
                  )
                ) : (
                  <div className="flex min-h-64 flex-col justify-end bg-gray-950 p-5">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 font-bold">
                        S
                      </div>

                      <span className="text-sm font-semibold">@yourhandle</span>
                    </div>

                    <p className="whitespace-pre-wrap text-sm">
                      {caption || "Your text post will appear here."}
                    </p>
                  </div>
                )}
              </div>

              {postType === "video" && customThumbnail && (
                <p className="mt-3 text-center text-xs text-gray-500">
                  Custom thumbnail selected
                </p>
              )}
            </section>

            {/* Post settings */}
            <section className="rounded-2xl border border-gray-100 p-5 shadow-sm">
              <h2 className="mb-4 text-base font-bold">Post settings</h2>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold">
                  Visibility
                </span>

                <span className="flex items-center gap-3 rounded-xl border border-gray-200 p-3">
                  <Globe size={20} className="shrink-0 text-gray-600" />

                  <select
                    value={visibility}
                    onChange={(event) => setVisibility(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  >
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </span>
              </label>

              <div className="mt-4 space-y-4">
                <Toggle
                  label="Allow comments"
                  checked={allowComments}
                  onChange={setAllowComments}
                />

                <Toggle
                  label="Allow downloads"
                  checked={allowDownloads}
                  onChange={setAllowDownloads}
                />
              </div>

              <p className="mt-5 border-t border-gray-100 pt-4 text-xs text-gray-500">
                These settings are currently preview-only.
              </p>
            </section>

            {selectedTopics.length > 0 && (
              <section className="rounded-2xl border border-gray-100 p-5">
                <h2 className="mb-3 text-sm font-bold">Selected topics</h2>

                <div className="flex flex-wrap gap-2">
                  {selectedTopics.map((topic) => (
                    <span
                      key={topic}
                      className="rounded-full bg-gray-100 px-3 py-1.5 text-xs"
                    >
                      #{topic}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
      <span className="text-gray-700">{label}</span>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-red-500" : "bg-gray-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}

export default Create;
