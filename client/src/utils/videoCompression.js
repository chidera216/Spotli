const MIN_COMPRESS_BYTES = 12 * 1024 * 1024;
const MAX_BUFFER_FALLBACK_BYTES = 75 * 1024 * 1024;
const MAX_DIMENSION = 1280;
const VIDEO_BITRATE = 1_400_000;
const AUDIO_BITRATE = 96_000;

function getOutputName(fileName = "spotli-video") {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  return `${withoutExtension || "spotli-video"}-compressed.mp4`;
}

async function createOutputTarget(file) {
  // Use disk-backed temporary storage where the browser supports it, so large
  // outputs do not need one contiguous in-memory buffer.
  if (typeof navigator !== "undefined" && navigator.storage?.getDirectory) {
    let root;
    let fileHandle;
    let writable;
    let name;
    try {
      root = await navigator.storage.getDirectory();
      const uniqueId =
        globalThis.crypto?.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      name = `spotli-compressed-${uniqueId}.mp4`;
      fileHandle = await root.getFileHandle(name, { create: true });
      writable = await fileHandle.createWritable();
      const { StreamTarget } = await import("mediabunny");
      return {
        target: new StreamTarget(writable, {
          chunked: true,
          chunkSize: 1024 * 1024,
        }),
        async getFile() {
          const diskFile = await fileHandle.getFile();
          return new File([diskFile], getOutputName(file.name), {
            type: "video/mp4",
            lastModified: Date.now(),
          });
        },
        async cleanup() {
          try {
            await root.removeEntry(name);
          } catch {
            // A failed or already-removed temporary file needs no action.
          }
        },
      };
    } catch {
      try {
        await writable?.abort();
      } catch {
        // Ignore cleanup failures when OPFS is unavailable.
      }
      if (root && name) {
        try {
          await root.removeEntry(name);
        } catch {
          // Ignore cleanup failures when OPFS is unavailable.
        }
      }
    }
  }

  // Avoid running large output encodes into RAM on browsers without OPFS.
  if (file.size <= MAX_BUFFER_FALLBACK_BYTES) {
    const { BufferTarget } = await import("mediabunny");
    const target = new BufferTarget();
    return {
      target,
      async getFile() {
        const buffer = target.buffer;
        if (!buffer || buffer.byteLength === 0) {
          throw new Error("Video compression produced an empty file.");
        }
        return new File([buffer], getOutputName(file.name), {
          type: "video/mp4",
          lastModified: Date.now(),
        });
      },
      async cleanup() {},
    };
  }

  return null;
}

/**
 * Compress a local video to H.264/AAC MP4 before upload.
 * If the browser cannot perform this safely, return the original file so
 * publishing still works. Compression is intentionally skipped for small files.
 */
export async function compressVideoForUpload(
  file,
  { onProgress, shouldCancel } = {},
) {
  const unchanged = (reason = "") => ({
    file,
    compressed: false,
    reason,
    cleanup: async () => {},
  });

  if (!file || file.size < MIN_COMPRESS_BYTES) return unchanged();

  if (
    typeof VideoEncoder === "undefined" ||
    typeof AudioEncoder === "undefined"
  ) {
    return unchanged(
      "This browser cannot safely optimize this video. Uploading the original instead.",
    );
  }

  const outputTarget = await createOutputTarget(file);
  if (!outputTarget) {
    return unchanged(
      "This video is too large to optimize safely in this browser. Uploading the original instead.",
    );
  }

  let input;
  let conversion;
  let keepTemporaryFile = false;

  try {
    if (shouldCancel?.()) throw new Error("UPLOAD_CANCELLED");

    const {
      ALL_FORMATS,
      BlobSource,
      Conversion,
      Input,
      Mp4OutputFormat,
      Output,
      Quality,
    } = await import("mediabunny");

    input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    if (!(await input.canRead())) {
      return unchanged(
        "This video format cannot be optimized in this browser. Uploading the original instead.",
      );
    }

    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) {
      return unchanged(
        "No video track was found to optimize. Uploading the original instead.",
      );
    }
    if (shouldCancel?.()) throw new Error("UPLOAD_CANCELLED");

    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: "fragmented" }),
      target: outputTarget.target,
    });

    conversion = await Conversion.init({
      input,
      output,
      video: async (track) => {
        const originalWidth = await track.getDisplayWidth();
        const originalHeight = await track.getDisplayHeight();
        const longestSide = Math.max(originalWidth, originalHeight);
        const scale = Math.min(1, MAX_DIMENSION / longestSide);
        const width = Math.max(2, Math.floor((originalWidth * scale) / 2) * 2);
        const height = Math.max(
          2,
          Math.floor((originalHeight * scale) / 2) * 2,
        );

        return {
          width,
          height,
          fit: "contain",
          codec: "avc",
          quality: new Quality({ bitrate: VIDEO_BITRATE }),
          hardwareAcceleration: "prefer-hardware",
          forceTranscode: true,
        };
      },
      audio: {
        codec: "aac",
        quality: new Quality({ bitrate: AUDIO_BITRATE }),
        forceTranscode: true,
      },
    });

    if (!conversion.isValid) {
      return unchanged(
        "This video cannot be compressed with the available browser codecs. Uploading the original instead.",
      );
    }

    let cancelIssued = false;
    conversion.onProgress = (progress) => {
      if (shouldCancel?.()) {
        if (!cancelIssued) {
          cancelIssued = true;
          void conversion.cancel().catch(() => {});
        }
        return;
      }
      if (typeof onProgress === "function") {
        onProgress(Math.max(0, Math.min(100, Math.round(progress * 100))));
      }
    };

    await conversion.execute();
    if (shouldCancel?.()) throw new Error("UPLOAD_CANCELLED");

    const compressedFile = await outputTarget.getFile();
    if (!compressedFile.size || compressedFile.size >= file.size * 0.95) {
      return unchanged(
        "This video is already efficiently compressed. Uploading the original instead.",
      );
    }

    keepTemporaryFile = true;
    return {
      file: compressedFile,
      compressed: true,
      originalSize: file.size,
      compressedSize: compressedFile.size,
      cleanup: outputTarget.cleanup,
    };
  } catch (error) {
    if (shouldCancel?.() || error?.message === "UPLOAD_CANCELLED") {
      throw new Error("UPLOAD_CANCELLED");
    }
    console.warn(
      "Spotli video compression failed; using original file.",
      error,
    );
    return unchanged(
      "Video compression wasn't available for this file. Uploading the original instead.",
    );
  } finally {
    input?.dispose();
    if (!keepTemporaryFile) await outputTarget.cleanup();
  }
}
