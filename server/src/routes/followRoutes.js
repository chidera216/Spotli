import { Router } from "express";
import {
  getFollowStats,
  getFollowList,
  followUser,
  unfollowUser,
  getMyFollowRequests,
  respondToFollowRequest,
} from "../controllers/followController.js";
import {
  getCreatorPosts,
  getPublicProfile,
  searchUsers,
} from "../controllers/userController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/search", protect, searchUsers);
router.get("/follow-requests/me", protect, getMyFollowRequests);
router.patch("/me/follow-request/:followerId", protect, respondToFollowRequest);
router.get("/:userId/profile", protect, getPublicProfile);
router.get("/:userId/posts", protect, getCreatorPosts);

router.get("/:userId/follow-stats", protect, getFollowStats);
router.get("/:userId/follow-list", protect, getFollowList);
router.post("/:userId/follow", protect, followUser);
router.delete("/:userId/follow", protect, unfollowUser);

export default router;
