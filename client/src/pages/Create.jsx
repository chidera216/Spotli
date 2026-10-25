import { useEffect, useRef, useState } from "react";

import { useNavigate } from "react-router-dom";

import api from "../services/api";

import MentionField from "../components/MentionField";

import {
  Video,
  Image as ImageIcon,
  Type,
  UploadCloud,
  X,
  Plus,
  Heart,
  Hash,
  AtSign,
  MapPin,
  Globe,
  FileText,
  ArrowLeft,
  LoaderCircle,
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

  const replaceIndexRef = useRef(null);

  const processingTimerRef = useRef(null);

  const activeUploadRequestsRef = useRef(new Set());

  const cancelUploadRequestedRef = useRef(false);

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

  const [uploadProgress, setUploadProgress] = useState(0);

  const [isDraftSaved, setIsDraftSaved] = useState(false);

  const [isPublishing, setIsPublishing] = useState(false);

  const [isProcessingFiles, setIsProcessingFiles] = useState(false);

  const [processingProgress, setProcessingProgress] = useState(0);

  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    let cancelled = false;

    api.auth

      .me()

      .then((result) => {
        if (!cancelled) setCurrentUser(result.user || result);
      })

      .catch(() => {});

    return () => {
      cancelled = true;

      if (processingTimerRef.current) clearTimeout(processingTimerRef.current);

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

    replaceIndexRef.current = null;

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

  function showProcessingProgress() {
    if (processingTimerRef.current) clearTimeout(processingTimerRef.current);

    setIsProcessingFiles(true);

    setProcessingProgress(18);

    requestAnimationFrame(() => {
      setProcessingProgress(68);

      requestAnimationFrame(() => {
        setProcessingProgress(100);

        processingTimerRef.current = setTimeout(() => {
          setIsProcessingFiles(false);

          setProcessingProgress(0);
        }, 350);
      });
    });
  }

  function openReplacePicker(index) {
    replaceIndexRef.current = index;

    fileInputRef.current?.click();
  }

  function formatFileSize(bytes) {
    if (!Number.isFinite(bytes)) return "";

    if (bytes < 1024 * 1024)
      return `${Math.max(1, Math.round(bytes / 1024))} KB`;

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

    if (!acceptedFiles.length) {
      replaceIndexRef.current = null;

      return;
    }

    if (replaceIndexRef.current !== null) {
      const targetIndex = replaceIndexRef.current;

      replaceIndexRef.current = null;

      const file = acceptedFiles[0];

      const replacement = {
        id: crypto.randomUUID(),

        file,

        url: createPreviewUrl(file),

        name: file.name,

        type: postType,

        duration: null,
      };

      setMedia((current) => {
        const next = [...current];

        const old = next[targetIndex];

        if (old) releasePreviewUrl(old.url);

        if (targetIndex >= 0 && targetIndex < next.length)
          next[targetIndex] = replacement;
        else next.push(replacement);

        return next;
      });

      showProcessingProgress();

      return;
    }

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

    showProcessingProgress();

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
    setSelectedTopics((current) => (current[0] === topic ? [] : [topic]));

    setIsDraftSaved(false);
  }

  function insertCaptionText(value) {
    const field = document.getElementById("post-caption");

    if (value === "LOCATION") {
      const location = window.prompt("Enter a location");

      if (!location?.trim()) return;

      value = location.trim();
    }

    const current = caption;

    const start = field?.selectionStart ?? current.length;

    const end = field?.selectionEnd ?? start;

    const prefix = current.slice(0, start);

    const suffix = current.slice(end);

    const needsSpaceBefore =
      prefix.length > 0 &&
      !/\s$/.test(prefix) &&
      value !== "#" &&
      value !== "@";

    const insertion = `${needsSpaceBefore ? " " : ""}${value}`;

    const next = `${prefix}${insertion}${suffix}`.slice(0, MAX_CAPTION_LENGTH);

    setCaption(next);

    setIsDraftSaved(false);

    requestAnimationFrame(() => {
      const nextField = document.getElementById("post-caption");

      if (!nextField) return;

      const cursor = Math.min(prefix.length + insertion.length, next.length);

      nextField.focus();

      nextField.setSelectionRange(cursor, cursor);
    });
  }

  function saveDraft() {
    setIsDraftSaved(true);

    setNotice(
      "Draft preview saved for this session. Persistent draft storage is not connected yet.",
    );
  }

  async function uploadToCloudinary(file, resourceType, onProgress) {
    if (cancelUploadRequestedRef.current) {
      throw new Error("UPLOAD_CANCELLED");
    }

    const signature = await api.posts.createUploadSignature({
      resourceType,
      folder: "spotli/posts",
      fileSize: file.size,
    });

    // If cancellation happened while the server was signing the upload,
    // don't start sending the file afterward.
    if (cancelUploadRequestedRef.current) {
      throw new Error("UPLOAD_CANCELLED");
    }

    const uploadForm = new FormData();
    uploadForm.append("file", file);
    uploadForm.append("api_key", signature.apiKey);
    uploadForm.append("timestamp", String(signature.timestamp));
    uploadForm.append("signature", signature.signature);
    uploadForm.append("folder", signature.folder);
    uploadForm.append("public_id", signature.publicId);

    // XMLHttpRequest exposes real upload progress; fetch does not provide
    // portable upload-progress events in browsers.
    const uploadedAsset = await new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      activeUploadRequestsRef.current.add(request);
      const removeRequest = () =>
        activeUploadRequestsRef.current.delete(request);
      request.open(
        "POST",
        `https://api.cloudinary.com/v1_1/${signature.cloudName}/${signature.resourceType}/upload`,
      );
      request.responseType = "json";

      request.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable && typeof onProgress === "function") {
          onProgress(
            Math.min(100, Math.round((event.loaded / event.total) * 100)),
          );
        }
      });

      request.addEventListener("load", () => {
        removeRequest();
        const result = request.response || {};
        if (
          request.status < 200 ||
          request.status >= 300 ||
          !result.public_id ||
          !result.resource_type
        ) {
          reject(
            new Error(
              result.error?.message ||
                "Media upload failed. Please check your connection and try again.",
            ),
          );
          return;
        }
        resolve(result);
      });

      request.addEventListener("error", () => {
        removeRequest();
        reject(
          new Error(
            "Network error while uploading media. Check your connection and try again.",
          ),
        );
      });
      request.addEventListener("abort", () => {
        removeRequest();
        reject(new Error("UPLOAD_CANCELLED"));
      });
      request.send(uploadForm);
    });

    if (typeof onProgress === "function") onProgress(100);

    return {
      public_id: uploadedAsset.public_id,
      resource_type: uploadedAsset.resource_type,
    };
  }

  async function publishPost() {
    if (isPublishing) return;

    if (postType === "text" && !caption.trim()) {
      setNotice("Write something before publishing your text post.");
      return;
    }

    if (postType === "text") {
      setNotice(
        "Text-only posts are not supported by the current publishing API yet. Your text preview is ready, but publishing needs backend support.",
      );
      return;
    }

    if (postType !== "text" && media.length === 0) {
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

    if (customThumbnail && customThumbnail.file.size > MAX_THUMBNAIL_SIZE) {
      setNotice("Your custom thumbnail must be 10 MB or smaller.");
      return;
    }

    setIsPublishing(true);
    cancelUploadRequestedRef.current = false;
    setUploadProgress(0);
    setNotice("");

    let cleanupCompressedVideo = null;

    try {
      const resourceType = postType === "photo" ? "image" : "video";
      let mediaAssets = [];
      let videoFileToUpload = null;

      if (postType === "video") {
        const originalVideoFile = media[0].file;
        videoFileToUpload = originalVideoFile;

        // Compress larger videos before sending them to Cloudinary. The helper
        // falls back to the original when this browser cannot safely transcode.
        if (originalVideoFile.size >= 12 * 1024 * 1024) {
          setUploadProgress(0);
          setNotice("Optimizing video… 0%");

          try {
            const { compressVideoForUpload } =
              await import("../utils/videoCompression.js");
            const compressionResult = await compressVideoForUpload(
              originalVideoFile,
              {
                shouldCancel: () => cancelUploadRequestedRef.current,
                onProgress: (progress) => {
                  if (cancelUploadRequestedRef.current) return;
                  setUploadProgress(progress);
                  setNotice(`Optimizing video… ${progress}%`);
                },
              },
            );

            if (cancelUploadRequestedRef.current) {
              await compressionResult.cleanup?.();
              throw new Error("UPLOAD_CANCELLED");
            }

            videoFileToUpload = compressionResult.file;
            cleanupCompressedVideo = compressionResult.cleanup || null;

            if (compressionResult.compressed) {
              setUploadProgress(0);
              setNotice(
                `Video reduced from ${formatFileSize(originalVideoFile.size)} to ${formatFileSize(videoFileToUpload.size)}. Uploading video… 0%`,
              );
            } else {
              setUploadProgress(0);
              setNotice(
                `${compressionResult.reason || "Video kept in its original format."} Uploading video… 0%`,
              );
            }
          } catch (compressionError) {
            if (
              cancelUploadRequestedRef.current ||
              compressionError?.message === "UPLOAD_CANCELLED"
            ) {
              throw new Error("UPLOAD_CANCELLED");
            }
            console.warn(
              "Spotli video optimization failed; uploading the original video.",
              compressionError,
            );
            videoFileToUpload = originalVideoFile;
            setUploadProgress(0);
            setNotice(
              "Video optimization failed. Uploading the original video… 0%",
            );
          }
        }
      }

      if (postType === "photo" && media.length > 1) {
        // Upload up to three photos at once to reduce total waiting time
        // without starting ten large uploads simultaneously.
        const progressByIndex = media.map(() => 0);
        const assetsByIndex = new Array(media.length);
        let nextIndex = 0;

        const updateCombinedProgress = () => {
          const totalBytes = media.reduce(
            (sum, item) => sum + item.file.size,
            0,
          );
          const completedBytes = media.reduce(
            (sum, item, index) =>
              sum + item.file.size * (progressByIndex[index] / 100),
            0,
          );
          const combined = totalBytes
            ? Math.min(100, Math.round((completedBytes / totalBytes) * 100))
            : 0;
          setUploadProgress(combined);
          setNotice(`Uploading photos… ${combined}%`);
        };

        const worker = async () => {
          while (true) {
            if (cancelUploadRequestedRef.current)
              throw new Error("UPLOAD_CANCELLED");
            const index = nextIndex;
            nextIndex += 1;
            if (index >= media.length) return;

            assetsByIndex[index] = await uploadToCloudinary(
              media[index].file,
              resourceType,
              (progress) => {
                progressByIndex[index] = progress;
                updateCombinedProgress();
              },
            );
          }
        };

        setNotice(`Uploading ${media.length} photos… 0%`);
        await Promise.all(
          Array.from({ length: Math.min(3, media.length) }, () => worker()),
        );
        mediaAssets = assetsByIndex;
      } else {
        for (let index = 0; index < media.length; index += 1) {
          setUploadProgress(0);
          const uploadLabel =
            postType === "photo" ? "Uploading photo" : "Uploading video";
          setNotice(`${uploadLabel}… 0%`);
          mediaAssets.push(
            await uploadToCloudinary(
              postType === "video" ? videoFileToUpload : media[index].file,
              resourceType,
              (progress) => {
                setUploadProgress(progress);
                setNotice(`${uploadLabel}… ${progress}%`);
              },
            ),
          );
        }
      }

      let thumbnailAsset;
      if (postType === "video" && customThumbnail) {
        setUploadProgress(0);
        setNotice("Uploading thumbnail… 0%");
        thumbnailAsset = await uploadToCloudinary(
          customThumbnail.file,
          "image",
          (progress) => {
            setUploadProgress(progress);
            setNotice(`Uploading thumbnail… ${progress}%`);
          },
        );
      }

      if (cancelUploadRequestedRef.current) throw new Error("UPLOAD_CANCELLED");

      setUploadProgress(0);
      setNotice("Publishing your post…");
      const result = await api.posts.createWithAssets({
        type: postType,
        caption,
        mediaAssets,
        ...(thumbnailAsset ? { thumbnailAsset } : {}),
      });

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
      // Stop any other concurrent photo uploads if one request fails or is cancelled.
      activeUploadRequestsRef.current.forEach((request) => request.abort());
      if (
        cancelUploadRequestedRef.current ||
        error.message === "UPLOAD_CANCELLED"
      ) {
        setNotice("Upload cancelled. Your post was not published.");
      } else {
        setNotice(error.message || "Unable to publish your post.");
      }
    } finally {
      if (typeof cleanupCompressedVideo === "function") {
        try {
          await cleanupCompressedVideo();
        } catch (cleanupError) {
          console.warn("Temporary video cleanup failed:", cleanupError);
        }
      }
      activeUploadRequestsRef.current.clear();
      cancelUploadRequestedRef.current = false;
      setIsPublishing(false);
    }
  }

  function cancelUpload() {
    if (
      !isPublishing ||
      !(
        /Uploading (video|photo|photos|media|thumbnail)/i.test(notice) ||
        /Optimizing video/i.test(notice)
      )
    ) {
      return;
    }

    cancelUploadRequestedRef.current = true;
    activeUploadRequestsRef.current.forEach((request) => request.abort());
    setNotice("Cancelling upload…");
  }

  const displayName =
    [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(" ") ||
    currentUser?.name ||
    currentUser?.username ||
    "You";

  const username = currentUser?.username
    ? `@${currentUser.username}`
    : "@yourhandle";

  const avatar =
    currentUser?.avatar ||
    currentUser?.profilePicture ||
    currentUser?.profileImage;

  function renderPreviewCard() {
    const hasText = Boolean(caption.trim());

    const hasMedia = Boolean(currentMedia);

    const empty = postType === "text" ? !hasText : !hasMedia;

    return (
      <div className="mx-auto mt-4 w-full max-w-[360px]">
        <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl bg-[#101010] text-white shadow-sm">
          {!empty && postType === "video" && currentMedia && (
            <video
              key={currentMedia.id}
              src={currentMedia.url}
              poster={customThumbnail?.url}
              playsInline
              muted
              autoPlay
              loop
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}

          {!empty && postType === "photo" && currentMedia && (
            <img
              src={currentMedia.url}
              alt="Selected post preview"
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}

          {!empty && postType === "text" && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#292929] via-[#111111] to-[#3b1520] p-7 text-center">
              <p className="whitespace-pre-wrap break-words text-xl font-semibold leading-relaxed">
                {caption}
              </p>
            </div>
          )}

          {empty && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#101010] text-center text-white/75">
              {postType === "video" ? (
                <Video size={34} strokeWidth={1.5} />
              ) : postType === "photo" ? (
                <ImageIcon size={34} strokeWidth={1.5} />
              ) : (
                <Type size={34} strokeWidth={1.5} />
              )}

              <p className="text-sm font-medium">Preview appears here</p>
            </div>
          )}

          {!empty && postType !== "text" && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-4 pb-4 pt-20">
              <div className="flex items-center gap-2.5">
                {avatar ? (
                  <img
                    src={avatar}
                    alt=""
                    className="h-9 w-9 rounded-full border border-white/40 object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-white/15 text-sm font-bold">
                    {displayName.slice(0, 1).toUpperCase()}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {displayName}
                  </p>

                  <p className="truncate text-xs text-white/75">{username}</p>
                </div>
              </div>

              {caption.trim() && (
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-snug">
                  {caption}
                </p>
              )}

              <div className="mt-3 flex items-center gap-1.5 self-start rounded-full bg-black/55 px-2.5 py-1.5 text-xs font-semibold backdrop-blur-sm">
                <Heart size={14} fill="currentColor" /> 0
              </div>
            </div>
          )}

          {!empty && postType === "text" && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-4 pb-4 pt-14">
              <div className="flex items-center gap-2.5">
                {avatar ? (
                  <img
                    src={avatar}
                    alt=""
                    className="h-9 w-9 rounded-full border border-white/40 object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm font-bold">
                    {displayName.slice(0, 1).toUpperCase()}
                  </span>
                )}

                <div>
                  <p className="text-sm font-semibold">{displayName}</p>

                  <p className="text-xs text-white/75">{username}</p>
                </div>

                <span className="ml-auto flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-xs">
                  <Heart size={13} /> 0
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
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

              <p className="mt-2 text-sm text-gray-600 sm:text-base">
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

            {/* Responsive upload dropzone */}

            {postType !== "text" && (
              <div
                onDragOver={(event) => {
                  event.preventDefault();

                  setIsDragging(true);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget))
                    setIsDragging(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();

                  setIsDragging(false);

                  handleFiles(event.dataTransfer.files);
                }}
                className={`rounded-2xl border border-dashed px-4 py-7 text-center transition sm:px-8 sm:py-10 ${isDragging ? "border-red-400 bg-red-50 ring-2 ring-red-100" : "border-gray-300 bg-gray-50/40 hover:border-gray-400"}`}
              >
                <UploadCloud
                  size={40}
                  strokeWidth={1.5}
                  className="mx-auto mb-3 text-gray-800"
                />

                <h2 className="text-base font-semibold">
                  <span className="lg:hidden">
                    Upload your {postType === "video" ? "video" : "photos"}
                  </span>
                  <span className="hidden lg:inline">
                    Browse or drag and drop your{" "}
                    {postType === "video" ? "video" : "photos"} here
                  </span>
                </h2>

                <div className="mt-3 flex justify-center lg:hidden">
                  <button
                    type="button"
                    onClick={openFilePicker}
                    className="inline-flex min-h-11 min-w-32 items-center justify-center gap-2 rounded-full bg-[#FF2D4A] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#e92742] active:scale-[0.98]"
                  >
                    <UploadCloud size={18} />
                    Upload
                  </button>
                </div>

                <p className="mt-1 hidden text-sm text-gray-600 lg:block">
                  or{" "}
                  <button
                    type="button"
                    onClick={openFilePicker}
                    className="font-semibold text-red-600 underline underline-offset-2"
                  >
                    browse files
                  </button>
                </p>

                <p className="mt-3 text-xs text-gray-600">
                  {postType === "video"
                    ? "MP4, MOV, WebM · Up to 10 minutes · Max 500 MB"
                    : "JPG, PNG, WebP · Up to 10 images · Max 500 MB per file"}
                </p>
              </div>
            )}

            {isProcessingFiles && (
              <div
                className="mt-3 rounded-xl border border-gray-200 p-3"
                role="status"
                aria-live="polite"
              >
                <div className="mb-2 flex items-center justify-between text-xs font-medium text-gray-700">
                  <span>Preparing file…</span>

                  <span>{processingProgress}%</span>
                </div>

                <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-red-500 transition-all duration-200"
                    style={{ width: `${processingProgress}%` }}
                  />
                </div>
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
                  if (event.target.files?.length)
                    handleFiles(event.target.files);
                  else replaceIndexRef.current = null;

                  event.target.value = "";
                }}
              />
            )}

            {/* Selected file details */}

            {media.length > 0 && (
              <div className="mt-4 space-y-2">
                {media.map((item, index) => (
                  <div
                    key={`details-${item.id}`}
                    className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {item.name}
                      </p>

                      <p className="mt-0.5 text-xs text-gray-600">
                        {formatFileSize(item.file.size)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => openReplacePicker(index)}
                      className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                    >
                      Replace
                    </button>

                    <button
                      type="button"
                      onClick={() => removeMedia(item.id)}
                      className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Selected media */}

            {media.length > 0 && (
              <section className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">
                    Selected {postType === "video" ? "video" : "photos"}
                  </h2>

                  <span className="text-xs text-gray-600">
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
                          <span className="truncate text-xs text-gray-600">
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
                      className="flex aspect-[4/3] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100"
                    >
                      <Plus size={28} />

                      <span className="mt-1 text-xs">Add more</span>
                    </button>
                  )}
                </div>
              </section>
            )}

            {/* Mobile preview stays directly below the upload area */}

            <section className="mt-6 lg:hidden">
              <h2 className="text-base font-bold">Post preview</h2>

              {renderPreviewCard()}
            </section>

            {/* Custom video thumbnail */}

            {postType === "video" && media.length > 0 && (
              <section className="mt-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">Video thumbnail</h2>

                    <p className="mt-1 text-xs text-gray-600">
                      Choose the cover people will see before playing your
                      video.
                    </p>
                  </div>

                  <span className="shrink-0 text-xs text-gray-600">
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
                        <Video size={25} className="mx-auto text-gray-600" />

                        <p className="mt-2 text-xs text-gray-600">
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

                    <p className="mt-1 text-xs text-gray-600">
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

              <MentionField
                as="textarea"
                id="post-caption"
                value={caption}
                onChange={(nextCaption) => {
                  setCaption(nextCaption.slice(0, MAX_CAPTION_LENGTH));

                  setIsDraftSaved(false);
                }}
                maxLength={MAX_CAPTION_LENGTH}
                rows={4}
                placeholder={
                  postType === "text"
                    ? "Share your thoughts with the community..."
                    : "Write a caption..."
                }
                className="w-full resize-y rounded-xl border border-gray-200 bg-white p-4 text-sm outline-none transition placeholder:text-gray-600 focus:border-gray-400"
              />

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1">
                  {[
                    { label: "Hashtag", Icon: Hash, value: "#" },

                    { label: "Mention", Icon: AtSign, value: "@" },

                    { label: "Location", Icon: MapPin, value: "LOCATION" },
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

                <span
                  className={`text-xs font-medium ${caption.length >= 1800 ? "text-red-600" : "text-gray-600"}`}
                >
                  {caption.length} / {MAX_CAPTION_LENGTH}
                </span>
              </div>
            </section>

            {/* Topics */}

            <section className="mt-6">
              <h2 className="mb-3 text-sm font-semibold">
                Add a topic{" "}
                <span className="font-normal text-gray-600">(optional)</span>
              </h2>

              <div className="flex flex-wrap gap-2">
                {TOPICS.map((topic) => {
                  const selected = selectedTopics[0] === topic;

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

              <div className="rounded-xl border border-gray-200 p-3 space-y-4">
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
            </div>

            {/* Feedback */}

            {notice && (
              <div
                role="status"
                className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700"
              >
                {notice}
                {isPublishing &&
                  (/Uploading (video|photo|photos|media|thumbnail)/i.test(
                    notice,
                  ) ||
                    /Optimizing video/i.test(notice)) && (
                    <div
                      className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200"
                      role="progressbar"
                      aria-label="Media upload progress"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={uploadProgress}
                    >
                      <div
                        className="h-full rounded-full bg-[#FF2D4A] transition-[width] duration-150"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  )}
              </div>
            )}

            {isDraftSaved && (
              <p className="mt-2 text-xs text-green-700">
                Draft preview saved for this session.
              </p>
            )}

            {/* Sticky form action bar */}

            <div className="sticky bottom-0 z-30 -mx-3 mt-7 border-t border-gray-200 bg-white/95 px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6">
              {!(
                (postType === "text" && caption.trim()) ||
                (postType !== "text" && media.length > 0)
              ) && (
                <p className="mb-2 text-xs font-medium text-gray-600">
                  {postType === "text"
                    ? "Add text to enable publishing."
                    : `Add ${postType === "video" ? "a video" : "at least one photo"} to enable publishing.`}
                </p>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={publishPost}
                  disabled={
                    isPublishing ||
                    (postType === "text" ? !caption.trim() : media.length === 0)
                  }
                  className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {isPublishing ? (
                    <LoaderCircle size={18} className="animate-spin" />
                  ) : (
                    <UploadCloud size={18} />
                  )}

                  {isPublishing
                    ? /Optimizing video/i.test(notice)
                      ? "Optimizing video…"
                      : /Uploading (video|photo|photos|media|thumbnail)/i.test(
                            notice,
                          )
                        ? `Uploading… ${uploadProgress}%`
                        : notice === "Cancelling upload…"
                          ? "Cancelling…"
                          : "Publishing…"
                    : "Publish post"}
                </button>

                {isPublishing &&
                  /Uploading (video|photo|photos|media|thumbnail)/i.test(
                    notice,
                  ) && (
                    <button
                      type="button"
                      onClick={cancelUpload}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-5 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                    >
                      <X size={17} /> Cancel upload
                    </button>
                  )}

                <button
                  type="button"
                  onClick={saveDraft}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                >
                  <FileText size={18} /> Save draft
                </button>
              </div>
            </div>
          </section>

          {/* Desktop preview and settings */}

          <aside className="hidden min-w-0 space-y-4 lg:sticky lg:top-24 lg:block">
            <section className="rounded-2xl border border-gray-100 p-5 shadow-sm">
              <h2 className="text-base font-bold">Post preview</h2>

              <p className="mt-1 text-xs text-gray-600">
                This is how your post will appear to others.
              </p>

              {renderPreviewCard()}

              {postType === "video" && customThumbnail && (
                <p className="mt-3 text-center text-xs text-gray-600">
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
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-gray-800">{label}</span>

      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 ${checked ? "bg-red-500" : "bg-gray-400"}`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-[22px]" : "left-0.5"}`}
        />
      </button>
    </div>
  );
}

export default Create;
