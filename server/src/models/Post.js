import mongoose from "mongoose";

const postSchema = new mongoose.Schema(
  {
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    caption: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },

    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Structured topics power the Home/Discovery category filters.
    topics: {
      type: [
        {
          type: String,
          enum: [
            "ESUT",
            "Tech",
            "Study",
            "Travel",
            "Food",
            "Lifestyle",
            "Music",
            "Fitness",
          ],
        },
      ],
      default: [],
    },

    mediaUrl: {
      type: String,
      required: true,
      trim: true,
    },

    mediaUrls: {
      type: [String],
      default: [],
    },

    mediaType: {
      type: String,
      enum: ["video", "photo"],
      required: true,
    },

    thumbnailUrl: {
      type: String,
      default: "",
      trim: true,
    },

    // Cloudinary asset IDs, used for future asset management.
    mediaPublicIds: {
      type: [String],
      default: [],
    },

    mediaResourceTypes: {
      type: [String],
      default: [],
    },

    thumbnailPublicId: {
      type: String,
      default: "",
      trim: true,
    },

    likesCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    commentsCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    viewsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

postSchema.index({ createdAt: -1 });

const Post = mongoose.model("Post", postSchema);

export default Post;
