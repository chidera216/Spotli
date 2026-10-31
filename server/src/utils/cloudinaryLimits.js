function readPositiveSafeInteger(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

// Defaults match Cloudinary's Free-plan maximum source sizes. If the Cloudinary
// product environment is upgraded, change these values in the server environment
// and the matching VITE_* values in the client environment. Cloudinary's own
// account limit remains authoritative.
export const MAX_IMAGE_SIZE_BYTES = readPositiveSafeInteger(
  "CLOUDINARY_MAX_IMAGE_SIZE_BYTES",
  10 * 1024 * 1024,
);
export const MAX_VIDEO_SIZE_BYTES = readPositiveSafeInteger(
  "CLOUDINARY_MAX_VIDEO_SIZE_BYTES",
  100 * 1024 * 1024,
);
