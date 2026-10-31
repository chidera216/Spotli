import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import cloudinary from "../config/cloudinary.js";
import Post from "../models/Post.js";
import {
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
} from "../utils/cloudinaryLimits.js";
import { queueCloudinaryHls } from "../utils/cloudinaryHls.js";

const ALLOWED_RESOURCE_TYPES = new Set(["image", "video"]);

export async function createUploadSignature(req, res) {
  try {
    const { resourceType, folder, fileSize } = req.body || {};

    if (!ALLOWED_RESOURCE_TYPES.has(resourceType)) {
      return res.status(400).json({
        success: false,
        message: "Unsupported media type.",
      });
    }

    const allowedFolders = {
      image: ["spotli/posts", "spotli/avatars"],
      video: ["spotli/posts"],
    };

    if (!allowedFolders[resourceType].includes(folder)) {
      return res.status(400).json({
        success: false,
        message: "Invalid upload folder.",
      });
    }

    const parsedFileSize = Number(fileSize);
    const maxFileSize =
      resourceType === "image" ? MAX_IMAGE_SIZE_BYTES : MAX_VIDEO_SIZE_BYTES;
    if (
      !Number.isSafeInteger(parsedFileSize) ||
      parsedFileSize <= 0 ||
      parsedFileSize > maxFileSize
    ) {
      return res.status(400).json({
        success: false,
        message:
          resourceType === "image"
            ? "Image files must be within your configured Cloudinary image size limit."
            : "Videos must be within your configured Cloudinary video size limit. On the Free plan, this is 100 MB; larger originals require an eligible plan or compression before upload.",
      });
    }

    if (
      !process.env.CLOUDINARY_API_SECRET ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_CLOUD_NAME
    ) {
      console.error("Cloudinary signing credentials are not configured.");
      return res.status(503).json({
        success: false,
        message: "Cloudinary uploads are not configured on the server.",
      });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = randomUUID();
    // The owner marker lets the API verify that a client cannot attach another
    // user's Cloudinary asset to a Spotli post. The API secret stays server-side.
    const context = `spotli_owner=${String(req.userId)}`;

    // Keep the VIDEO upload request as lightweight as possible. An incoming
    // video transformation must be processed before Cloudinary stores the
    // transformed original and can add noticeable delay before the upload call
    // completes. We upload the source directly, then Cloudinary prepares HLS
    // asynchronously after Spotli verifies and publishes the asset.
    // Image incoming transformations remain enabled because they are small and
    // normalize image/avatars in Cloudinary before storage.
    const transformation =
      resourceType === "image"
        ? folder === "spotli/avatars"
          ? "c_limit,h_1024,w_1024,q_auto:good"
          : "c_limit,h_2560,w_2560,q_auto:good"
        : undefined;
    const outputFormat = resourceType === "image" ? "webp" : undefined;

    const paramsToSign = {
      folder,
      public_id: publicId,
      timestamp,
      context,
      overwrite: false,
      ...(transformation ? { transformation } : {}),
      ...(outputFormat ? { format: outputFormat } : {}),
    };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET,
    );

    return res.status(200).json({
      success: true,
      signature,
      timestamp,
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      folder,
      publicId,
      context,
      overwrite: false,
      ...(transformation ? { transformation } : {}),
      ...(outputFormat ? { format: outputFormat } : {}),
      resourceType,
      maxFileSize,
    });
  } catch (error) {
    console.error(
      "Create Cloudinary signature error:",
      error?.message || error,
    );

    return res.status(500).json({
      success: false,
      message: "Unable to authorize media upload.",
    });
  }
}

export async function prepareCloudinaryVideoPlayback(req, res) {
  try {
    const { publicId } = req.body || {};
    if (typeof publicId !== "string" || !publicId.startsWith("spotli/posts/")) {
      return res.status(400).json({
        success: false,
        message: "Invalid video asset.",
      });
    }

    const asset = await cloudinary.api.resource(publicId, {
      resource_type: "video",
      type: "upload",
    });

    const owner = asset?.context?.custom?.spotli_owner;
    if (String(owner || "") !== String(req.userId)) {
      return res.status(403).json({
        success: false,
        message: "You cannot prepare playback for this video.",
      });
    }

    const result = await queueCloudinaryHls(publicId);
    return res.status(202).json({
      success: true,
      status: "queued",
      batchId: result?.batch_id || null,
      message:
        "Cloudinary is preparing adaptive playback renditions in the background.",
    });
  } catch (error) {
    console.error("Prepare Cloudinary video playback error:", error.message);
    return res.status(502).json({
      success: false,
      message: "Cloudinary playback optimization could not be queued yet.",
    });
  }
}

