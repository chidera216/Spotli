import mongoose from "mongoose";
import Bookmark from "../models/Bookmark.js";
import Post from "../models/Post.js";
import Follow from "../models/Follow.js";

export async function getMyBookmarks(req, res) {
  try {
    const bookmarks = await Bookmark.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .populate({
        path: "post",
        populate: {
          path: "creator",
          select: "firstName lastName username avatar isPrivate",
        },
      })
      .lean();

    const populatedPosts = bookmarks
      .map((bookmark) => bookmark.post)
      .filter(Boolean);
    const privateCreatorIds = populatedPosts
      .filter((post) => post.creator?.isPrivate)
      .map((post) => post.creator._id);
    const approvedFollows = privateCreatorIds.length
      ? await Follow.find({
          follower: req.userId,
          following: { $in: privateCreatorIds },
          status: { $ne: "pending" },
        })
          .select("following")
          .lean()
      : [];
    const allowedPrivateIds = new Set(
      approvedFollows.map((item) => String(item.following)),
    );

    return res.status(200).json({
      success: true,
      posts: populatedPosts.filter(
        (post) =>
          !post.creator?.isPrivate ||
          String(post.creator?._id) === String(req.userId) ||
          allowedPrivateIds.has(String(post.creator?._id)),
      ),
    });
  } catch (error) {
    console.error("Get bookmarks error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Unable to load saved posts." });
  }
}

export async function addBookmark(req, res) {
  try {
    const { postId } = req.params;
    if (!mongoose.isValidObjectId(postId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid post ID." });
    }

    const postExists = await Post.exists({ _id: postId });
    if (!postExists) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found." });
    }

    await Bookmark.updateOne(
      { user: req.userId, post: postId },
      { $setOnInsert: { user: req.userId, post: postId } },
      { upsert: true },
    );

    return res.status(200).json({ success: true, bookmarked: true, postId });
  } catch (error) {
    // Duplicate-key races are harmless because the bookmark already exists.
    if (error.code === 11000) {
      return res
        .status(200)
        .json({ success: true, bookmarked: true, postId: req.params.postId });
    }
    console.error("Add bookmark error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Unable to save this post." });
  }
}

export async function removeBookmark(req, res) {
  try {
    const { postId } = req.params;
    if (!mongoose.isValidObjectId(postId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid post ID." });
    }

    await Bookmark.deleteOne({ user: req.userId, post: postId });
    return res.status(200).json({ success: true, bookmarked: false, postId });
  } catch (error) {
    console.error("Remove bookmark error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Unable to remove this saved post." });
  }
}
