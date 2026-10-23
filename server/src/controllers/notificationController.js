import mongoose from "mongoose";
import Notification from "../models/Notification.js";

export async function getMyNotifications(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 30),
    );
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ recipient: req.userId })
        .populate("actor", "firstName lastName username avatar")
        .populate({
          path: "post",
          select:
            "mediaType mediaUrl mediaUrls thumbnailUrl caption creator mentions likesCount commentsCount viewsCount createdAt",
          populate: [
            { path: "creator", select: "firstName lastName username avatar" },
            {
              path: "mentions",
              select: "_id username firstName lastName avatar",
            },
          ],
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Notification.countDocuments({ recipient: req.userId, readAt: null }),
    ]);

    return res.status(200).json({
      success: true,
      notifications,
      unreadCount,
      page,
      limit,
    });
  } catch (error) {
    console.error("Get notifications error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Unable to retrieve notifications." });
  }
}

export async function markNotificationRead(req, res) {
  try {
    const { notificationId } = req.params;
    if (!mongoose.isValidObjectId(notificationId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid notification ID." });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: req.userId, readAt: null },
      { $set: { readAt: new Date() } },
      { returnDocument: "after" },
    );

    if (!notification) {
      const existing = await Notification.findOne({
        _id: notificationId,
        recipient: req.userId,
      });
      if (!existing)
        return res
          .status(404)
          .json({ success: false, message: "Notification not found." });
      return res.status(200).json({ success: true, notification: existing });
    }

    return res.status(200).json({ success: true, notification });
  } catch (error) {
    console.error("Mark notification read error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Unable to update notification." });
  }
}

export async function markAllNotificationsRead(req, res) {
  try {
    await Notification.updateMany(
      { recipient: req.userId, readAt: null },
      { $set: { readAt: new Date() } },
    );
    return res
      .status(200)
      .json({ success: true, message: "All notifications marked as read." });
  } catch (error) {
    console.error("Mark all notifications read error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Unable to update notifications." });
  }
}
