import { Router } from "express";

import {
  getPosts,
  createPost,
  likePost,
  unlikePost,
  getMyLikes,
} from "../controllers/postController.js";

import { protect } from "../middleware/authMiddleware.js";
import upload from "../middleware/upload.js";
import commentRoutes from "./commentRoutes.js";

const router = Router();

router.get("/", getPosts);

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

router.post("/:postId/like", protect, likePost);
router.delete("/:postId/like", protect, unlikePost);

export default router;
