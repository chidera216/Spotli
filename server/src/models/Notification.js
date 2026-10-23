import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "like",
        "comment",
        "reply",
        "follow",
        "follow_request",
        "follow_approved",
        "mention",
        "message",
        "message_request",
      ],
      required: true,
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      default: null,
    },
    comment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
    },
    message: {
      type: String,
      trim: true,
      default: "",
      maxlength: 240,
    },
    readAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({
  recipient: 1,
  actor: 1,
  type: 1,
  post: 1,
  comment: 1,
});

export default mongoose.model("Notification", notificationSchema);
