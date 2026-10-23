import { Router } from "express";
import {
  register,
  login,
  getMe,
  updateProfile,
  logout,
  updateAccountPrivacy,
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", protect, getMe);
router.patch("/me", protect, updateProfile);
router.patch("/me/privacy", protect, updateAccountPrivacy);

export default router;
