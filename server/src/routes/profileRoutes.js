import { Router } from "express";
import { getProfilePosts } from "../controllers/profileController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/:userId", protect, getProfilePosts);

export default router;
