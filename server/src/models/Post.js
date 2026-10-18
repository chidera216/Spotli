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
