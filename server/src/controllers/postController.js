import fs from "node:fs/promises";
import mongoose from "mongoose";

import User from "../models/User.js";
import Post from "../models/Post.js";
import Like from "../models/Like.js";
import Comment from "../models/Comment.js";

export async function getPosts(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);

    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 20),
    );

    const skip = (page - 1) * limit;

    const [posts, totalPosts] = await Promise.all([
      Post.find()
        .populate("creator", "firstName lastName avatar email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Post.countDocuments(),
    ]);

    // Count every comment and reply belonging to each post.
    // Replies are included because every saved comment/reply is a
    // separate document in the Comment collection.
    const postIds = posts.map((post) => post._id);

    const commentCounts =
      postIds.length > 0
        ? await Comment.aggregate([
            {
              $match: {
                post: { $in: postIds },
              },
            },
            {
              $group: {
                _id: "$post",
                count: { $sum: 1 },
              },
            },
          ])
        : [];

    const countsByPostId = new Map(
      commentCounts.map((item) => [String(item._id), item.count]),
    );

    const postsWithAccurateCounts = posts.map((post) => ({
      ...post,
      commentsCount: countsByPostId.get(String(post._id)) ?? 0,
    }));

    return res.status(200).json({
      success: true,
      posts: postsWithAccurateCounts,
      pagination: {
        page,
        limit,
        totalPosts,
        totalPages: Math.ceil(totalPosts / limit),
        hasNextPage: page * limit < totalPosts,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Get posts error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve posts.",
    });
  }
}

export async function createPost(req, res) {
  const uploadedFiles = [
    ...(req.files?.media || []),
    ...(req.files?.thumbnail || []),
  ];

  try {
    const caption =
      typeof req.body.caption === "string" ? req.body.caption.trim() : "";

    const mediaFiles = req.files?.media || [];
    const thumbnailFile = req.files?.thumbnail?.[0];

    if (mediaFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please upload at least one media file.",
      });
    }

    const mediaUrls = mediaFiles.map((file) => `/uploads/${file.filename}`);

    const mediaType = mediaFiles[0].mimetype.startsWith("image/")
      ? "photo"
      : "video";

    const thumbnailUrl = thumbnailFile
      ? `/uploads/${thumbnailFile.filename}`
      : "";

    const post = await Post.create({
      creator: req.userId,
      caption,
      mediaUrl: mediaUrls[0],
      mediaUrls,
      mediaType,
      thumbnailUrl,
    });

    const populatedPost = await Post.findById(post._id).populate(
      "creator",
      "firstName lastName avatar email",
    );

    return res.status(201).json({
      success: true,
      message: "Post created successfully.",
      post: populatedPost,
    });
  } catch (error) {
    console.error("Create post error:", error.message);

    await Promise.all(
      uploadedFiles.map(async (file) => {
        try {
          await fs.unlink(file.path);
        } catch (cleanupError) {
          console.error("Uploaded file cleanup error:", cleanupError.message);
        }
      }),
    );

    return res.status(500).json({
      success: false,
      message: "Unable to create post.",
    });
  }
}

export async function likePost(req, res) {
  try {
    const { postId } = req.params;

    if (!mongoose.isValidObjectId(postId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid post ID.",
      });
    }

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found.",
      });
    }

    try {
      await Like.create({
        user: req.userId,
        post: postId,
      });

      await Post.updateOne({ _id: postId }, { $inc: { likesCount: 1 } });
    } catch (error) {
      // Ignore duplicate likes; the unique index prevents duplicates.
      if (error.code !== 11000) {
        throw error;
      }
    }

    const updatedPost = await Post.findById(postId).select("likesCount");

    return res.status(200).json({
      success: true,
      liked: true,
      likesCount: updatedPost.likesCount,
    });
  } catch (error) {
    console.error("Like post error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to like post.",
    });
  }
}

export async function unlikePost(req, res) {
  try {
    const { postId } = req.params;

    if (!mongoose.isValidObjectId(postId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid post ID.",
      });
    }

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found.",
      });
    }

    const deletedLike = await Like.findOneAndDelete({
      user: req.userId,
      post: postId,
    });

    if (deletedLike) {
      await Post.updateOne(
        {
          _id: postId,
          likesCount: { $gt: 0 },
        },
        { $inc: { likesCount: -1 } },
      );
    }

    const updatedPost = await Post.findById(postId).select("likesCount");

    return res.status(200).json({
      success: true,
      liked: false,
      likesCount: updatedPost.likesCount,
    });
  } catch (error) {
    console.error("Unlike post error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to unlike post.",
    });
  }
}

export async function getMyLikes(req, res) {
  try {
    const likes = await Like.find({ user: req.userId })
      .select("post -_id")
      .lean();

    const postIds = likes.map((like) => String(like.post));

    return res.status(200).json({
      success: true,
      postIds,
    });
  } catch (error) {
    console.error("Get my likes error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve your liked posts.",
    });
  }
}
