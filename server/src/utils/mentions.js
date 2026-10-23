import User from "../models/User.js";
import Notification from "../models/Notification.js";

export function extractMentionUsernames(text = "") {
  const usernames = new Set();
  const pattern = /(^|[^\w.])@([a-zA-Z0-9_.]{3,24})\b/g;
  let match;

  while ((match = pattern.exec(String(text))) !== null) {
    usernames.add(match[2].toLowerCase());
  }

  return [...usernames];
}

export async function resolveMentionedUsers(text = "", actorId) {
  const usernames = extractMentionUsernames(text);
  if (!usernames.length) return [];

  return User.find({ username: { $in: usernames }, _id: { $ne: actorId } })
    .select("_id username firstName lastName avatar")
    .lean();
}

export async function createMentionNotifications({
  text = "",
  actorId,
  postId,
  commentId = null,
}) {
  const users = await resolveMentionedUsers(text, actorId);
  if (!users.length) return users;

  await Notification.insertMany(
    users.map((user) => ({
      recipient: user._id,
      actor: actorId,
      type: "mention",
      post: postId,
      comment: commentId,
      message: text.slice(0, 240),
    })),
    { ordered: false },
  );

  return users;
}
