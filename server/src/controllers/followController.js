import mongoose from "mongoose";
import User from "../models/User.js";
import Follow from "../models/Follow.js";
import Notification from "../models/Notification.js";

async function getCounts(userId) {
  const [followersCount, followingCount] = await Promise.all([
    Follow.countDocuments({ following: userId, status: { $ne: "pending" } }),
    Follow.countDocuments({ follower: userId, status: { $ne: "pending" } }),
  ]);

  return { followersCount, followingCount };
}

export async function getFollowStats(req, res) {
  try {
    const { userId } = req.params;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    const targetUser = await User.findById(userId).select("_id isPrivate");

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const [counts, existingFollow] = await Promise.all([
      getCounts(userId),
      Follow.findOne({
        follower: req.userId,
        following: userId,
      }).select("status"),
    ]);

    const isRequested = existingFollow?.status === "pending";
    return res.status(200).json({
      success: true,
      ...counts,
      isFollowing: Boolean(existingFollow && !isRequested),
      isRequested,
      isPrivate: Boolean(targetUser.isPrivate),
    });
  } catch (error) {
    console.error("Get follow stats error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve follow statistics.",
    });
  }
}

export async function followUser(req, res) {
  try {
    const { userId } = req.params;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    if (String(req.userId) === String(userId)) {
      return res.status(400).json({
        success: false,
        message: "You cannot follow yourself.",
      });
    }

    const targetUser = await User.findById(userId).select("_id isPrivate");

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const existingFollow = await Follow.findOne({
      follower: req.userId,
      following: userId,
    });

    if (existingFollow) {
      const counts = await getCounts(userId);
      const isRequested = existingFollow.status === "pending";
      return res.status(200).json({
        success: true,
        isFollowing: !isRequested,
        isRequested,
        ...counts,
      });
    }

    const status = targetUser.isPrivate ? "pending" : "approved";
    await Follow.create({
      follower: req.userId,
      following: userId,
      status,
    });

    await Notification.create({
      recipient: userId,
      actor: req.userId,
      type: status === "pending" ? "follow_request" : "follow",
    });

    const counts = await getCounts(userId);

    return res.status(200).json({
      success: true,
      isFollowing: status === "approved",
      isRequested: status === "pending",
      ...counts,
    });
  } catch (error) {
    console.error("Follow user error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to follow this user.",
    });
  }
}

export async function unfollowUser(req, res) {
  try {
    const { userId } = req.params;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    await Follow.findOneAndDelete({
      follower: req.userId,
      following: userId,
    });

    const counts = await getCounts(userId);

    return res.status(200).json({
      success: true,
      isFollowing: false,
      ...counts,
    });
  } catch (error) {
    console.error("Unfollow user error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to unfollow this user.",
    });
  }
}

export async function getFollowList(req, res) {
  try {
    const { userId } = req.params;
    const type = req.query.type === "following" ? "following" : "followers";
    if (!mongoose.isValidObjectId(userId))
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID." });
    const targetUser = await User.findById(userId).select("_id");
    if (!targetUser)
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    const filter =
      type === "following"
        ? { follower: userId, status: { $ne: "pending" } }
        : { following: userId, status: { $ne: "pending" } };
    const relationField = type === "following" ? "following" : "follower";
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 20),
    );
    const relations = await Follow.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit + 1)
      .populate({
        path: relationField,
        select: "_id firstName lastName username avatar",
      })
      .lean();
    const hasMore = relations.length > limit;
    const users = relations
      .slice(0, limit)
      .map((relation) => relation[relationField])
      .filter(Boolean);
    return res.status(200).json({ success: true, users, page, limit, hasMore });
  } catch (error) {
    console.error("Get follow list error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Unable to retrieve this list." });
  }
}

export async function getMyFollowRequests(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 20),
    );
    const relations = await Follow.find({
      following: req.userId,
      status: "pending",
    })
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit + 1)
      .populate("follower", "_id firstName lastName username avatar")
      .lean();

    const hasMore = relations.length > limit;
    const requests = relations
      .slice(0, limit)
      .map((relation) => ({
        id: String(relation._id),
        requestedAt: relation.createdAt,
        user: relation.follower,
      }))
      .filter((item) => item.user);

    return res
      .status(200)
      .json({ success: true, requests, page, limit, hasMore });
  } catch (error) {
    console.error("Get follow requests error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve follow requests.",
    });
  }
}

export async function respondToFollowRequest(req, res) {
  try {
    const { followerId } = req.params;
    const action = req.body?.action;

    if (
      !mongoose.isValidObjectId(followerId) ||
      !["approve", "reject"].includes(action)
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid follower and action are required.",
      });
    }

    const relation = await Follow.findOne({
      follower: followerId,
      following: req.userId,
      status: "pending",
    });

    if (!relation) {
      return res.status(404).json({
        success: false,
        message: "Follow request not found.",
      });
    }

    if (action === "reject") {
      await Follow.deleteOne({ _id: relation._id });
      return res.status(200).json({ success: true, status: "rejected" });
    }

    relation.status = "approved";
    await relation.save();

    await Notification.create({
      recipient: followerId,
      actor: req.userId,
      type: "follow_approved",
    });

    const counts = await getCounts(req.userId);
    return res.status(200).json({
      success: true,
      status: "approved",
      ...counts,
    });
  } catch (error) {
    console.error("Respond to follow request error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to respond to this follow request.",
    });
  }
}
