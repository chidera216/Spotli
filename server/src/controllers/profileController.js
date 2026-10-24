import mongoose from "mongoose";
import User from "../models/User.js";
import Post from "../models/Post.js";

export async function getProfilePosts(req, res) {
  try {
    const { userId } = req.params;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    // Run the user check, posts query, and count query concurrently.
    const [userExists, posts, totalPosts] = await Promise.all([
      User.exists({ _id: userId }),

      (() => {
        const parsedPage = Number.parseInt(req.query.page, 10);
        const page =
          Number.isInteger(parsedPage) && parsedPage >= 0 ? parsedPage : 0;

        return Post.find({ creator: userId })
          .select(
            "_id creator mediaType mediaUrl thumbnailUrl caption likesCount commentsCount createdAt",
          )
          .sort({ createdAt: -1, _id: -1 })
          .skip(page * 12)
          .limit(12)
          .lean();
      })(),

      Post.countDocuments({ creator: userId }),
    ]);

    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "Creator not found.",
      });
    }

    const parsedPage = Number.parseInt(req.query.page, 10);
    const page =
      Number.isInteger(parsedPage) && parsedPage >= 0 ? parsedPage : 0;

    const gridPosts = posts.map((post) => {
      let thumbnailUrl = post.thumbnailUrl || "";

      if (post.mediaType === "video") {
        const mediaUrl = post.mediaUrl || "";
        const marker = "/video/upload/";
        const index = mediaUrl.indexOf(marker);
        const storedLooksLikeVideo = /\/video\/upload\//i.test(thumbnailUrl);

        if (index !== -1 && (!thumbnailUrl || storedLooksLikeVideo)) {
          const assetPath = mediaUrl.slice(index + marker.length).split("?")[0];

          const withoutExtension = assetPath.replace(
            /\.(mp4|mov|m4v|webm|avi|mkv)$/i,
            "",
          );

          thumbnailUrl = `${mediaUrl.slice(
            0,
            index + marker.length,
          )}so_0,w_300,h_300,c_fill,q_auto,f_jpg/${withoutExtension}.jpg`;
        }
      } else if (!thumbnailUrl && post.mediaType === "photo") {
        thumbnailUrl = post.mediaUrl || "";
      }

      return {
        _id: post._id,
        creator: post.creator,
        mediaType: post.mediaType,
        mediaUrl: post.mediaUrl || "",
        mediaUrls: Array.isArray(post.mediaUrls) ? post.mediaUrls : [],
        thumbnailUrl,
        caption: post.caption || "",
        likesCount: post.likesCount || 0,
        commentsCount: post.commentsCount || 0,
        createdAt: post.createdAt,
      };
    });

    return res.status(200).json({
      success: true,
      posts: gridPosts,
      pagination: {
        page,
        limit: 12,
        totalPosts,
        totalPages: Math.ceil(totalPosts / 12),
        hasNextPage: (page + 1) * 12 < totalPosts,
      },
    });
  } catch (error) {
    console.error("Get profile posts error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve your posts.",
    });
  }
}