/**
 * Cloudinary posts eager transformation results to this endpoint.
 * app.js preserves the exact JSON bytes in req.rawBody so the signature is
 * checked against the payload Cloudinary actually sent, not re-serialized JSON.
 */
export function handleCloudinaryEagerNotification(req, res) {
  const secret = process.env.CLOUDINARY_API_SECRET;
  const timestamp = String(req.get("x-cld-timestamp") || "");
  const signature = String(req.get("x-cld-signature") || "");
  const rawBody = Buffer.isBuffer(req.rawBody)
    ? req.rawBody.toString("utf8")
    : Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : "";

  if (
    !secret ||
    !rawBody ||
    !/^\d+$/.test(timestamp) ||
    !/^[a-f0-9]+$/i.test(signature)
  ) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid Cloudinary notification." });
  }

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 2 * 60 * 60) {
    return res
      .status(401)
      .json({ success: false, message: "Expired Cloudinary notification." });
  }

  const received = Buffer.from(signature.toLowerCase(), "hex");
  const validSignature = ["sha1", "sha256"].some((algorithm) => {
    const expected = createHash(algorithm)
      .update(`${rawBody}${timestamp}${secret}`, "utf8")
      .digest();
    return (
      received.length === expected.length && timingSafeEqual(received, expected)
    );
  });

  if (!validSignature) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid Cloudinary signature." });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res
      .status(400)
      .json({ success: false, message: "Malformed Cloudinary notification." });
  }

  const publicId = payload?.asset?.public_id || payload?.public_id || "unknown";
  const eagerItems = Array.isArray(payload?.eager)
    ? payload.eager
    : payload?.eager && typeof payload.eager === "object"
      ? [payload.eager]
      : [];
  const failedItems = eagerItems.filter((item) =>
    ["failed", "error"].includes(
      String(item?.status || item?.state || "").toLowerCase(),
    ),
  );
  const status = String(
    payload?.status ||
      (failedItems.length
        ? "failed"
        : eagerItems.length
          ? "completed"
          : "unknown"),
  ).toLowerCase();

  if (status === "failed" || failedItems.length > 0) {
    console.error("Cloudinary eager video optimization failed:", {
      publicId,
      error:
        payload?.error ||
        failedItems.map((item) => item?.error || item?.state || "failed"),
    });
  } else {
    console.info("Cloudinary eager video optimization notification:", {
      publicId,
      status,
      eagerCount: eagerItems.length,
    });
  }

  return res.status(200).json({ success: true });
}

export async function discardCloudinaryUpload(req, res) {
  try {
    const { publicId, resourceType } = req.body || {};
    if (
      typeof publicId !== "string" ||
      !publicId.startsWith("spotli/posts/") ||
      !["image", "video"].includes(resourceType)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid staged upload." });
    }

    // Never delete an asset that is already referenced by a published post.
    const inUse = await Post.exists({
      $or: [{ mediaPublicIds: publicId }, { thumbnailPublicId: publicId }],
    });
    if (inUse) {
      return res.status(409).json({
        success: false,
        message: "This upload is already attached to a post.",
      });
    }

    let asset;
    try {
      asset = await cloudinary.api.resource(publicId, {
        resource_type: resourceType,
      });
    } catch (error) {
      if (error?.http_code === 404 || error?.error?.http_code === 404) {
        return res.status(200).json({ success: true, discarded: false });
      }
      throw error;
    }

    const owner = asset?.context?.custom?.spotli_owner;
    if (String(owner || "") !== String(req.userId)) {
      return res
        .status(403)
        .json({ success: false, message: "You cannot discard this upload." });
    }

    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true,
    });
    return res
      .status(200)
      .json({ success: true, discarded: result.result === "ok" });
  } catch (error) {
    console.error("Discard Cloudinary upload error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to discard the staged upload.",
    });
  }
}
