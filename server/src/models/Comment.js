import mongoose from "mongoose";

const commentSchema = new mongoose.Schema(
  {
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    parentComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
      index: true,
    },
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    likesCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    likedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true },
);

commentSchema.index({
  post: 1,
  parentComment: 1,
  createdAt: -1,
});

export default mongoose.model("Comment", commentSchema);
