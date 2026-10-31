import { mkdirSync, createReadStream } from "node:fs";
import { stat, rm } from "node:fs/promises";
import path from "node:path";
import { Server as TusServer } from "@tus/server";
import { FileStore } from "@tus/file-store";

import cloudinary from "../config/cloudinary.js";
import { CLOUDINARY_HLS_STREAMING_PROFILE } from "../utils/cloudinaryHls.js";

const COMPRESSION_THRESHOLD_BYTES = 70_000_000;
const MAX_UPLOAD_BYTES = 80_000_000;
const MAX_COMPRESSED_BYTES = 30_000_000;
const CLOUDINARY_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_CLOUDINARY_ATTEMPTS = 3;
const JOB_RETENTION_MS = 6 * 60 * 60 * 1000;
const TUS_DIRECTORY = path.resolve(
  process.env.TUS_UPLOAD_DIR || path.join(process.cwd(), "tmp", "tus"),
);
// Keep local Vite dev and preview origins allowed even if .env only lists one.
const CLIENT_ORIGINS = [
  ...new Set([
    "http://localhost:5173",
    "http://localhost:4173",
    ...String(process.env.CLIENT_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  ]),
];

mkdirSync(TUS_DIRECTORY, { recursive: true });

const uploadJobs = new Map();

function getNodeRequest(request) {
  return request?.runtime?.node?.req || request;
}

function normalizeErrorMessage(
  error,
  fallback = "Cloudinary could not complete the video upload.",
) {
  const message = error?.error?.message || error?.message;
  if (
    typeof message === "string" &&
    message.trim() &&
    message !== "[object Object]"
  ) {
    return message.trim();
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") return serialized;
  } catch {
    // Keep the safe fallback for circular or non-serializable errors.
  }
  return fallback;
}

function getHttpCode(error) {
  const value = Number(
    error?.http_code ??
      error?.httpCode ??
      error?.error?.http_code ??
      error?.statusCode ??
      error?.status,
  );
  return Number.isFinite(value) && value > 0 ? value : null;
}

function cleanupExpiredJobs() {
  const expiredBefore = Date.now() - JOB_RETENTION_MS;
  for (const [uploadId, job] of uploadJobs) {
    if (job.updatedAt < expiredBefore && job.status !== "processing") {
      uploadJobs.delete(uploadId);
    }
  }
}

async function removeTusUpload(uploadId, filePath = "") {
  try {
    await tusServer.datastore.remove(uploadId);
  } catch (error) {
    // The datastore record can already be gone if cleanup is retried.
    if (
      !/not found|does not exist|ENOENT/i.test(normalizeErrorMessage(error, ""))
    ) {
      console.warn("Spotli TUS cleanup warning:", normalizeErrorMessage(error));
    }
  }
  if (filePath) {
    try {
      await rm(filePath, { force: true });
    } catch (error) {
      console.warn(
        "Spotli temporary video cleanup warning:",
        normalizeErrorMessage(error),
      );
    }
  }
}

function isRetryableCloudinaryError(error) {
  const code = getHttpCode(error);
  if (code && code >= 400 && code < 500) return false;
  if (code && code >= 500) return true;
  const errorCode = String(error?.code || error?.error?.code || "");
  return [
    "ETIMEDOUT",
    "ECONNRESET",
    "ECONNREFUSED",
    "EPIPE",
    "ENETUNREACH",
    "EHOSTUNREACH",
  ].includes(errorCode);
}

function createCloudinaryStreamJob(uploadId, filePath, fileSizeBytes, job) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const source = createReadStream(filePath);
    let destination;
    let timeout;
    let lastLogAt = 0;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      job.source = null;
      job.cloudinaryStream = null;
      callback(value);
    };

    const fail = (error) => {
      if (settled) return;
      const safeError =
        error instanceof Error
          ? error
          : Object.assign(new Error(normalizeErrorMessage(error)), {
              httpCode: getHttpCode(error),
              code: error?.code || error?.error?.code,
              error: error?.error,
            });
      finish(reject, safeError);
      source.destroy();
      destination?.destroy();
    };

    timeout = setTimeout(() => {
      const error = new Error(
        "Cloudinary video upload timed out after 10 minutes.",
      );
      error.code = "ETIMEDOUT";
      fail(error);
    }, CLOUDINARY_TIMEOUT_MS);
    timeout.unref?.();

    job.source = source;
    job.cloudinaryStream = destination;
    job.progressBytes = 0;
    job.totalBytes = fileSizeBytes;
    job.stage = "cloudinary";
    job.updatedAt = Date.now();

    source.on("data", (chunk) => {
      if (job.cancelled) {
        fail(new Error("Upload was cancelled."));
        return;
      }
      job.progressBytes = Math.min(
        fileSizeBytes,
        job.progressBytes + chunk.length,
      );
      job.updatedAt = Date.now();
      const now = Date.now();
      if (now - lastLogAt >= 1000) {
        lastLogAt = now;
        console.info("Spotli Cloudinary stream progress", {
          uploadId,
          uploadedBytes: job.progressBytes,
          fileSizeBytes,
          progressPercent: Number(
            ((job.progressBytes / Math.max(1, fileSizeBytes)) * 100).toFixed(1),
          ),
        });
      }
    });
    source.once("error", fail);
    source.once("end", () => {
      if (!settled) {
        job.stage = "confirming";
        job.updatedAt = Date.now();
      }
    });

    destination = cloudinary.uploader.upload_stream(
      {
        resource_type: "video",
        folder: "spotli/posts",
        public_id: uploadId,
        context: `spotli_owner=${String(job.userId)}|spotli_eager_hls=1`,
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
        ...(process.env.CLOUDINARY_EAGER_NOTIFICATION_URL
          ? {
              eager_notification_url:
                process.env.CLOUDINARY_EAGER_NOTIFICATION_URL,
            }
          : {}),
        use_filename: false,
        unique_filename: false,
        // Reusing the same unique public_id makes retrying an uncertain network
        // outcome idempotent instead of leaving duplicate Cloudinary assets.
        overwrite: true,
      },
      (error, result) => {
        if (error) {
          fail(error);
          return;
        }
        if (
          !result?.public_id ||
          !result?.secure_url ||
          result.resource_type !== "video"
        ) {
          fail(new Error("Cloudinary did not confirm a valid video asset."));
          return;
        }
        job.progressBytes = fileSizeBytes;
        finish(resolve, result);
      },
    );
    job.cloudinaryStream = destination;
    destination.once("error", fail);

    source.pipe(destination);
  });
}

