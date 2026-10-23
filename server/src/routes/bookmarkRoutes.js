import { Router } from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requirePostAccess } from "../middleware/postPrivacy.js";
import {
  addBookmark,
  getMyBookmarks,
  removeBookmark,
} from "../controllers/bookmarkController.js";

const router = Router();

router.use(protect);
router.get("/", getMyBookmarks);
router.post("/:postId", requirePostAccess, addBookmark);
router.delete("/:postId", removeBookmark);

export default router;
