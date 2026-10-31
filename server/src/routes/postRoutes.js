import { Router } from "express";

import {
  createUploadSignature,
  discardCloudinaryUpload,
  prepareCloudinaryVideoPlayback,
  handleCloudinaryEagerNotification,
} from "../controllers/cloudinaryController.js";

import {
  getPosts,
  createPost,
  likePost,
  unlikePost,
  getMyLikes,
  deletePost,
} from "../controllers/postController.js";

import { protect } from "../middleware/authMiddleware.js";
import { requirePostAccess } from "../middleware/postPrivacy.js";
import commentRoutes from "./commentRoutes.js";

const router = Router();

// Cloudinary callbacks are authenticated by their signed notification headers,
// not by the browser's cookie session.
router.post(
  "/cloudinary/eager-notification",
  handleCloudinaryEagerNotification,
);

router.get("/", protect, getPosts);

// Comments for a specific post
router.use("/:postId/comments", commentRoutes);

// Must be authenticated to retrieve your own liked posts.
router.get("/likes/me", protect, getMyLikes);

router.post("/", protect, createPost);

router.delete("/:postId", protect, deletePost);

router.post("/:postId/like", protect, requirePostAccess, likePost);
router.delete("/:postId/like", protect, requirePostAccess, unlikePost);
router.post("/upload-signature", protect, createUploadSignature);
router.post("/prepare-video-playback", protect, prepareCloudinaryVideoPlayback);
router.post("/discard-upload", protect, discardCloudinaryUpload);

export default router;