async function processCloudinaryUpload(uploadId, upload) {
  const job = uploadJobs.get(uploadId);
  if (!job || job.status !== "processing") return;

  const filePath = upload?.storage?.path || path.join(TUS_DIRECTORY, uploadId);
  job.filePath = filePath;
  job.stage = "cloudinary";
  job.updatedAt = Date.now();

  try {
    const fileStats = await stat(filePath);
    const originalSizeBytes = Number(
      upload?.metadata?.originalsizebytes || fileStats.size,
    );
    const preparedSizeBytes = Number(
      upload?.metadata?.preparedsizebytes || fileStats.size,
    );
    const compressionRequired =
      originalSizeBytes >= COMPRESSION_THRESHOLD_BYTES;

    if (fileStats.size <= 0 || fileStats.size >= MAX_UPLOAD_BYTES) {
      throw Object.assign(
        new Error(
          `The received video must be smaller than 80 MB; received ${(fileStats.size / 1_000_000).toFixed(1)} MB.`,
        ),
        { httpCode: 413 },
      );
    }
    if (preparedSizeBytes !== fileStats.size) {
      throw Object.assign(
        new Error(
          `The TUS stored file size (${fileStats.size} bytes) does not match the prepared file size (${preparedSizeBytes} bytes).`,
        ),
        { httpCode: 400 },
      );
    }
    if (compressionRequired && fileStats.size >= MAX_COMPRESSED_BYTES) {
      throw Object.assign(
        new Error(
          `Large video reached the server at ${(fileStats.size / 1_000_000).toFixed(1)} MB. It must be compressed below 30 MB before Cloudinary upload.`,
        ),
        { httpCode: 413 },
      );
    }

    job.totalBytes = fileStats.size;
    console.info("Spotli file staged for Cloudinary", {
      uploadId,
      originalSizeBytes,
      preparedSizeBytes,
      actualStoredFileBytes: fileStats.size,
      compressionRequired,
      isCompressed: upload?.metadata?.iscompressed === "1",
    });

    let asset;
    let lastError;
    for (let attempt = 1; attempt <= MAX_CLOUDINARY_ATTEMPTS; attempt += 1) {
      if (job.cancelled) throw new Error("Upload was cancelled.");
      job.attempt = attempt;
      job.progressBytes = 0;
      job.updatedAt = Date.now();
      try {
        asset = await createCloudinaryStreamJob(
          uploadId,
          filePath,
          fileStats.size,
          job,
        );
        break;
      } catch (error) {
        lastError = error;
        const httpCode = getHttpCode(error);
        console.error("Spotli Cloudinary upload attempt failed:", {
          uploadId,
          attempt,
          maxAttempts: MAX_CLOUDINARY_ATTEMPTS,
          message: normalizeErrorMessage(error),
          httpCode,
          fileSizeBytes: fileStats.size,
        });
        if (
          attempt >= MAX_CLOUDINARY_ATTEMPTS ||
          !isRetryableCloudinaryError(error) ||
          job.cancelled
        ) {
          throw error;
        }
        job.stage = "retrying";
        job.progressBytes = 0;
        job.updatedAt = Date.now();
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }

    if (job.cancelled) {
      if (asset?.public_id) {
        await cloudinary.uploader
          .destroy(asset.public_id, {
            resource_type: "video",
            invalidate: true,
          })
          .catch(() => {});
      }
      throw new Error("Upload was cancelled.");
    }

    if (!asset)
      throw lastError || new Error("Cloudinary returned no video asset.");

    job.asset = {
      public_id: asset.public_id,
      resource_type: "video",
      secure_url: asset.secure_url,
      format: asset.format,
      bytes: asset.bytes,
      eager_hls_requested: true,
    };
    job.status = "complete";
    job.stage = "complete";
    job.progressBytes = fileStats.size;
    job.finishedAt = Date.now();
    job.updatedAt = Date.now();
    console.info("Spotli Cloudinary upload complete", {
      uploadId,
      publicId: asset.public_id,
      fileSizeBytes: fileStats.size,
      cloudinaryBytes: asset.bytes,
      attempts: job.attempt,
    });
    await removeTusUpload(uploadId, filePath);
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const statusCode = getHttpCode(error);
    job.status = job.cancelled ? "cancelled" : "failed";
    job.stage = job.status;
    job.error =
      statusCode === 400 &&
      /file size too large|maximum is|size limit/i.test(message)
        ? `Cloudinary rejected this video because of its total file-size limit. Spotli requires a compressed file smaller than 80 MB. ${message}`
        : message;
    job.httpCode = statusCode;
    job.updatedAt = Date.now();
    console.error("Server-side Cloudinary video upload error:", {
      uploadId,
      message: job.error,
      httpCode: statusCode,
      fileSizeBytes: job.totalBytes,
      attempt: job.attempt,
    });
    await removeTusUpload(uploadId, filePath);
  }
}

function queueCloudinaryUpload(upload) {
  const uploadId = String(upload?.id || "");
  if (!uploadId || uploadJobs.has(uploadId)) return;
  const fileSizeBytes = Number(upload?.size || upload?.offset || 0);
  const userId = String(upload?.metadata?.ownerid || "");
  const job = {
    uploadId,
    userId,
    status: "processing",
    stage: "cloudinary",
    progressBytes: 0,
    totalBytes: fileSizeBytes,
    attempt: 0,
    cancelled: false,
    asset: null,
    error: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    source: null,
    cloudinaryStream: null,
    filePath: upload?.storage?.path || path.join(TUS_DIRECTORY, uploadId),
  };
  uploadJobs.set(uploadId, job);
  setImmediate(() => {
    void processCloudinaryUpload(uploadId, upload);
  });
}

const tusServer = new TusServer({
  path: "/api/upload/tus",
  datastore: new FileStore({
    directory: TUS_DIRECTORY,
    expirationPeriodInMilliseconds: 24 * 60 * 60 * 1000,
  }),
  maxSize: MAX_UPLOAD_BYTES - 1,
  allowedOrigins: CLIENT_ORIGINS,
  allowedCredentials: true,
  allowedHeaders: [
    "Tus-Resumable",
    "Upload-Length",
    "Upload-Offset",
    "Upload-Metadata",
    "Upload-Defer-Length",
    "Content-Type",
    "Authorization",
  ],
  exposedHeaders: [
    "Location",
    "Tus-Resumable",
    "Tus-Version",
    "Tus-Extension",
    "Tus-Max-Size",
    "Upload-Offset",
    "Upload-Length",
    "Upload-Metadata",
  ],
  onUploadCreate: async (request, upload) => {
    cleanupExpiredJobs();
    const nodeRequest = getNodeRequest(request);
    const userId = String(nodeRequest?.userId || "");
    if (!userId) throw { status_code: 401, body: "Authentication required." };

    const size = Number(upload?.size);
    if (!Number.isFinite(size) || size <= 0 || size >= MAX_UPLOAD_BYTES) {
      throw {
        status_code: 413,
        body: "Upload must be a video smaller than 80 MB.",
      };
    }

    const metadata = upload?.metadata || {};
    const filetype = String(metadata.filetype || "").toLowerCase();
    if (!filetype.startsWith("video/")) {
      throw {
        status_code: 415,
        body: "Only video uploads are accepted on this endpoint.",
      };
    }

    const originalSizeBytes = Number(metadata.originalsizebytes || size);
    const preparedSizeBytes = Number(metadata.preparedsizebytes || size);
    const isCompressed = metadata.iscompressed === "1";
    const compressionRequired =
      originalSizeBytes >= COMPRESSION_THRESHOLD_BYTES ||
      size >= COMPRESSION_THRESHOLD_BYTES;

    if (!Number.isFinite(preparedSizeBytes) || preparedSizeBytes !== size) {
      throw {
        status_code: 400,
        body: "Prepared video size did not match the TUS upload length. The original was not accepted.",
      };
    }

    if (
      compressionRequired &&
      (!isCompressed ||
        size >= originalSizeBytes ||
        size >= MAX_COMPRESSED_BYTES)
    ) {
      throw {
        status_code: 400,
        body: `This large video must be compressed below 30 MB before upload. Received ${(size / 1_000_000).toFixed(1)} MB. The original file was not accepted.`,
      };
    }

    console.info("Spotli TUS upload initialized", {
      uploadId: upload.id,
      declaredSizeBytes: size,
      originalSizeBytes,
      preparedSizeBytes,
      isCompressed,
      compressionRequired,
    });

    return {
      metadata: {
        ...metadata,
        ownerid: userId,
        filename: String(metadata.filename || "spotli-video.mp4").slice(0, 255),
        originalsizebytes: String(originalSizeBytes),
        preparedsizebytes: String(preparedSizeBytes),
        iscompressed: isCompressed ? "1" : "0",
      },
    };
  },
  onUploadFinish: async (_request, _response, upload) => {
    // Launch Cloudinary forwarding without replacing TUS's standard final PATCH
    // response/headers. The frontend polls /finalize for real backend-stage status.
    queueCloudinaryUpload(upload);
  },
});

export async function tusHandler(req, res) {
  // Protect resumable-session URLs as well as the initial POST. A TUS URL is
  // a capability token, but it must not let another authenticated account read,
  // continue, or terminate someone else's upload.
  const uploadId = String(req.params?.uploadId || "").trim();
  if (uploadId && req.method !== "OPTIONS") {
    try {
      const storedUpload = await tusServer.datastore.getUpload(uploadId);
      const ownerId = String(storedUpload?.metadata?.ownerid || "");
      if (!ownerId || ownerId !== String(req.userId || "")) {
        return res
          .status(403)
          .json({ success: false, message: "You cannot access this upload." });
      }
    } catch {
      // Let TUS return its standard 404/termination response for expired or
      // already-cleaned sessions; don't hide the protocol's normal error.
    }
  }
  return tusServer.handle(req, res);
}

export async function finalizeUpload(req, res) {
  cleanupExpiredJobs();
  const uploadId = String(req.body?.uploadId || "").trim();
  if (!/^[a-f0-9]{32}$/i.test(uploadId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid upload ID." });
  }

  let job = uploadJobs.get(uploadId);
  if (!job) {
    // Recover a TUS upload that finished just before a server restart.
    try {
      const storedUpload = await tusServer.datastore.getUpload(uploadId);
      const ownerId = String(storedUpload?.metadata?.ownerid || "");
      if (!ownerId || ownerId !== String(req.userId)) {
        return res
          .status(404)
          .json({ success: false, message: "Upload session not found." });
      }
      if (Number(storedUpload.offset) !== Number(storedUpload.size)) {
        return res
          .status(409)
          .json({
            success: false,
            message: "Video upload has not finished reaching Spotli yet.",
          });
      }
      queueCloudinaryUpload(storedUpload);
      job = uploadJobs.get(uploadId);
    } catch (error) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Upload session expired. Please upload the video again.",
        });
    }
  }

  if (String(job.userId) !== String(req.userId)) {
    return res
      .status(403)
      .json({ success: false, message: "You cannot access this upload." });
  }

  if (job.status === "processing" || job.status === "retrying") {
    const progressPercent =
      job.totalBytes > 0
        ? Math.min(
            99,
            Math.round((job.progressBytes / job.totalBytes) * 1000) / 10,
          )
        : 0;
    return res.status(202).json({
      status: "processing",
      stage: job.stage,
      progressPercent,
      uploadedBytes: job.progressBytes,
      totalBytes: job.totalBytes,
      attempt: job.attempt,
    });
  }

  if (job.status === "failed" || job.status === "cancelled") {
    return res.status(job.status === "cancelled" ? 410 : 502).json({
      status: job.status,
      success: false,
      message:
        job.error ||
        (job.status === "cancelled"
          ? "Upload was cancelled."
          : "Cloudinary upload failed."),
      httpCode: job.httpCode || null,
    });
  }

  return res
    .status(200)
    .json({ status: "complete", success: true, asset: job.asset });
}

