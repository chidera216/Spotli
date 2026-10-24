import "dotenv/config";
import mongoose from "mongoose";
import Follow from "../models/Follow.js";

async function ensureFollowIndexes() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing from the server environment.");
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    await Follow.collection.createIndex(
      { following: 1, status: 1 },
      { name: "following_1_status_1" },
    );
    await Follow.collection.createIndex(
      { follower: 1, status: 1 },
      { name: "follower_1_status_1" },
    );
    console.log("Spotli follow-count indexes are present.");
  } catch (error) {
    console.error("Unable to create follow-count indexes:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

ensureFollowIndexes();
