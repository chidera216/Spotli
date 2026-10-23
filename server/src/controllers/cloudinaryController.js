import { randomUUID } from "node:crypto";
import cloudinary from "../config/cloudinary.js";

const MAX_VIDEO_SIZE = 500 * 1024 * 1024;
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

const ALLOWED_RESOURCE_TYPES = new Set(["image", "video"]);

export async function createUploadSignature(req, res) {
  try {
    const { resourceType, folder, fileSize } = req.body;

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
    const maxSize = resourceType === "video" ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;

    if (
      !Number.isSafeInteger(parsedFileSize) ||
      parsedFileSize <= 0 ||
      parsedFileSize > maxSize
    ) {
      return res.status(400).json({
        success: false,
        message:
          resourceType === "video"
            ? "Video files must be 500 MB or smaller."
            : "Image files must be 20 MB or smaller.",
      });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = randomUUID();

    const paramsToSign = {
      folder,
      public_id: publicId,
      timestamp,
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
      resourceType,
    });
  } catch (error) {
    console.error("Create Cloudinary signature error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to authorize media upload.",
    });
  }
}