export async function cancelUpload(req, res) {
  const uploadId = String(req.body?.uploadId || "").trim();
  if (!/^[a-f0-9]{32}$/i.test(uploadId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid upload ID." });
  }

  const job = uploadJobs.get(uploadId);
  if (job && String(job.userId) !== String(req.userId)) {
    return res
      .status(403)
      .json({ success: false, message: "You cannot cancel this upload." });
  }

  if (job) {
    job.cancelled = true;
    job.updatedAt = Date.now();
    job.source?.destroy(new Error("Upload was cancelled."));
    job.cloudinaryStream?.destroy(new Error("Upload was cancelled."));
    if (job.status === "complete" && job.asset?.public_id) {
      await cloudinary.uploader
        .destroy(job.asset.public_id, {
          resource_type: "video",
          invalidate: true,
        })
        .catch(() => {});
    }
    job.status = "cancelled";
    job.stage = "cancelled";
    job.error = "Upload was cancelled.";
    void removeTusUpload(uploadId, job.filePath);
  } else {
    try {
      const storedUpload = await tusServer.datastore.getUpload(uploadId);
      if (
        String(storedUpload?.metadata?.ownerid || "") !== String(req.userId)
      ) {
        return res
          .status(403)
          .json({ success: false, message: "You cannot cancel this upload." });
      }
      await removeTusUpload(uploadId, storedUpload.storage?.path || "");
    } catch {
      // Already removed or expired.
    }
  }

  return res.status(200).json({ success: true, cancelled: true });
}

// Remove abandoned resumable uploads daily; completed jobs are retained for a
// short period so a client can safely retry the finalize request.
const cleanupTimer = setInterval(
  () => {
    void tusServer.cleanUpExpiredUploads().catch((error) => {
      console.warn(
        "TUS expired-upload cleanup warning:",
        normalizeErrorMessage(error),
      );
    });
    cleanupExpiredJobs();
  },
  60 * 60 * 1000,
);
cleanupTimer.unref?.();
