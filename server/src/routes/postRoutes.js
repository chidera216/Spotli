import { Router } from "express";

import { createUploadSignature } from "../controllers/cloudinaryController.js";

import {
  getPosts,
  createPost,
  likePost,
  unlikePost,
  getMyLikes,
} from "../controllers/postController.js";

import { protect } from "../middleware/authMiddleware.js";
import { requirePostAccess } from "../middleware/postPrivacy.js";
import upload from "../middleware/upload.js";
import commentRoutes from "./commentRoutes.js";

const router = Router();

router.get("/", protect, getPosts);

// Comments for a specific post
router.use("/:postId/comments", commentRoutes);

// Must be authenticated to retrieve your own liked posts.
router.get("/likes/me", protect, getMyLikes);

router.post(
  "/",
  protect,
  upload.fields([
    { name: "media", maxCount: 10 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  createPost,
);

router.post("/:postId/like", protect, requirePostAccess, likePost);
router.delete("/:postId/like", protect, requirePostAccess, unlikePost);
router.post("/upload-signature", protect, createUploadSignature);

export default router;
