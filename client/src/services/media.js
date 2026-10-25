/**
 * Derive a lightweight poster image from a Cloudinary video URL.
 * This avoids downloading the original MP4 just to paint a feed thumbnail.
 * Returns an empty string for local or non-Cloudinary media URLs.
 */
export function getCloudinaryVideoThumbnailUrl(
  value,
  width = 720,
  height = 405,
) {
  if (typeof value !== "string" || !value.trim()) return "";

  const url = value.trim();
  if (!/^https?:\/\/res\.cloudinary\.com\//i.test(url)) return "";

  const marker = "/video/upload/";
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) return "";

  const assetPath = url.slice(markerIndex + marker.length).split(/[?#]/, 1)[0];
  const firstSegment = assetPath.split("/")[0];

  // Do not stack another transformation onto a URL that is already transformed.
  if (!assetPath || firstSegment.includes(",")) return "";

  const assetPathWithoutExtension = assetPath.replace(
    /\.(mp4|mov|m4v|webm|avi|mkv)$/i,
    "",
  );

  if (!assetPathWithoutExtension) return "";

  return `${url.slice(0, markerIndex + marker.length)}so_0,w_${width},h_${height},c_fill,q_auto,f_jpg/${assetPathWithoutExtension}.jpg`;
}

export function isVideoMediaUrl(value) {
  return (
    typeof value === "string" &&
    (/\/video\/upload\//i.test(value) ||
      /\.(mp4|mov|m4v|webm|avi|mkv)(?:[?#]|$)/i.test(value))
  );
}
