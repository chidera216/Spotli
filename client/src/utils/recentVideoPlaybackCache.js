// Keeps only the most recently published video files available as local Blob
// URLs for immediate first playback after the Create page navigates to Home.
// The durable Cloudinary URL remains the source of truth for every other visit.
const MAX_RECENT_LOCAL_VIDEOS = 2;
const recentVideoPlaybackUrls = new Map();

function normalizePublicId(value) {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.(mp4|mov|m4v|webm|avi|mkv|m3u8|mpd)$/i, "");
}

export function rememberRecentVideoPlayback(publicId, file) {
  const key = normalizePublicId(publicId);
  if (
    !key ||
    !file ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  )
    return "";

  const previousUrl = recentVideoPlaybackUrls.get(key);
  if (previousUrl) {
    try {
      URL.revokeObjectURL(previousUrl);
    } catch {
      // Replacing a cache entry must never block successful publishing.
    }
    recentVideoPlaybackUrls.delete(key);
  }

  let localUrl = "";
  try {
    localUrl = URL.createObjectURL(file);
  } catch {
    return "";
  }

  recentVideoPlaybackUrls.set(key, localUrl);
  while (recentVideoPlaybackUrls.size > MAX_RECENT_LOCAL_VIDEOS) {
    const oldestKey = recentVideoPlaybackUrls.keys().next().value;
    if (!oldestKey) break;
    const oldestUrl = recentVideoPlaybackUrls.get(oldestKey);
    recentVideoPlaybackUrls.delete(oldestKey);
    try {
      URL.revokeObjectURL(oldestUrl);
    } catch {
      // Cache eviction must not affect video playback or post creation.
    }
  }

  console.info("[Spotli playback] Cached the just-uploaded video locally", {
    publicId: key,
    fileSizeBytes: file.size,
    mimeType: file.type || "unknown",
  });
  return localUrl;
}

export function getRecentVideoPlaybackUrl(publicId) {
  const key = normalizePublicId(publicId);
  if (!key) return "";
  const url = recentVideoPlaybackUrls.get(key) || "";
  if (!url) return "";

  // Refresh LRU order when this locally cached video is actually requested.
  recentVideoPlaybackUrls.delete(key);
  recentVideoPlaybackUrls.set(key, url);
  return url;
}
