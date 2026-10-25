import "dotenv/config";
import mongoose from "mongoose";

import connectDB from "../config/db.js";
import Post from "../models/Post.js";
import { queueCloudinaryHls } from "../utils/cloudinaryHls.js";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  await connectDB();

  let queued = 0;
  let failed = 0;
  let skipped = 0;
  const seenPublicIds = new Set();

  try {
    const posts = await Post.find({
      mediaType: "video",
      mediaPublicIds: { $exists: true, $ne: [] },
    })
      .select("_id mediaPublicIds")
      .lean();

    console.log(
      `${dryRun ? "Dry run: found" : "Found"} ${posts.length} video posts with Cloudinary IDs.`,
    );

    for (const post of posts) {
      const publicId = post.mediaPublicIds?.[0];

      if (
        typeof publicId !== "string" ||
        !publicId.startsWith("spotli/posts/") ||
        seenPublicIds.has(publicId)
      ) {
        skipped += 1;
        continue;
      }
      seenPublicIds.add(publicId);

      if (dryRun) {
        console.log(
          `[dry-run] Would queue HLS for post ${post._id}: ${publicId}`,
        );
        queued += 1;
        continue;
      }

      try {
        await queueCloudinaryHls(publicId);
        queued += 1;
        console.log(`Queued HLS for post ${post._id}: ${publicId}`);
      } catch (error) {
        failed += 1;
        console.error(
          `Failed to queue HLS for post ${post._id} (${publicId}): ${error.message}`,
        );
      }
    }

    console.log(
      `HLS preparation ${dryRun ? "dry run" : "queueing"} finished. Queued: ${queued}; failed: ${failed}; skipped: ${skipped}.`,
    );

    if (failed > 0) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error("Unable to prepare existing HLS videos:", error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // Ignore a disconnect error if database startup failed.
  }
  process.exitCode = 1;
});
