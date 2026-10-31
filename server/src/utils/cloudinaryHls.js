import cloudinary from "../config/cloudinary.js";

// Use Cloudinary's orientation-aware automatic streaming profile. Spotli has
// portrait and landscape uploads; sp_auto expresses quality using the shorter
// edge, preserves source orientation, and caps output at Cloudinary's default
// 1080p maximum without upscaling lower-resolution sources. Keep this profile
// identifier in sync with VideoViewer.jsx.
export const CLOUDINARY_HLS_STREAMING_PROFILE = "auto";

const queuedHlsByPublicId = new Map();
const hlsJobStateByPublicId = new Map();
const MAX_QUEUED_HLS_CACHE = 2000;

/**
 * Record Cloudinary's signed eager notification. A failed asynchronous job
 * must evict the in-process queue entry so the next explicit prepare request
 * can actually submit a fresh job instead of returning the old resolved promise.
 */
export function recordCloudinaryHlsEagerNotification({
  publicId,
  status,
  batchId = null,
  error = null,
  eagerCount = 0,
} = {}) {
  if (typeof publicId !== "string" || !publicId.startsWith("spotli/posts/")) {
    return null;
  }

  const normalizedStatus = String(status || "unknown").toLowerCase();
  const failed = ["failed", "error"].includes(normalizedStatus);
  const ready = ["complete", "completed", "success", "successful"].includes(
    normalizedStatus,
  );

  const state = {
    status: failed ? "failed" : ready ? "ready" : "unknown",
    batchId: batchId || null,
    eagerCount: Number(eagerCount) || 0,
    error: error ? String(error).slice(0, 1000) : null,
    updatedAt: Date.now(),
  };

  hlsJobStateByPublicId.set(publicId, state);

  if (failed) {
    queuedHlsByPublicId.delete(publicId);
  }

  while (hlsJobStateByPublicId.size > MAX_QUEUED_HLS_CACHE) {
    const oldestKey = hlsJobStateByPublicId.keys().next().value;
    hlsJobStateByPublicId.delete(oldestKey);
  }

  return state;
}

export function getCloudinaryHlsJobState(publicId) {
  return hlsJobStateByPublicId.get(publicId) || null;
}

/**
 * Queue asynchronous HLS generation after a direct-to-Cloudinary upload has
 * been verified and the Spotli post saved. Upload completion therefore does
 * not wait for all playback renditions to finish transcoding.
 */
export async function queueCloudinaryHls(publicId) {
  if (typeof publicId !== "string" || !publicId.startsWith("spotli/posts/")) {
    throw new Error(
      "Refusing to prepare HLS for an unexpected Cloudinary asset.",
    );
  }

  const jobState = hlsJobStateByPublicId.get(publicId);
  const cached = queuedHlsByPublicId.get(publicId);
  if (cached && jobState?.status !== "failed") return cached;
  if (jobState?.status === "failed") {
    queuedHlsByPublicId.delete(publicId);
  }

  const queuePromise = (async () => {
    const options = {
      resource_type: "video",
      type: "upload",
      eager: [
        {
          streaming_profile: CLOUDINARY_HLS_STREAMING_PROFILE,
          format: "m3u8",
        },
        {
          // Fast desktop Auto startup: 1080p-class short edge when source permits.
          width: 1920,
          height: 1920,
          crop: "limit",
          bit_rate: "1600k",
          quality: "auto:eco",
          video_codec: "h264",
          format: "mp4",
        },
        {
          // Weak desktop: preserve 720p-class dimensions with a lower bitrate.
          width: 1280,
          height: 1280,
          crop: "limit",
          bit_rate: "400k",
          quality: "auto:eco",
          video_codec: "h264",
          format: "mp4",
        },
        {
          // Constrained desktop: 720p-class dimensions with 500 kbps.
          width: 1280,
          height: 1280,
          crop: "limit",
          bit_rate: "500k",
          quality: "auto:eco",
          video_codec: "h264",
          format: "mp4",
        },
        {
          width: 1280,
          height: 1280,
          crop: "limit",
          bit_rate: "800k",
          quality: "auto:eco",
          video_codec: "h264",
          format: "mp4",
        },
        {
          width: 854,
          height: 854,
          crop: "limit",
          bit_rate: "300k",
          quality: "auto:eco",
          video_codec: "h264",
          format: "mp4",
        },
        {
          width: 854,
          height: 854,
          crop: "limit",
          bit_rate: "400k",
          quality: "auto:eco",
          video_codec: "h264",
          format: "mp4",
        },
        {
          width: 854,
          height: 854,
          crop: "limit",
          bit_rate: "500k",
          quality: "auto:eco",
          video_codec: "h264",
          format: "mp4",
        },
        {
          width: 640,
          height: 640,
          crop: "limit",
          bit_rate: "300k",
          quality: "auto:eco",
          video_codec: "h264",
          format: "mp4",
        },
        {
          width: 640,
          height: 640,
          crop: "limit",
          bit_rate: "200k",
          quality: "auto:eco",
          video_codec: "h264",
          format: "mp4",
        },
      ],
      eager_async: true,
    };

    const notificationUrl = String(
      process.env.CLOUDINARY_EAGER_NOTIFICATION_URL || "",
    ).trim();
    if (notificationUrl) {
      options.eager_notification_url = notificationUrl;
    } else {
      console.warn(
        "CLOUDINARY_EAGER_NOTIFICATION_URL is not configured; asynchronous HLS fallback will have no completion webhook.",
      );
    }

    const result = await cloudinary.uploader.explicit(publicId, options);
    const currentState = hlsJobStateByPublicId.get(publicId);
    // The webhook can theoretically arrive before the API promise resolves.
    // Do not downgrade a completed notification back to merely queued.
    if (currentState?.status !== "ready") {
      hlsJobStateByPublicId.set(publicId, {
        status: "queued",
        batchId: result?.batch_id || null,
        eagerCount: 0,
        error: null,
        updatedAt: Date.now(),
      });
    }
    return result;
  })();

  queuedHlsByPublicId.set(publicId, queuePromise);
  while (queuedHlsByPublicId.size > MAX_QUEUED_HLS_CACHE) {
    const oldestKey = queuedHlsByPublicId.keys().next().value;
    if (oldestKey === publicId) break;
    queuedHlsByPublicId.delete(oldestKey);
  }

  try {
    return await queuePromise;
  } catch (error) {
    if (queuedHlsByPublicId.get(publicId) === queuePromise) {
      queuedHlsByPublicId.delete(publicId);
    }
    hlsJobStateByPublicId.set(publicId, {
      status: "failed",
      batchId: null,
      eagerCount: 0,
      error: error?.message || String(error),
      updatedAt: Date.now(),
    });
    throw error;
  }
}
