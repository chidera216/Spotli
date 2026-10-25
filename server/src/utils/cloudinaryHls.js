import cloudinary from "../config/cloudinary.js";

// Keep this profile aligned with VideoViewer.jsx, which delivers
// /video/upload/sp_full_hd/<public-id>.m3u8.
export const CLOUDINARY_HLS_STREAMING_PROFILE = "full_hd";

/**
 * Queue Cloudinary's adaptive HLS renditions without blocking post creation.
 * Cloudinary prepares the manifest and its media segments asynchronously.
 */
export async function queueCloudinaryHls(publicId) {
  if (typeof publicId !== "string" || !publicId.startsWith("spotli/posts/")) {
    throw new Error(
      "Refusing to prepare HLS for an unexpected Cloudinary asset.",
    );
  }

  const options = {
    resource_type: "video",
    type: "upload",
    eager: [
      {
        streaming_profile: CLOUDINARY_HLS_STREAMING_PROFILE,
        format: "m3u8",
      },
    ],
    eager_async: true,
  };

  // Optional webhook for deployments that have configured a public endpoint.
  // Playback does not depend on this callback; it simply helps operators track
  // completion of Cloudinary's asynchronous eager transformations.
  const notificationUrl = process.env.CLOUDINARY_EAGER_NOTIFICATION_URL?.trim();
  if (notificationUrl) options.eager_notification_url = notificationUrl;

  return cloudinary.uploader.explicit(publicId, options);
}
