import mongoose from "mongoose";
import Post from "../models/Post.js";
import User from "../models/User.js";
import Follow from "../models/Follow.js";

export async function requirePostAccess(req, res, next) {
  try {
    const { postId } = req.params;
    if (!mongoose.isValidObjectId(postId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid post ID." });
    }

    const post = await Post.findById(postId).select("creator").lean();
    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found." });
    }

    const ownerId = String(post.creator);
    if (ownerId === String(req.userId)) return next();

    const creator = await User.findById(post.creator)
      .select("isPrivate")
      .lean();
    if (!creator?.isPrivate) return next();

    const approvedFollow = await Follow.exists({
      follower: req.userId,
      following: post.creator,
      status: { $ne: "pending" },
    });

    if (!approvedFollow) {
      return res.status(403).json({
        success: false,
        code: "PRIVATE_ACCOUNT",
        message: "Only approved followers can access this post.",
      });
    }

    return next();
  } catch (error) {
    console.error("Post privacy check error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to verify post access.",
    });
  }
}
