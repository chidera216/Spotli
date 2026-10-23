import mongoose from "mongoose";
import Comment from "../models/Comment.js";
import Post from "../models/Post.js";
import Notification from "../models/Notification.js";
import { resolveMentionedUsers } from "../utils/mentions.js";

const userFields = "firstName lastName avatar";

export async function getPostComments(req, res) {
  try {
    const { postId } = req.params;

    if (!mongoose.isValidObjectId(postId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid post ID.",
      });
    }

    if (!(await Post.exists({ _id: postId }))) {
      return res.status(404).json({
        success: false,
        message: "Post not found.",
      });
    }

    const all = await Comment.find({ post: postId })
      .populate("user", `${userFields} username`)
      .populate("mentions", "_id username firstName lastName avatar")
      .sort({ createdAt: -1 })
      .lean();

    const currentUserId = req.userId ? String(req.userId) : null;

    const normalized = all.map((comment) => ({
      ...comment,
      likedByMe: currentUserId
        ? (comment.likedBy || []).some(
            (userId) => String(userId) === currentUserId,
          )
        : false,
      likesCount: Array.isArray(comment.likedBy)
        ? comment.likedBy.length
        : Number(comment.likesCount) || 0,
    }));

    const repliesByParent = new Map();

    for (const item of normalized) {
      if (!item.parentComment) continue;

      const key = String(item.parentComment);

      if (!repliesByParent.has(key)) {
        repliesByParent.set(key, []);
      }

      repliesByParent.get(key).push(item);
    }

    const comments = normalized
      .filter((item) => !item.parentComment)
      .map((item) => {
        const replies = repliesByParent.get(String(item._id)) || [];

        return {
          ...item,
          replies,
          repliesCount: replies.length,
        };
      });

    return res.status(200).json({
      success: true,
      comments,
      commentsCount: all.length,
    });
  } catch (error) {
    console.error("Get post comments error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve comments.",
    });
  }
}

export async function createPostComment(req, res) {
  try {
    const { postId } = req.params;
    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    const parentCommentId = req.body.parentCommentId || null;

    if (!mongoose.isValidObjectId(postId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid post ID.",
      });
    }

    if (!text) {
      return res.status(400).json({
        success: false,
        message: "Comment cannot be empty.",
      });
    }

    if (text.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Comment must be 1,000 characters or fewer.",
      });
    }

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found.",
      });
    }

    if (parentCommentId) {
      if (!mongoose.isValidObjectId(parentCommentId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid parent comment ID.",
        });
      }

      const parent = await Comment.findOne({
        _id: parentCommentId,
        post: postId,
      });

      if (!parent) {
        return res.status(404).json({
          success: false,
          message: "Parent comment not found.",
        });
      }

      if (parent.parentComment) {
        return res.status(400).json({
          success: false,
          message: "Replies can only be one level deep.",
        });
      }
    }

    let mentionedUsers = [];
    try {
      mentionedUsers = await resolveMentionedUsers(text, req.userId);
    } catch (mentionError) {
      console.error("Comment mention lookup error:", mentionError.message);
    }

    const comment = await Comment.create({
      post: postId,
      user: req.userId,
      text,
      parentComment: parentCommentId,
      mentions: mentionedUsers.map((user) => user._id),
    });

    if (mentionedUsers.length) {
      try {
        await Notification.insertMany(
          mentionedUsers.map((user) => ({
            recipient: user._id,
            actor: req.userId,
            type: "mention",
            post: post._id,
            comment: comment._id,
            message: text.slice(0, 240),
          })),
          { ordered: false },
        );
      } catch (mentionNotificationError) {
        console.error(
          "Comment mention notification error:",
          mentionNotificationError.message,
        );
      }
    }

    await Post.updateOne({ _id: postId }, { $inc: { commentsCount: 1 } });

    const notificationRecipient = parentCommentId
      ? (await Comment.findById(parentCommentId).select("user"))?.user
      : post.creator;
    if (
      notificationRecipient &&
      String(notificationRecipient) !== String(req.userId)
    ) {
      await Notification.create({
        recipient: notificationRecipient,
        actor: req.userId,
        type: parentCommentId ? "reply" : "comment",
        post: post._id,
        comment: comment._id,
        message: text.slice(0, 240),
      });
    }

    const populatedComment = await Comment.findById(comment._id)
      .populate("user", `${userFields} username`)
      .populate("mentions", "_id username firstName lastName avatar")
      .lean();

    return res.status(201).json({
      success: true,
      message: parentCommentId
        ? "Reply added successfully."
        : "Comment added successfully.",
      comment: {
        ...populatedComment,
        likedByMe: false,
        likesCount: 0,
      },
    });
  } catch (error) {
    console.error("Create post comment error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to add comment.",
    });
  }
}

export async function likePostComment(req, res) {
  try {
    const { postId, commentId } = req.params;
    const userId = req.userId;

    if (
      !mongoose.isValidObjectId(postId) ||
      !mongoose.isValidObjectId(commentId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid post or comment ID.",
      });
    }

    const comment = await Comment.findOneAndUpdate(
      {
        _id: commentId,
        post: postId,
        likedBy: { $ne: userId },
      },
      {
        $addToSet: { likedBy: userId },
      },
      { returnDocument: "after" },
    );

    // If already liked, return the existing state.
    const current =
      comment ||
      (await Comment.findOne({
        _id: commentId,
        post: postId,
      }));

    if (!current) {
      return res.status(404).json({
        success: false,
        message: "Comment not found.",
      });
    }

    const likesCount = current.likedBy.length;

    if (current.likesCount !== likesCount) {
      current.likesCount = likesCount;
      await current.save();
    }

    return res.status(200).json({
      success: true,
      likedByMe: true,
      likesCount,
    });
  } catch (error) {
    console.error("Like comment error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to like comment.",
    });
  }
}

export async function unlikePostComment(req, res) {
  try {
    const { postId, commentId } = req.params;
    const userId = req.userId;

    if (
      !mongoose.isValidObjectId(postId) ||
      !mongoose.isValidObjectId(commentId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid post or comment ID.",
      });
    }

    const comment = await Comment.findOneAndUpdate(
      {
        _id: commentId,
        post: postId,
      },
      {
        $pull: { likedBy: userId },
      },
      { returnDocument: "after" },
    );

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found.",
      });
    }

    const likesCount = comment.likedBy.length;

    if (comment.likesCount !== likesCount) {
      comment.likesCount = likesCount;
      await comment.save();
    }

    return res.status(200).json({
      success: true,
      likedByMe: false,
      likesCount,
    });
  } catch (error) {
    console.error("Unlike comment error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to unlike comment.",
    });
  }
}
