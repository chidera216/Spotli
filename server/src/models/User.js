import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      select: false,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    username: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
      unique: true,
      minlength: 3,
      maxlength: 24,
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 160,
      default: "",
    },
    location: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
    },
    website: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
    },
    avatar: {
      type: String,
      default: "",
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    authProvider: {
      type: String,
      enum: ["email", "google"],
      default: "email",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

const User = mongoose.model("User", userSchema);

export default User;
