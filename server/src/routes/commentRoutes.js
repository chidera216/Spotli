import { Router } from "express";

import {
  createPostComment,
  getPostComments,
  likePostComment,
  unlikePostComment,
} from "../controllers/commentController.js";

import { protect } from "../middleware/authMiddleware.js";
import { requirePostAccess } from "../middleware/postPrivacy.js";

const router = Router({ mergeParams: true });

// Get comments and replies for a post.
router.get("/", protect, requirePostAccess, getPostComments);

// Create a comment or reply.
router.post("/", protect, requirePostAccess, createPostComment);

// Like or unlike a comment or reply.
router.post("/:commentId/like", protect, likePostComment);
router.delete("/:commentId/like", protect, unlikePostComment);

export default router;
