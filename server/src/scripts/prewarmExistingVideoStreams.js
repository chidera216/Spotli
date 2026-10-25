import "dotenv/config";

import mongoose from "mongoose";
import connectDB from "../config/db.js";
import cloudinary from "../config/cloudinary.js";
import Post from "../models/Post.js";

async function main() {
  await connectDB();

  const posts = await Post.find({ mediaType: "video" })
    .select("mediaPublicIds")
    .lean();

  const publicIds = new Set();

  for (const post of posts) {
    for (const publicId of post.mediaPublicIds || []) {
      if (
        typeof publicId === "string" &&
        publicId.startsWith("spotli/posts/")
      ) {
        publicIds.add(publicId);
      }
    }
  }

  console.log(`Found ${publicIds.size} video assets.`);

  let queued = 0;
  let failed = 0;

  for (const publicId of publicIds) {
    try {
      await cloudinary.uploader.explicit(publicId, {
        type: "upload",
        resource_type: "video",
        eager: [
          {
            streaming_profile: "full_hd",
            format: "m3u8",
          },
        ],
        eager_async: true,
      });

      queued += 1;
      console.log(`[QUEUED] ${publicId}`);
    } catch (error) {
      failed += 1;
      console.error(`[FAILED] ${publicId}: ${error.message}`);
    }
  }

  console.log(`Finished. Queued: ${queued}; failed: ${failed}.`);

  console.log(
    "Queued does not mean processing is complete. " +
      "Cloudinary must finish generating each stream before it is ready.",
  );
}

try {
  await main();
} catch (error) {
  console.error("Stream preparation failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
