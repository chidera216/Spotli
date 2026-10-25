import fs from "node:fs/promises";
import mongoose from "mongoose";

import User from "../models/User.js";
import Post from "../models/Post.js";
import Like from "../models/Like.js";
import Comment from "../models/Comment.js";
import Notification from "../models/Notification.js";
import Follow from "../models/Follow.js";
import { createMentionNotifications } from "../utils/mentions.js";
import cloudinary from "../config/cloudinary.js";
import { queueCloudinaryHls } from "../utils/cloudinaryHls.js";

function getCloudinaryVideoThumbnailUrl(videoUrl) {
  if (typeof videoUrl !== "string" || !videoUrl.trim()) return "";

  const marker = "/video/upload/";
  const markerIndex = videoUrl.indexOf(marker);
  if (
    markerIndex === -1 ||
    !/^https?:\/\/res\.cloudinary\.com\//i.test(videoUrl)
  ) {
    return "";
  }

  const assetPath = videoUrl
    .slice(markerIndex + marker.length)
    .split(/[?#]/, 1)[0];
  if (!assetPath || assetPath.split("/")[0].includes(",")) return "";

  const assetPathWithoutExtension = assetPath.replace(
    /\.(mp4|mov|m4v|webm|avi|mkv)$/i,
    "",
  );
  if (!assetPathWithoutExtension) return "";

  return `${videoUrl.slice(0, markerIndex + marker.length)}so_0,w_720,h_405,c_fill,q_auto,f_jpg/${assetPathWithoutExtension}.jpg`;
}

export async function getPosts(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);

    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 20),
    );

    const skip = (page - 1) * limit;

    const privateFollows = req.userId
      ? await Follow.find({
          follower: req.userId,
          status: { $ne: "pending" },
        })
          .select("following")
          .lean()
      : [];
    const allowedPrivateCreatorIds = privateFollows.map(
      (follow) => follow.following,
    );
    const allowedCreators = await User.find({
      $or: [
        { isPrivate: { $ne: true } },
        ...(allowedPrivateCreatorIds.length
          ? [{ _id: { $in: allowedPrivateCreatorIds } }]
          : []),
        ...(req.userId ? [{ _id: req.userId }] : []),
      ],
    }).distinct("_id");
    const feedFilter = { creator: { $in: allowedCreators } };

    const [posts, totalPosts] = await Promise.all([
      Post.find(feedFilter)
        .populate(
          "creator",
          "firstName lastName avatar email username isPrivate",
        )
        .populate("mentions", "_id username firstName lastName avatar")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Post.countDocuments(feedFilter),
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

  const cloudinaryAssetsToClean = [];

  try {
    const caption =
      typeof req.body.caption === "string" ? req.body.caption.trim() : "";

    let mediaUrls = [];
    let mediaPublicIds = [];
    let mediaResourceTypes = [];
    let mediaType = "";
    let thumbnailUrl = "";
    let thumbnailPublicId = "";

    // New flow: media was uploaded directly from the browser to Cloudinary.
    if (req.body.mediaAssets !== undefined) {
      let mediaAssets;

      try {
        mediaAssets =
          typeof req.body.mediaAssets === "string"
            ? JSON.parse(req.body.mediaAssets)
            : req.body.mediaAssets;
      } catch {
        return res.status(400).json({
          success: false,
          message: "Invalid media asset data.",
        });
      }

      if (!Array.isArray(mediaAssets) || mediaAssets.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Please upload at least one media file.",
        });
      }

      if (mediaAssets.length > 10) {
        return res.status(400).json({
          success: false,
          message: "A post can contain at most 10 media files.",
        });
      }

      const firstResourceType = mediaAssets[0]?.resource_type;
      const isPhotoPost = firstResourceType === "image";

      if (
        !["image", "video"].includes(firstResourceType) ||
        mediaAssets.some(
          (asset) =>
            asset?.resource_type !== firstResourceType ||
            typeof asset?.public_id !== "string" ||
            !asset.public_id.startsWith("spotli/posts/"),
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "The uploaded media assets are invalid.",
        });
      }

      if (!isPhotoPost && mediaAssets.length !== 1) {
        return res.status(400).json({
          success: false,
          message: "A video post can contain only one video.",
        });
      }

      // Verify every asset against Cloudinary's server-side metadata.
      const verifiedAssets = await Promise.all(
        mediaAssets.map(async (asset) => {
          const verified = await cloudinary.api.resource(asset.public_id, {
            resource_type: asset.resource_type,
          });

          if (
            verified.public_id !== asset.public_id ||
            verified.resource_type !== asset.resource_type ||
            !verified.secure_url ||
            !verified.public_id.startsWith("spotli/posts/")
          ) {
            throw new Error("Cloudinary asset verification failed.");
          }

          const allowedFormats = isPhotoPost
            ? ["jpg", "jpeg", "png", "webp"]
            : ["mp4", "mov", "webm"];

          if (!allowedFormats.includes(String(verified.format).toLowerCase())) {
            throw new Error("The uploaded media format is not supported.");
          }

          const maxBytes = isPhotoPost ? 20 * 1024 * 1024 : 500 * 1024 * 1024;

          if (
            !Number.isFinite(verified.bytes) ||
            verified.bytes <= 0 ||
            verified.bytes > maxBytes
          ) {
            throw new Error("The uploaded media exceeds the size limit.");
          }

          return verified;
        }),
      );

      cloudinaryAssetsToClean.push(
        ...verifiedAssets.map((asset) => ({
          public_id: asset.public_id,
          resource_type: asset.resource_type,
        })),
      );

      mediaUrls = verifiedAssets.map((asset) => asset.secure_url);
      mediaPublicIds = verifiedAssets.map((asset) => asset.public_id);
      mediaResourceTypes = verifiedAssets.map((asset) => asset.resource_type);
      mediaType = isPhotoPost ? "photo" : "video";

      let thumbnailAsset = req.body.thumbnailAsset;

      if (typeof thumbnailAsset === "string" && thumbnailAsset.trim()) {
        try {
          thumbnailAsset = JSON.parse(thumbnailAsset);
        } catch {
          return res.status(400).json({
            success: false,
            message: "Invalid thumbnail asset data.",
          });
        }
      }

      if (thumbnailAsset) {
        if (
          typeof thumbnailAsset.public_id !== "string" ||
          !thumbnailAsset.public_id.startsWith("spotli/posts/")
        ) {
          return res.status(400).json({
            success: false,
            message: "The thumbnail asset is invalid.",
          });
        }

        const verifiedThumbnail = await cloudinary.api.resource(
          thumbnailAsset.public_id,
          { resource_type: "image" },
        );

        if (
          verifiedThumbnail.public_id !== thumbnailAsset.public_id ||
          verifiedThumbnail.resource_type !== "image" ||
          !verifiedThumbnail.secure_url ||
          !["jpg", "jpeg", "png", "webp"].includes(
            String(verifiedThumbnail.format).toLowerCase(),
          ) ||
          !Number.isFinite(verifiedThumbnail.bytes) ||
          verifiedThumbnail.bytes <= 0 ||
          verifiedThumbnail.bytes > 10 * 1024 * 1024
        ) {
          throw new Error("Cloudinary thumbnail verification failed.");
        }

        cloudinaryAssetsToClean.push({
          public_id: verifiedThumbnail.public_id,
          resource_type: "image",
        });

        thumbnailUrl = verifiedThumbnail.secure_url;
        thumbnailPublicId = verifiedThumbnail.public_id;
      }
    } else {
      // Legacy flow: retain compatibility with existing local uploads.
      const mediaFiles = req.files?.media || [];
      const thumbnailFile = req.files?.thumbnail?.[0];

      if (mediaFiles.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Please upload at least one media file.",
        });
      }

      mediaUrls = mediaFiles.map((file) => `/uploads/${file.filename}`);
      mediaType = mediaFiles[0].mimetype.startsWith("image/")
        ? "photo"
        : "video";
      thumbnailUrl = thumbnailFile ? `/uploads/${thumbnailFile.filename}` : "";
    }

    // Every Cloudinary video gets a lightweight poster URL even when the
    // creator did not upload a custom thumbnail. This is a URL transformation,
    // not another upload or a backend video-processing job.
    if (mediaType === "video" && !thumbnailUrl && mediaUrls[0]) {
      thumbnailUrl = getCloudinaryVideoThumbnailUrl(mediaUrls[0]);
    }

    if (caption.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Caption must be 2,000 characters or fewer.",
      });
    }

    const post = await Post.create({
      creator: req.userId,
      caption,
      mediaUrl: mediaUrls[0],
      mediaUrls,
      mediaType,
      thumbnailUrl,
      mediaPublicIds,
      mediaResourceTypes,
      thumbnailPublicId,
    });

    // Queue adaptive HLS generation for newly published Cloudinary videos.
    // Do not await this job: post publishing and the Home feed stay responsive
    // while Cloudinary prepares the master playlist and media segments.
    if (mediaType === "video" && mediaPublicIds[0]) {
      void queueCloudinaryHls(mediaPublicIds[0])
        .then(() => {
          console.info(
            `Cloudinary HLS preparation queued for ${mediaPublicIds[0]}`,
          );
        })
        .catch((hlsError) => {
          console.error(
            `Cloudinary HLS preparation failed for ${mediaPublicIds[0]}:`,
            hlsError.message,
          );
        });
    }

    try {
      const mentionedUsers = await createMentionNotifications({
        text: caption,
        actorId: req.userId,
        postId: post._id,
      });

      if (mentionedUsers.length) {
        await Post.updateOne(
          { _id: post._id },
          { $set: { mentions: mentionedUsers.map((user) => user._id) } },
        );
      }
    } catch (mentionError) {
      console.error("Post mention notification error:", mentionError.message);
    }

    const populatedPost = await Post.findById(post._id)
      .populate("creator", "firstName lastName avatar email username")
      .populate("mentions", "_id username firstName lastName avatar");

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

    // If post creation fails after verifying Cloudinary assets,
    // attempt to clean up those newly uploaded assets.
    await Promise.all(
      cloudinaryAssetsToClean.map(async (asset) => {
        try {
          await cloudinary.uploader.destroy(asset.public_id, {
            resource_type: asset.resource_type,
          });
        } catch (cleanupError) {
          console.error(
            "Cloudinary asset cleanup error:",
            cleanupError.message,
          );
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

    let createdLike = false;
    try {
      await Like.create({
        user: req.userId,
        post: postId,
      });
      createdLike = true;

      await Post.updateOne({ _id: postId }, { $inc: { likesCount: 1 } });
    } catch (error) {
      // Ignore duplicate likes; the unique index prevents duplicates.
      if (error.code !== 11000) {
        throw error;
      }
    }

    if (createdLike && String(post.creator) !== String(req.userId)) {
      await Notification.create({
        recipient: post.creator,
        actor: req.userId,
        type: "like",
        post: post._id,
      });
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
