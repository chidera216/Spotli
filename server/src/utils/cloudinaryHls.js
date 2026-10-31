import cloudinary from "../config/cloudinary.js";

// Use Cloudinary's predefined Full HD streaming profile. It creates a known,
// eagerly generated HLS output at up to 1080p and matches the viewer URL. Keep
// this identifier in sync with VideoViewer.jsx.
export const CLOUDINARY_HLS_STREAMING_PROFILE = "full_hd";

const queuedHlsByPublicId = new Map();
const MAX_QUEUED_HLS_CACHE = 2000;

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

  const cached = queuedHlsByPublicId.get(publicId);
  if (cached) return cached;

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
          width: 1280,
          height: 1280,
          crop: "limit",
          bit_rate: "800k",
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

    return cloudinary.uploader.explicit(publicId, options);
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
    throw error;
  }
}
