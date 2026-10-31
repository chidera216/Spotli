import { useEffect, useRef, useState } from "react";

import { useNavigate } from "react-router-dom";

import api from "../services/api";
import { rememberRecentVideoPlayback } from "../utils/recentVideoPlaybackCache";

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

const MAX_IMAGE_SIZE = Number(import.meta.env.VITE_MAX_IMAGE_UPLOAD_BYTES) > 0
  ? Number(import.meta.env.VITE_MAX_IMAGE_UPLOAD_BYTES)
  : 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = Number(import.meta.env.VITE_MAX_VIDEO_UPLOAD_BYTES) > 0
  ? Number(import.meta.env.VITE_MAX_VIDEO_UPLOAD_BYTES)
  : 100 * 1024 * 1024;
// Source videos may exceed Cloudinary's limit because Spotli can optimize them
// locally before requesting a Cloudinary signature. This cap protects browsers
// from attempting very large in-memory encodes on phones with limited RAM.
const MAX_RAW_VIDEO_SIZE = Number(import.meta.env.VITE_MAX_SOURCE_VIDEO_BYTES) > 0
  ? Number(import.meta.env.VITE_MAX_SOURCE_VIDEO_BYTES)
  : 300 * 1024 * 1024;
const VIDEO_COMPRESSION_THRESHOLD = 5 * 1024 * 1024;
const SMALL_VIDEO_COMPRESSION_THRESHOLD = 15 * 1024 * 1024;
const SMALL_VIDEO_TARGET_RATIO = 0.55;
const STANDARD_VIDEO_TARGET_RATIO = 0.40;
// Speed-first profile for large videos: reduce upload bytes enough to matter on
// mobile connections, while the worker prefers a 720p encode when the source is
// at least 50 MiB. This is a target, not a promise about exact output size.
const SPEED_OPTIMIZED_DOWNSCALE_THRESHOLD = 50 * 1024 * 1024;
const VIDEO_COMPRESSION_TARGET_MAX = 20 * 1024 * 1024;
const MAX_THUMBNAIL_SIZE = 10 * 1024 * 1024;
const ACTIVE_UPLOAD_NOTICE_PATTERN =
  /(?:Optimizing video|Preparing direct Cloudinary upload|Preparing Cloudinary optimization|Uploading (?:original )?video|Uploading video to Cloudinary|Uploading video through Spotli|Forwarding video to Cloudinary|Sending video (?:to|through) Spotli|Uploading video from Spotli server to Cloudinary|Uploading photo|Uploading photos|Uploading media|Uploading thumbnail)/i;

const MAX_VIDEO_DURATION = 10 * 60;

