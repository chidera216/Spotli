import mongoose from "mongoose";
import User from "../models/User.js";
import Post from "../models/Post.js";
import Follow from "../models/Follow.js";

export async function searchUsers(req, res) {
  try {
    const query = req.query.q?.trim();

    if (!query || query.length < 2) {
      return res.status(200).json({
        success: true,
        users: [],
        posts: [],
      });
    }

    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const searchRegex = new RegExp(escapedQuery, "i");
    const terms = query
      .split(/\s+/)
      .filter(Boolean)
      .map(
        (term) => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      );

    const userSearchConditions = [
      { username: searchRegex },
      { firstName: searchRegex },
      { lastName: searchRegex },
      ...(terms.length > 1
        ? [
            {
              $and: terms.map((term) => ({
                $or: [
                  { username: term },
                  { firstName: term },
                  { lastName: term },
                ],
              })),
            },
          ]
        : []),
    ];

    const users = await User.find({
      _id: { $ne: req.userId },
      $or: userSearchConditions,
    })
      .select("_id firstName lastName username bio avatar")
      .limit(10)
      .sort({ username: 1 })
      .lean();

    const matchingUserIds = users.map((user) => user._id);
    const privateFollows = await Follow.find({
      follower: req.userId,
      status: { $ne: "pending" },
    })
      .select("following")
      .lean();
    const allowedPrivateIds = privateFollows.map((item) => item.following);
    const visibleCreatorIds = await User.find({
      $or: [
        { isPrivate: { $ne: true } },
        { _id: { $in: allowedPrivateIds } },
        { _id: req.userId },
      ],
    }).distinct("_id");

    const posts = await Post.find({
      creator: { $in: visibleCreatorIds },
      $or: [
        { caption: searchRegex },
        { topics: searchRegex },
        ...(matchingUserIds.length
          ? [{ creator: { $in: matchingUserIds } }]
          : []),
      ],
    })
      .populate("creator", "_id firstName lastName username avatar")
      .sort({ createdAt: -1 })
      .limit(40)
      .lean();

    return res.status(200).json({
      success: true,
      users,
      posts,
    });
  } catch (error) {
    console.error("Search users error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to search for creators.",
    });
  }
}

export async function getPublicProfile(req, res) {
  try {
    const { userId } = req.params;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    const user = await User.findById(userId)
      .select(
        "_id firstName lastName username bio location website avatar isPrivate createdAt",
      )
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Creator not found.",
      });
    }

    return res.status(200).json({ success: true, user });
  } catch (error) {
    console.error("Get public profile error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve this creator's profile.",
    });
  }
}

export async function getCreatorPosts(req, res) {
  try {
    const { userId } = req.params;

    if (!mongoose.isValidObjectId(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID." });
    }

    const creatorExists = await User.exists({ _id: userId });
    if (!creatorExists) {
      return res
        .status(404)
        .json({ success: false, message: "Creator not found." });
    }

    const creator = await User.findById(userId).select("_id isPrivate").lean();
    if (creator?.isPrivate && String(req.userId) !== String(userId)) {
      const approvedFollow = await Follow.exists({
        follower: req.userId,
        following: userId,
        status: { $ne: "pending" },
      });
      if (!approvedFollow) {
        return res.status(403).json({
          success: false,
          code: "PRIVATE_ACCOUNT",
          message:
            "This account is private. Follow to request access to posts.",
        });
      }
    }

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 50),
    );
    const [posts, totalPosts] = await Promise.all([
      Post.find({ creator: userId })
        .select(
          "_id creator caption mentions mediaUrl mediaUrls mediaType thumbnailUrl likesCount commentsCount viewsCount createdAt",
        )
        .populate("creator", "firstName lastName username avatar")
        .populate("mentions", "_id username firstName lastName avatar")
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Post.countDocuments({ creator: userId }),
    ]);

    return res.status(200).json({
      success: true,
      posts,
      pagination: {
        page,
        limit,
        totalPosts,
        totalPages: Math.ceil(totalPosts / limit),
        hasNextPage: page * limit < totalPosts,
      },
    });
  } catch (error) {
    console.error("Get creator posts error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve this creator's posts.",
    });
  }
}
