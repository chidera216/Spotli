import mongoose from "mongoose";

const followSchema = new mongoose.Schema(
  {
    follower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    following: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved"],
      default: "approved",
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Compound indexes support the two profile-count queries without scanning all follows.
followSchema.index({ following: 1, status: 1 });
followSchema.index({ follower: 1, status: 1 });

// A user can follow another user only once.
followSchema.index({ follower: 1, following: 1 }, { unique: true });

// Prevent a user from following themselves.
followSchema.pre("validate", function () {
  if (this.follower && this.following && this.follower.equals(this.following)) {
    this.invalidate("following", "You cannot follow yourself.");
  }
});

const Follow = mongoose.model("Follow", followSchema);

export default Follow;