const TOPICS = [
  "ESUT",

  "Tech",

  "Study",

  "Travel",

  "Food",

  "Lifestyle",

  "Music",

  "Fitness",
];

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "Video";

  const minutes = Math.floor(seconds / 60);

  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatElapsedMilliseconds(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "—";
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function createVideoPreuploadState(overrides = {}) {
  return {
    status: "idle",
    progress: 0,
    compressionProgress: 0,
    error: "",
    reason: "",
    speedBytesPerSecond: 0,
    secondsRemaining: Number.NaN,
    encodingMs: Number.NaN,
    uploadMs: Number.NaN,
    originalSize: 0,
    uploadSize: 0,
    compressed: false,
    savingsPercent: 0,
    outputWidth: null,
    outputHeight: null,
    dimensionsReduced: false,
    optimizationQueued: false,
    ...overrides,
  };
}

function Create() {
  const navigate = useNavigate();

  const fileInputRef = useRef(null);

  const thumbnailInputRef = useRef(null);

  const objectUrlsRef = useRef(new Set());

  const replaceIndexRef = useRef(null);


  const activeUploadRequestsRef = useRef(new Set());

  // Video bytes now travel directly from the browser to Cloudinary. The API
  // only signs the upload and later verifies the asset before creating a post.
  const videoPreuploadRef = useRef(null);
  const isPublishingRef = useRef(false);
  const [videoPreuploadState, setVideoPreuploadState] = useState(
    createVideoPreuploadState(),
  );

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

      const stagedUpload = videoPreuploadRef.current;
      if (stagedUpload && !stagedUpload.committed) {
        stagedUpload.cancelled = true;
        stagedUpload.cancelCompression?.();
        stagedUpload.compressionWorker?.terminate();
        stagedUpload.requests?.forEach((request) => request.abort());
        if (
          stagedUpload.cleanup &&
          !["uploading", "confirming"].includes(stagedUpload.status)
        ) {
          void Promise.resolve(stagedUpload.cleanup()).catch(() => {});
          stagedUpload.cleanup = null;
        }
        const cleanupPublicId = stagedUpload.asset?.public_id || stagedUpload.publicId;
        if (cleanupPublicId) {
          void api.posts
            .discardUpload({
              publicId: cleanupPublicId,
              resourceType: stagedUpload.asset?.resource_type || "video",
            })
            .catch(() => {});
        }
      }

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
    cancelStagedVideoUpload();
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

  function formatTimeRemaining(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "estimating time left";
    if (seconds < 60) return `${Math.ceil(seconds)}s left`;
    if (seconds < 3600) {
      return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s left`;
    }
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m left`;
  }

  // Upload progress now includes measured throughput and an ETA. This also helps
  // distinguish transferring bytes from Cloudinary confirming the completed upload.
  function createUploadProgressReporter(label, file) {
    const startedAt = performance.now();
    let lastSampleAt = startedAt;
    let lastSampleBytes = 0;
    let smoothedBytesPerSecond = 0;
    let lastUiUpdateAt = 0;

    return (progress) => {
      const normalizedProgress = Math.max(
        0,
        Math.min(100, Number(progress) || 0),
      );
      const now = performance.now();
      const loadedBytes = file.size * (normalizedProgress / 100);
      const sampleElapsedSeconds = (now - lastSampleAt) / 1000;

      if (sampleElapsedSeconds >= 0.5) {
        const sampleSpeed =
          Math.max(0, loadedBytes - lastSampleBytes) / sampleElapsedSeconds;
        if (sampleSpeed > 0) {
          smoothedBytesPerSecond = smoothedBytesPerSecond
            ? smoothedBytesPerSecond * 0.7 + sampleSpeed * 0.3
            : sampleSpeed;
        }
        lastSampleAt = now;
        lastSampleBytes = loadedBytes;
      }

      if (now - lastUiUpdateAt < 250 && normalizedProgress < 100) return;
      lastUiUpdateAt = now;

      setUploadProgress(Math.round(normalizedProgress));
      if (normalizedProgress >= 100) {
        setNotice(`${label}… 100% · waiting for Cloudinary confirmation`);
        return;
      }

      const speedLabel =
        smoothedBytesPerSecond > 0
          ? `${formatFileSize(smoothedBytesPerSecond)}/s`
          : "measuring speed";
      const remainingSeconds =
        smoothedBytesPerSecond > 0
          ? (file.size - loadedBytes) / smoothedBytesPerSecond
          : Number.NaN;
      setNotice(
        `${label}… ${Math.round(normalizedProgress)}% · ${speedLabel} · ${formatTimeRemaining(remainingSeconds)}`,
      );
    };
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

      const maxSize = postType === "video" ? MAX_RAW_VIDEO_SIZE : MAX_IMAGE_SIZE;
      if (file.size > maxSize) {
        setNotice(
          postType === "video"
            ? `${file.name} is larger than Spotli's source-video limit (${formatFileSize(maxSize)}). Try a shorter clip.`
            : `${file.name} exceeds your configured Cloudinary image limit (${formatFileSize(maxSize)}). Check your Cloudinary plan if you need a larger limit.`,
        );
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
      if (postType === "video") cancelStagedVideoUpload();

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

      // Selecting a video only updates the local preview. Compression and upload
      // begin when the creator presses Publish.
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

    if (removedItem?.type === "video") cancelStagedVideoUpload();

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

  async function uploadToCloudinary(
    file,
    resourceType,
    onProgress,
    requestScope = null,
  ) {
    if (cancelUploadRequestedRef.current || requestScope?.cancelled) {
      throw new Error("UPLOAD_CANCELLED");
    }

    const signature = await api.posts.createUploadSignature({
      resourceType,
      folder: "spotli/posts",
      fileSize: file.size,
    });

    if (cancelUploadRequestedRef.current || requestScope?.cancelled) {
      throw new Error("UPLOAD_CANCELLED");
    }

    if (requestScope) {
      // Start transfer timing only after the backend signing request has returned.
      requestScope.transferStartedAt = performance.now();
      requestScope.lastSampleAt = requestScope.transferStartedAt;
      requestScope.lastSampleBytes = 0;
      requestScope.speedBytesPerSecond = 0;
      // Cloudinary stores this in the configured folder as spotli/posts/<publicId>.
      requestScope.publicId = `${signature.folder}/${signature.publicId}`;
      console.info("[Spotli upload] Cloudinary transfer started", {
        timestamp: new Date().toISOString(),
        fileName: file.name,
        originalSizeBytes: requestScope.file?.size ?? file.size,
        preparedSizeBytes: file.size,
        compressionMs: requestScope.encodingMs ?? null,
        compressed: requestScope.compressionResult?.compressed ?? false,
        durationSeconds:
          media.find((item) => item.file === requestScope.file)?.duration ?? null,
      });
    }

    const endpoint = `https://api.cloudinary.com/v1_1/${signature.cloudName}/${signature.resourceType}/upload`;
    // Cloudinary supports a normal upload up to 100 MB. Single-request uploads
    // are faster below that size; for eligible larger account limits, use 20 MB
    // chunks (Cloudinary's documented default) to reduce sequential round trips.
    const chunked = resourceType === "video" && file.size >= 100_000_000;
    const chunkSize = 20_000_000;
    const uploadStartedAt = performance.now();
    const uniqueUploadId = chunked ? crypto.randomUUID() : "";

    const appendSignedFields = (form) => {
      form.append("api_key", signature.apiKey);
      form.append("timestamp", String(signature.timestamp));
      form.append("signature", signature.signature);
      form.append("folder", signature.folder);
      form.append("public_id", signature.publicId);
      form.append("overwrite", "false");
      if (signature.context) form.append("context", signature.context);
      if (signature.transformation) {
        form.append("transformation", signature.transformation);
      }
      if (signature.format) form.append("format", signature.format);
      if (signature.eager) form.append("eager", signature.eager);
      if (signature.eager_async !== undefined) {
        form.append("eager_async", String(signature.eager_async));
      }
      if (signature.eager_notification_url) {
        form.append("eager_notification_url", signature.eager_notification_url);
      }
    };

    const sendRequest = (start, end, attempt = 0) =>
      new Promise((resolve, reject) => {
        if (cancelUploadRequestedRef.current || requestScope?.cancelled) {
          reject(new Error("UPLOAD_CANCELLED"));
          return;
        }

        const request = new XMLHttpRequest();
        const removeRequest = () => {
          activeUploadRequestsRef.current.delete(request);
          requestScope?.requests?.delete(request);
        };
        activeUploadRequestsRef.current.add(request);
        requestScope?.requests?.add(request);
        request.open("POST", endpoint);
        request.responseType = "json";

        if (chunked) {
          request.setRequestHeader("Content-Range", `bytes ${start}-${end - 1}/${file.size}`);
          request.setRequestHeader("X-Unique-Upload-Id", uniqueUploadId);
        }

        request.upload.addEventListener("progress", (event) => {
          if (!event.lengthComputable || typeof onProgress !== "function") return;
          const transferred = start + event.loaded;
          onProgress(Math.min(99.9, (transferred / file.size) * 100));
        });

        request.addEventListener("load", () => {
          removeRequest();
          const result = request.response && typeof request.response === "object"
            ? request.response
            : {};

          if (request.status < 200 || request.status >= 300) {
            const error = new Error(
              result.error?.message ||
                `Cloudinary upload failed (${request.status}). Please check the file size and your Cloudinary account upload limit.`,
            );
            error.status = request.status;
            reject(error);
            return;
          }
          resolve(result);
        });

        request.addEventListener("error", () => {
          removeRequest();
          const error = new Error("Network error uploading directly to Cloudinary.");
          error.status = 0;
          reject(error);
        });

        request.addEventListener("abort", () => {
          removeRequest();
          reject(new Error("UPLOAD_CANCELLED"));
        });

        const form = new FormData();
        const part = chunked ? file.slice(start, end, file.type) : file;
        form.append("file", part, file.name);
        appendSignedFields(form);

        request.send(form);
      }).catch(async (error) => {
        if (
          error?.message === "UPLOAD_CANCELLED" ||
          cancelUploadRequestedRef.current ||
          requestScope?.cancelled
        ) {
          throw new Error("UPLOAD_CANCELLED");
        }

        const retryable =
          error?.status === 0 ||
          error?.status === 408 ||
          error?.status === 429 ||
          error?.status >= 500;
        if (!retryable || attempt >= 2) throw error;

        console.warn("Retrying Cloudinary upload chunk", {
          start,
          end,
          attempt: attempt + 1,
          error: error?.message || String(error),
        });
        await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 500 : 1500));
        if (cancelUploadRequestedRef.current || requestScope?.cancelled) {
          throw new Error("UPLOAD_CANCELLED");
        }
        return sendRequest(start, end, attempt + 1);
      });

    let uploadedAsset;
    if (chunked) {
      const totalChunks = Math.ceil(file.size / chunkSize);
      console.info("Spotli direct Cloudinary chunked upload started", {
        fileName: file.name,
        fileSizeBytes: file.size,
        chunkSizeBytes: chunkSize,
        totalChunks,
      });

      for (let start = 0; start < file.size; start += chunkSize) {
        const end = Math.min(file.size, start + chunkSize);
        const result = await sendRequest(start, end);
        if (end >= file.size) uploadedAsset = result;
        if (cancelUploadRequestedRef.current || requestScope?.cancelled) {
          throw new Error("UPLOAD_CANCELLED");
        }
      }
    } else {
      uploadedAsset = await sendRequest(0, file.size);
    }

    if (
      !uploadedAsset?.public_id ||
      uploadedAsset.resource_type !== resourceType ||
      !uploadedAsset.secure_url
    ) {
      throw new Error(
        "Cloudinary did not confirm a completed upload. Please retry the upload.",
      );
    }

    const uploadElapsedMs = performance.now() - uploadStartedAt;
    const uploadedBytes = Number(uploadedAsset.bytes) || file.size;
    console.info("[Spotli upload] Cloudinary transfer complete", {
      timestamp: new Date().toISOString(),
      fileName: file.name,
      publicId: uploadedAsset.public_id,
      resourceType: uploadedAsset.resource_type,
      sourceBytes: file.size,
      cloudinaryBytes: uploadedBytes,
      chunked,
      chunkSizeBytes: chunked ? chunkSize : null,
      elapsedMs: Math.round(uploadElapsedMs),
      averageUploadMbps:
        uploadElapsedMs > 0
          ? Number(((file.size * 8) / (uploadElapsedMs / 1000) / 1_000_000).toFixed(2))
          : null,
    });

    if (typeof onProgress === "function") onProgress(100);
    return {
      public_id: uploadedAsset.public_id,
      resource_type: uploadedAsset.resource_type,
    };
  }

  function cancelStagedVideoUpload({ silent = false } = {}) {
    const staged = videoPreuploadRef.current;
    if (!staged) {
      if (!silent) setVideoPreuploadState(createVideoPreuploadState());
      return;
    }

    staged.cancelled = true;
    videoPreuploadRef.current = null;
    staged.cancelCompression?.();
    staged.compressionWorker?.terminate();
    staged.requests?.forEach((request) => request.abort());
    if (staged.cleanup) {
      void Promise.resolve(staged.cleanup()).catch(() => {});
      staged.cleanup = null;
    }

    const publicId = staged.asset?.public_id || staged.publicId;
    if (publicId) {
      void api.posts
        .discardUpload({
          publicId,
          resourceType: staged.asset?.resource_type || "video",
        })
        .catch(() => {});
    }

    if (!silent) setVideoPreuploadState(createVideoPreuploadState());
  }

  function runVideoCompressionWorker(file, targetBytes, maxOutputBytes, staged, onProgress) {
    return new Promise((resolve, reject) => {
      let worker;
      try {
        worker = new Worker(
          new URL("../workers/adaptiveVideoCompression.worker.js", import.meta.url),
          { type: "module" },
        );
      } catch (error) {
        reject(new Error(error?.message || "Could not start video optimization."));
        return;
      }

      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        worker.terminate();
        if (staged.compressionWorker === worker) staged.compressionWorker = null;
        if (staged.cancelCompression === cancelCompression) staged.cancelCompression = null;
        callback(value);
      };
      const cancelCompression = () => {
        try {
          worker.postMessage({ type: "cancel" });
        } catch {
          // Termination below remains the cancellation fallback.
        }
        finish(reject, new Error("UPLOAD_CANCELLED"));
      };

      // Optional, UI-free A/B switch for the encoder hint:
      //   ?spotliEncoder=prefer-hardware (force hardware preference)
      //   ?spotliEncoder=no-preference (browser-selected default)
      // This is only a diagnostic override; normal users see no UI change.
      const encoderPreferenceParam = new URLSearchParams(window.location.search).get("spotliEncoder");
      const hardwareAccelerationPreferenceOverride =
        encoderPreferenceParam === "prefer-hardware" || encoderPreferenceParam === "no-preference"
          ? encoderPreferenceParam
          : null;

      staged.compressionWorker = worker;
      staged.cancelCompression = cancelCompression;
      worker.onmessage = (event) => {
        const message = event.data || {};
        if (staged.cancelled || videoPreuploadRef.current !== staged) {
          finish(reject, new Error("UPLOAD_CANCELLED"));
          return;
        }
        if (message.type === "progress") {
          onProgress?.(Math.max(0, Math.min(99, Number(message.progress) || 0)));
          return;
        }
        if (message.type === "info") {
          console.info("[Spotli upload] compression target adjusted", {
            timestamp: new Date().toISOString(),
            fileName: file.name,
            ...message,
          });
          return;
        }
        if (message.type === "error") {
          finish(reject, new Error(message.message || "Video optimization failed."));
          return;
        }
        if (message.type === "complete" && message.buffer instanceof ArrayBuffer) {
          try {
            const optimizedFile = new File([message.buffer], message.fileName || "spotli-video-optimized.mp4", {
              type: "video/mp4",
              lastModified: file.lastModified,
            });
            console.info("[Spotli upload] compression finished", {
              timestamp: new Date().toISOString(),
              fileName: file.name,
              originalSizeBytes: file.size,
              compressedSizeBytes: optimizedFile.size,
              savingsPercent: Number((((file.size - optimizedFile.size) / file.size) * 100).toFixed(1)),
              compressionMs: Number(message.elapsedMs) || null,
              metadataMs: Number(message.metadataMs) || 0,
              frameRateProbeMs: Number(message.frameRateProbeMs) || 0,
              encodeMs: Number(message.encodeMs) || 0,
              encodingPasses: Number(message.encodingPasses) || 1,
              hardwareAccelerationPreference: message.hardwareAccelerationPreference || "no-preference",
              outputDimensions: message.width && message.height ? `${message.width}x${message.height}` : null,
              sourceFrameRate: Number.isFinite(Number(message.sourceFrameRate)) ? Number(message.sourceFrameRate) : null,
              outputFrameRate: Number.isFinite(Number(message.outputFrameRate)) ? Number(message.outputFrameRate) : null,
              dimensionsReduced: message.dimensionsReduced === true,
            });
            finish(resolve, {
              file: optimizedFile,
              elapsedMs: Number(message.elapsedMs) || 0,
              metadataMs: Number(message.metadataMs) || 0,
              frameRateProbeMs: Number(message.frameRateProbeMs) || 0,
              encodeMs: Number(message.encodeMs) || 0,
              encodingPasses: Number(message.encodingPasses) || 1,
              hardwareAccelerationPreference: message.hardwareAccelerationPreference || "no-preference",
              targetBytes: Number(message.targetBytes) || targetBytes,
              outputWidth: Number(message.width) || null,
              outputHeight: Number(message.height) || null,
              sourceFrameRate: Number(message.sourceFrameRate) || null,
              outputFrameRate: Number(message.outputFrameRate) || null,
              dimensionsReduced: message.dimensionsReduced === true,
            });
          } catch (error) {
            finish(reject, new Error(error?.message || "Could not prepare the optimized video."));
          }
        }
      };
      worker.onerror = (event) => {
        finish(reject, new Error(event.message || "Video optimization worker failed."));
      };
      try {
        worker.postMessage({
          type: "compress",
          file,
          targetBytes,
          maxOutputBytes,
          // Larger sources may need a proportional downscale to hit a much
          // smaller upload target. Small clips keep their original resolution.
          allowDownscale: file.size >= SMALL_VIDEO_COMPRESSION_THRESHOLD,
          // For large uploads, prioritize 720p when the source is higher than
          // 720p. This reduces encoder work on high-pixel-count videos.
          prefer720p: file.size >= SPEED_OPTIMIZED_DOWNSCALE_THRESHOLD,
          ...(hardwareAccelerationPreferenceOverride
            ? { hardwareAccelerationPreference: hardwareAccelerationPreferenceOverride }
            : {}),
        });
      } catch (error) {
        finish(reject, new Error(error?.message || "Could not send the video to the optimization worker."));
      }
    });
  }

  async function prepareVideoForUpload(file, staged) {
    const mustCompress =
      file.size >= VIDEO_COMPRESSION_THRESHOLD || file.size > MAX_VIDEO_SIZE;
    const uploadSafetyMargin = Math.min(5 * 1024 * 1024, Math.floor(MAX_VIDEO_SIZE * 0.05));
    const maxOutputBytes = Math.max(1, MAX_VIDEO_SIZE - uploadSafetyMargin);

    if (!mustCompress) {
      staged.uploadFile = file;
      staged.encodingMs = 0;
      staged.compressionResult = {
        file,
        compressed: false,
        reason: "Video below the compression threshold: uploading directly to Cloudinary.",
        originalSize: file.size,
        compressedSize: file.size,
        savingsPercent: 0,
      };
      setVideoPreuploadState(createVideoPreuploadState({
        status: "uploading",
        progress: 0,
        compressionProgress: 100,
        originalSize: file.size,
        uploadSize: file.size,
        encodingMs: 0,
        compressed: false,
        savingsPercent: 0,
        reason: staged.compressionResult.reason,
      }));
      return staged.compressionResult;
    }

    // Aim for a substantially smaller upload on slow connections. Files below
    // 15 MiB target 55% of their source size; larger files target 40%, capped at
    // 20 MiB for large files. Files at/above 50 MiB prefer 720p to reduce the
    // pixel count; the worker avoids unnecessary repeat encoding when the first result is safe.
    const targetRatio = file.size < SMALL_VIDEO_COMPRESSION_THRESHOLD
      ? SMALL_VIDEO_TARGET_RATIO
      : STANDARD_VIDEO_TARGET_RATIO;
    const targetBytes = Math.max(
      1,
      Math.min(
        Math.floor(file.size * targetRatio),
        VIDEO_COMPRESSION_TARGET_MAX,
        maxOutputBytes,
      ),
    );
    const compressionStartedAt = performance.now();
    console.info("[Spotli upload] compression started", {
      timestamp: new Date().toISOString(),
      fileName: file.name,
      originalSizeBytes: file.size,
      targetSizeBytes: targetBytes,
      targetSizeMiB: Number((targetBytes / (1024 * 1024)).toFixed(1)),
      targetRatio,
      targetSizeCapMiB: Number((VIDEO_COMPRESSION_TARGET_MAX / (1024 * 1024)).toFixed(1)),
      speedProfile: file.size >= SPEED_OPTIMIZED_DOWNSCALE_THRESHOLD ? "prefer-720p" : "preserve-source-when-practical",
      maxOutputBytes,
    });
    staged.status = "compressing";
    staged.compressionProgress = 0;
    setVideoPreuploadState(createVideoPreuploadState({
      status: "compressing",
      progress: 0,
      compressionProgress: 0,
      originalSize: file.size,
      uploadSize: file.size,
      encodingMs: 0,
      compressed: false,
      reason: "Optimizing this video before upload to reduce mobile data transfer.",
    }));
    if (isPublishingRef.current) {
      setNotice("Optimizing video for faster upload… 0%");
    }

    try {
      const result = await runVideoCompressionWorker(
        file,
        targetBytes,
        maxOutputBytes,
        staged,
        (progress) => {
          staged.compressionProgress = progress;
          setVideoPreuploadState(createVideoPreuploadState({
            status: "compressing",
            progress: 0,
            compressionProgress: progress,
            originalSize: file.size,
            uploadSize: file.size,
            encodingMs: Math.round(performance.now() - compressionStartedAt),
            compressed: false,
            reason: "Optimizing this video before upload to reduce mobile data transfer.",
          }));
          if (isPublishingRef.current) {
            setNotice(`Optimizing video for faster upload… ${progress}%`);
          }
        },
      );
      if (staged.cancelled || videoPreuploadRef.current !== staged) {
        throw new Error("UPLOAD_CANCELLED");
      }

      const optimizedFile = result.file;
      const savingsPercent = Number((((file.size - optimizedFile.size) / file.size) * 100).toFixed(1));
      if (optimizedFile.size >= file.size * 0.90) {
        throw new Error("Optimization did not reduce this file enough to justify the extra processing time.");
      }
      if (optimizedFile.size > maxOutputBytes) {
        throw new Error("The optimized video still exceeds the configured Cloudinary upload limit.");
      }

      staged.uploadFile = optimizedFile;
      staged.encodingMs = result.elapsedMs || Math.round(performance.now() - compressionStartedAt);
      staged.compressionResult = {
        file: optimizedFile,
        compressed: true,
        reason: `Optimized before upload: ${formatFileSize(file.size)} → ${formatFileSize(optimizedFile.size)} (${savingsPercent}% smaller)${result.dimensionsReduced ? `; resolution adjusted to ${result.outputWidth}×${result.outputHeight} to fit the upload limit` : "; source resolution preserved"}.`,
        originalSize: file.size,
        compressedSize: optimizedFile.size,
        savingsPercent,
        outputWidth: result.outputWidth,
        outputHeight: result.outputHeight,
        dimensionsReduced: result.dimensionsReduced,
      };
      console.info("Spotli adaptive video preparation complete", {
        originalSizeBytes: file.size,
        uploadSizeBytes: optimizedFile.size,
        compressionMs: staged.encodingMs,
        metadataMs: result.metadataMs,
        frameRateProbeMs: result.frameRateProbeMs,
        encodeMs: result.encodeMs,
        encodingPasses: result.encodingPasses,
        hardwareAccelerationPreference: result.hardwareAccelerationPreference,
        savingsPercent,
        outputDimensions: result.outputWidth && result.outputHeight
          ? `${result.outputWidth}x${result.outputHeight}`
          : "source dimensions retained by encoder",
        sourceFrameRate: result.sourceFrameRate,
        outputFrameRate: result.outputFrameRate,
        dimensionsReduced: result.dimensionsReduced,
      });
      setVideoPreuploadState(createVideoPreuploadState({
        status: "uploading",
        progress: 0,
        compressionProgress: 100,
        originalSize: file.size,
        uploadSize: optimizedFile.size,
        encodingMs: staged.encodingMs,
        compressed: true,
        savingsPercent,
        reason: staged.compressionResult.reason,
      }));
      return staged.compressionResult;
    } catch (error) {
      if (staged.cancelled || error?.message === "UPLOAD_CANCELLED") {
        throw new Error("UPLOAD_CANCELLED");
      }

      // Keep publishing reliable when the original is within the configured
      // upload limit INCLUDING the safety margin. Do not retry the original at
      // the exact limit after compression fails, because provider-side size
      // accounting can differ and the upload may be rejected.
      if (file.size <= maxOutputBytes) {
        console.warn("Spotli adaptive compression skipped; uploading original instead", {
          fileName: file.name,
          originalSizeBytes: file.size,
          reason: error?.message || String(error),
        });
        staged.uploadFile = file;
        staged.encodingMs = Math.round(performance.now() - compressionStartedAt);
        staged.compressionResult = {
          file,
          compressed: false,
          reason: `Compression was not worthwhile or unavailable; uploading the original ${formatFileSize(file.size)} video.`,
          originalSize: file.size,
          compressedSize: file.size,
          savingsPercent: 0,
        };
        setVideoPreuploadState(createVideoPreuploadState({
          status: "uploading",
          progress: 0,
          compressionProgress: 100,
          originalSize: file.size,
          uploadSize: file.size,
          encodingMs: staged.encodingMs,
          compressed: false,
          savingsPercent: 0,
          reason: staged.compressionResult.reason,
        }));
        return staged.compressionResult;
      }

      throw new Error(
        `${error?.message || "Video optimization failed."} This original exceeds Spotli's safe upload-size limit, so Spotli cannot upload it unchanged. Try MP4 or a shorter clip.`,
      );
    }
  }

  function startVideoPreupload(file) {
    if (
      !file ||
      !(file.type.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(file.name))
    ) {
      return Promise.reject(new Error("Choose a valid video file."));
    }

    const existing = videoPreuploadRef.current;
    if (existing && existing.file === file && !existing.cancelled) {
      if (existing.status === "ready" && existing.asset) {
        return Promise.resolve(existing.asset);
      }
      if (["compressing", "uploading", "confirming"].includes(existing.status) && existing.promise) return existing.promise;
    }

    if (existing) cancelStagedVideoUpload({ silent: true });

    const shouldCompress =
      file.size >= VIDEO_COMPRESSION_THRESHOLD || file.size > MAX_VIDEO_SIZE;
    const staged = {
      file,
      uploadFile: file,
      asset: null,
      publicId: "",
      promise: null,
      progress: 0,
      compressionProgress: shouldCompress ? 0 : 100,
      status: shouldCompress ? "compressing" : "uploading",
      cancelled: false,
      committed: false,
      requiresCompression: shouldCompress,
      compressionReady: !shouldCompress,
      requests: new Set(),
      compressionWorker: null,
      cancelCompression: null,
      lastSampleAt: performance.now(),
      lastSampleBytes: 0,
      speedBytesPerSecond: 0,
      encodingMs: 0,
      uploadMs: Number.NaN,
      compressionResult: {
        file,
        compressed: false,
        reason: shouldCompress
          ? "Optimizing this video before upload to reduce mobile data transfer."
          : "Video below the compression threshold: uploading directly to Cloudinary.",
        originalSize: file.size,
        compressedSize: file.size,
        savingsPercent: 0,
      },
      cleanup: null,
      optimizationQueued: false,
      eagerHlsRequested: false,
    };
    videoPreuploadRef.current = staged;
    setVideoPreuploadState(
      createVideoPreuploadState({
        status: staged.status,
        progress: 0,
        compressionProgress: staged.compressionProgress,
        originalSize: file.size,
        uploadSize: file.size,
        encodingMs: 0,
        compressed: false,
        reason: staged.compressionResult.reason,
      }),
    );

    const reportProgress = (progress) => {
      if (staged.cancelled || videoPreuploadRef.current !== staged) return;
      staged.progress = Math.max(0, Math.min(100, Number(progress) || 0));
      const now = performance.now();
      const uploadFile = staged.uploadFile || file;
      const loadedBytes = uploadFile.size * Math.min(1, staged.progress / 100);
      const elapsedSeconds = (now - staged.lastSampleAt) / 1000;
      if (elapsedSeconds >= 0.6) {
        const sampleSpeed = Math.max(0, loadedBytes - staged.lastSampleBytes) / elapsedSeconds;
        if (sampleSpeed > 0) {
          staged.speedBytesPerSecond = staged.speedBytesPerSecond
            ? staged.speedBytesPerSecond * 0.7 + sampleSpeed * 0.3
            : sampleSpeed;
        }
        staged.lastSampleAt = now;
        staged.lastSampleBytes = loadedBytes;
      }

      setVideoPreuploadState(
        createVideoPreuploadState({
          status: staged.progress >= 99.9 ? "confirming" : "uploading",
          progress: Math.min(99, staged.progress),
          compressionProgress: 100,
          error: "",
          reason: staged.compressionResult.reason,
          speedBytesPerSecond: staged.speedBytesPerSecond,
          secondsRemaining:
            staged.speedBytesPerSecond > 0
              ? Math.max(0, uploadFile.size - loadedBytes) / staged.speedBytesPerSecond
              : Number.NaN,
          encodingMs: staged.encodingMs,
          uploadMs: staged.uploadMs,
          originalSize: file.size,
          uploadSize: uploadFile.size,
          compressed: staged.compressionResult.compressed,
          savingsPercent: staged.compressionResult.savingsPercent,
          optimizationQueued: staged.optimizationQueued,
        }),
      );

      if (isPublishingRef.current) {
        setUploadProgress(Math.round(staged.progress));
        setNotice(
          staged.progress >= 99.9
            ? "Cloudinary received the video; confirming upload…"
            : `Uploading video directly to Cloudinary… ${Math.round(staged.progress)}%`,
        );
      }
    };
    staged.reportProgress = reportProgress;

    staged.promise = (async () => {
      const startedAt = performance.now();
      try {
        const preparation = await prepareVideoForUpload(file, staged);
        if (staged.cancelled || videoPreuploadRef.current !== staged) {
          throw new Error("UPLOAD_CANCELLED");
        }
        staged.status = "uploading";
        const uploadFile = staged.uploadFile || file;
        // uploadToCloudinary starts transfer timing after the signing request
        // returns, so signature latency is not counted as Cloudinary transfer.
        const asset = await uploadToCloudinary(uploadFile, "video", reportProgress, staged);
        staged.uploadMs = performance.now() - (staged.transferStartedAt || startedAt);
        staged.transferStartedAt = null;

        if (staged.cancelled || videoPreuploadRef.current !== staged) {
          if (asset?.public_id) {
            void api.posts
              .discardUpload({ publicId: asset.public_id, resourceType: "video" })
              .catch(() => {});
          }
          throw new Error("UPLOAD_CANCELLED");
        }

        staged.asset = asset;
        staged.status = "ready";
        staged.progress = 100;
        setVideoPreuploadState(
          createVideoPreuploadState({
            status: "ready",
            progress: 100,
            compressionProgress: 100,
            reason: `${staged.compressionResult.reason} Cloudinary playback optimization will run in the background after publishing.`,
            speedBytesPerSecond: staged.speedBytesPerSecond,
            secondsRemaining: 0,
            encodingMs: staged.encodingMs,
            uploadMs: staged.uploadMs,
            originalSize: file.size,
            uploadSize: (staged.uploadFile || file).size,
            compressed: staged.compressionResult.compressed,
            savingsPercent: staged.compressionResult.savingsPercent,
            outputWidth: staged.compressionResult.outputWidth || null,
            outputHeight: staged.compressionResult.outputHeight || null,
            dimensionsReduced: staged.compressionResult.dimensionsReduced || false,
            optimizationQueued: false,
          }),
        );
        return asset;
      } catch (error) {
        if (staged.transferStartedAt) {
          staged.uploadMs = performance.now() - staged.transferStartedAt;
          staged.transferStartedAt = null;
        }
        if (staged.cancelled || error?.message === "UPLOAD_CANCELLED") {
          throw new Error("UPLOAD_CANCELLED");
        }

        staged.status = "error";
        if (staged.publicId) {
          void api.posts
            .discardUpload({ publicId: staged.publicId, resourceType: "video" })
            .catch(() => {});
        }
        setVideoPreuploadState(
          createVideoPreuploadState({
            status: "error",
            progress: 0,
            compressionProgress: 100,
            error: error?.message || error?.error?.message || "Cloudinary upload failed.",
            reason: "The direct Cloudinary upload did not finish. Your video was not published; retry after checking the error.",
            speedBytesPerSecond: staged.speedBytesPerSecond,
            secondsRemaining: Number.NaN,
            encodingMs: staged.encodingMs,
            uploadMs: staged.uploadMs,
            originalSize: file.size,
            uploadSize: (staged.uploadFile || file).size,
            compressed: staged.compressionResult.compressed,
            savingsPercent: staged.compressionResult.savingsPercent,
            optimizationQueued: false,
          }),
        );
        throw error;
      }
    })();

    staged.promise.catch(() => {});
    return staged.promise;
  }

  async function publishPost() {
    if (isPublishingRef.current || isPublishing) {
      console.warn("[Spotli publish] duplicate Publish click ignored", {
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const publishStartedAt = performance.now();
    const publishStartedTimestamp = new Date().toISOString();
    console.info("[Spotli publish] Publish clicked", {
      timestamp: publishStartedTimestamp,
      postType,
      mediaCount: media.length,
      originalVideoSizeBytes:
        postType === "video" ? media[0]?.file?.size ?? null : null,
    });

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

    if (
      postType === "video" &&
      media.some((item) => item.file.size > MAX_RAW_VIDEO_SIZE)
    ) {
      setNotice(`Source videos must be ${formatFileSize(MAX_RAW_VIDEO_SIZE)} or smaller. Try a shorter clip.`);
      return;
    }
    if (
      postType === "photo" &&
      media.some((item) => item.file.size > MAX_IMAGE_SIZE)
    ) {
      setNotice(`Images must be ${formatFileSize(MAX_IMAGE_SIZE)} or smaller in this configuration.`);
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
    isPublishingRef.current = true;
    cancelUploadRequestedRef.current = false;
    setUploadProgress(0);
    setNotice("");

    try {
      const resourceType = postType === "photo" ? "image" : "video";
      let mediaAssets = [];
      // Upload media bytes directly from the browser to Cloudinary. The backend
      // only signs the upload and verifies the Cloudinary asset before publishing.
      const videoFileToUpload = postType === "video" ? media[0].file : null;

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
      } else if (postType === "video" && videoFileToUpload) {
        setUploadProgress(0);
        setNotice("Preparing direct Cloudinary upload…");
        let staged =
          videoPreuploadRef.current?.file === videoFileToUpload &&
          videoPreuploadRef.current.status !== "error" &&
          !videoPreuploadRef.current.cancelled
            ? videoPreuploadRef.current
            : null;

        if (!staged) {
          void startVideoPreupload(videoFileToUpload);
          staged = videoPreuploadRef.current;
        }
        if (!staged?.promise) {
          throw new Error("Unable to start the direct Cloudinary upload. Please try again.");
        }

        setNotice(`Uploading video directly to Cloudinary… ${Math.round(staged.progress || 0)}%`);
        mediaAssets.push(
          staged.status === "ready" && staged.asset
            ? staged.asset
            : await staged.promise,
        );
      } else {
        for (let index = 0; index < media.length; index += 1) {
          setUploadProgress(0);
          const uploadLabel = "Uploading photo";
          const fileToUpload = media[index].file;
          setNotice(`${uploadLabel}… 0% · measuring speed`);
          const reportUploadProgress = createUploadProgressReporter(
            uploadLabel,
            fileToUpload,
          );
          mediaAssets.push(
            await uploadToCloudinary(
              fileToUpload,
              resourceType,
              reportUploadProgress,
            ),
          );
        }
      }

      let thumbnailAsset;
      if (postType === "video" && customThumbnail) {
        setUploadProgress(0);
        setNotice("Uploading thumbnail… 0% · measuring speed");
        thumbnailAsset = await uploadToCloudinary(
          customThumbnail.file,
          "image",
          createUploadProgressReporter(
            "Uploading thumbnail",
            customThumbnail.file,
          ),
        );
      }

      if (cancelUploadRequestedRef.current) throw new Error("UPLOAD_CANCELLED");

      setUploadProgress(0);
      setNotice("Publishing your post…");
      const postCreationStartedAt = performance.now();
      console.info("[Spotli publish] post creation started", {
        timestamp: new Date().toISOString(),
        elapsedSincePublishClickMs: Math.round(
          postCreationStartedAt - publishStartedAt,
        ),
        mediaAssetCount: mediaAssets.length,
        hasCustomThumbnail: Boolean(thumbnailAsset),
      });

      let result;
      try {
        result = await api.posts.createWithAssets({
          type: postType,
          caption,
          topics: selectedTopics,
          mediaAssets,
          ...(thumbnailAsset ? { thumbnailAsset } : {}),
        });
      } catch (error) {
        console.error("[Spotli publish] post creation failed", {
          timestamp: new Date().toISOString(),
          postCreationMs: Math.round(performance.now() - postCreationStartedAt),
          totalElapsedMs: Math.round(performance.now() - publishStartedAt),
          error: error?.message || "Post creation request failed.",
        });
        throw error;
      }

      const stagedVideo = videoPreuploadRef.current;
      const measuredVideoStage =
        videoFileToUpload && stagedVideo?.file === videoFileToUpload
          ? stagedVideo
          : null;
      console.info("[Spotli publish] post creation completed", {
        timestamp: new Date().toISOString(),
        postCreationMs: Math.round(performance.now() - postCreationStartedAt),
        totalElapsedMs: Math.round(performance.now() - publishStartedAt),
        compressionMs: measuredVideoStage?.encodingMs ?? null,
        cloudinaryTransferMs: Number.isFinite(measuredVideoStage?.uploadMs)
          ? Math.round(measuredVideoStage.uploadMs)
          : null,
        originalSizeBytes: measuredVideoStage?.file?.size ?? null,
        preparedSizeBytes: measuredVideoStage?.uploadFile?.size ?? null,
        outputDimensions:
          measuredVideoStage?.compressionResult?.outputWidth &&
          measuredVideoStage?.compressionResult?.outputHeight
            ? `${measuredVideoStage.compressionResult.outputWidth}x${measuredVideoStage.compressionResult.outputHeight}`
            : null,
      });
      // Preserve the exact file we just uploaded in memory for the immediate
      // post-publish playback in Home. This avoids waiting for Cloudinary's
      // first media request; the server URL remains the fallback after reload.
      if (
        postType === "video" &&
        mediaAssets[0]?.public_id &&
        measuredVideoStage?.uploadFile
      ) {
        rememberRecentVideoPlayback(
          mediaAssets[0].public_id,
          measuredVideoStage.uploadFile,
        );
      }

      if (stagedVideo && stagedVideo.file === videoFileToUpload) {
        stagedVideo.committed = true;
        if (stagedVideo.cleanup) {
          void Promise.resolve(stagedVideo.cleanup()).catch((cleanupError) => {
            console.warn(
              "Unable to clean temporary optimized video:",
              cleanupError,
            );
          });
          stagedVideo.cleanup = null;
        }
        videoPreuploadRef.current = null;
        setVideoPreuploadState(createVideoPreuploadState());
      }

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
      activeUploadRequestsRef.current.clear();
      cancelUploadRequestedRef.current = false;
      isPublishingRef.current = false;
      setIsPublishing(false);
    }
  }

  function cancelUpload() {
    if (!isPublishing || !ACTIVE_UPLOAD_NOTICE_PATTERN.test(notice)) {
      return;
    }

    cancelUploadRequestedRef.current = true;
    // Also detach the staged video so a cancelled promise cannot be reused by
    // a later Publish attempt. The scoped cancellation aborts its own requests
    // and discards its completed asset if one already exists.
    cancelStagedVideoUpload();
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
                    ? `MP4, MOV, WebM · Up to 10 minutes · Source up to ${formatFileSize(MAX_RAW_VIDEO_SIZE)} · Large videos optimized before upload`
                    : `JPG, PNG, WebP · Up to 10 images · Max ${formatFileSize(MAX_IMAGE_SIZE)} per file`}
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
                      {item.type === "video" &&
                        videoPreuploadRef.current?.file === item.file &&
                        videoPreuploadState.status !== "idle" && (
                          <div className="mt-2 max-w-sm">
                            <p className="text-xs font-medium text-gray-700">
                              {videoPreuploadState.status === "ready"
                                ? `${videoPreuploadState.compressed ? `Optimized ${formatFileSize(videoPreuploadState.originalSize)} → ${formatFileSize(videoPreuploadState.uploadSize)}` : `Uploaded ${formatFileSize(videoPreuploadState.uploadSize)} directly`}${videoPreuploadState.dimensionsReduced && videoPreuploadState.outputWidth && videoPreuploadState.outputHeight ? ` · resolution ${videoPreuploadState.outputWidth}×${videoPreuploadState.outputHeight}` : ""} · encode ${formatElapsedMilliseconds(videoPreuploadState.encodingMs)} · upload ${formatElapsedMilliseconds(videoPreuploadState.uploadMs)} · ready to publish`
                                : videoPreuploadState.status === "error"
                                  ? `Cloudinary upload failed: ${videoPreuploadState.error || "Try again"}. Your post has not been published.`
                                  : videoPreuploadState.status === "compressing"
                                    ? `Optimizing video for faster upload… ${Math.round(videoPreuploadState.compressionProgress)}%`
                                    : videoPreuploadState.status === "cloudinary"
                                      ? `Uploading directly to Cloudinary… ${Math.round(videoPreuploadState.progress)}%${videoPreuploadState.speedBytesPerSecond > 0 ? ` · ${formatFileSize(videoPreuploadState.speedBytesPerSecond)}/s` : ""}`
                                      : videoPreuploadState.status === "confirming"
                                        ? "Waiting for Cloudinary upload confirmation…"
                                        : `Uploading ${videoPreuploadState.compressed ? "optimized" : "original"} video directly to Cloudinary… ${Math.round(videoPreuploadState.progress)}%${videoPreuploadState.speedBytesPerSecond > 0 ? ` · ${formatFileSize(videoPreuploadState.speedBytesPerSecond)}/s` : ""}${Number.isFinite(videoPreuploadState.secondsRemaining) ? ` · ${formatTimeRemaining(videoPreuploadState.secondsRemaining)}` : ""}`}
                            </p>
                            {[
                              "compressing",
                              "uploading",
                              "cloudinary",
                              "confirming",
                            ].includes(videoPreuploadState.status) && (
                              <div
                                className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-200"
                                role="progressbar"
                                aria-label={
                                  videoPreuploadState.status === "compressing"
                                    ? "Video optimization"
                                    : "Video upload directly to Cloudinary"
                                }
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.round(
                                  videoPreuploadState.status === "compressing"
                                    ? videoPreuploadState.compressionProgress
                                    : videoPreuploadState.progress,
                                )}
                              >
                                <div
                                  className="h-full rounded-full bg-[#FF2D4A] transition-[width] duration-150"
                                  style={{
                                    width: `${videoPreuploadState.status === "compressing" ? videoPreuploadState.compressionProgress : videoPreuploadState.progress}%`,
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        )}
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
                {isPublishing && ACTIVE_UPLOAD_NOTICE_PATTERN.test(notice) && (
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
                    ? ACTIVE_UPLOAD_NOTICE_PATTERN.test(notice)
                      ? `Uploading… ${uploadProgress}%`
                      : notice === "Cancelling upload…"
                        ? "Cancelling…"
                        : "Publishing…"
                    : "Publish post"}
                </button>

                {isPublishing && ACTIVE_UPLOAD_NOTICE_PATTERN.test(notice) && (
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
