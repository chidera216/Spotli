import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Heart, Send, X } from "lucide-react";
import api from "../../services/api";
import MentionField from "../MentionField";
import MentionText from "../MentionText";

const BRAND = "#FF2D4A";
const INITIAL_VISIBLE_REPLIES = 1;
const REPLIES_PER_BATCH = 4;

function getName(comment) {
  return (
    comment?.user?.name ||
    [comment?.user?.firstName, comment?.user?.lastName]
      .filter(Boolean)
      .join(" ") ||
    comment?.creator?.name ||
    comment?.creator ||
    comment?.author?.name ||
    "Spotli user"
  );
}

function getAvatar(comment) {
  return (
    comment?.user?.avatar ||
    comment?.creator?.avatar ||
    comment?.author?.avatar ||
    comment?.avatar ||
    ""
  );
}

function getText(comment) {
  return comment?.text || comment?.content || comment?.message || "";
}

function getDateLabel(comment) {
  if (comment?.timeLabel) return comment.timeLabel;

  const rawDate =
    comment?.createdAt ??
    comment?.created_at ??
    comment?.timestamp ??
    comment?.date;

  if (!rawDate) return "";

  const timestamp =
    typeof rawDate === "number" && rawDate < 1e12
      ? rawDate * 1000
      : new Date(rawDate).getTime();

  if (!Number.isFinite(timestamp)) return "";

  const elapsed = Math.max(0, Date.now() - timestamp);
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;

  return `${Math.floor(days / 365)}y`;
}

function getId(comment) {
  return String(comment?._id || comment?.id || "");
}

function getParentId(comment) {
  // Support both field names used by different API responses/schema versions.
  const parent =
    comment?.parentCommentId ?? comment?.parentComment ?? comment?.parent;

  if (!parent) return "";

  return String(
    typeof parent === "object" ? parent._id || parent.id || "" : parent,
  );
}

function getTimestamp(comment) {
  // Try each supported timestamp field until we find a valid date.
  // This avoids an empty/invalid createdAt value masking another valid field.
  const dateFields = [
    comment?.createdAt,
    comment?.created_at,
    comment?.timestamp,
    comment?.date,
  ];

  for (const rawDate of dateFields) {
    if (rawDate === undefined || rawDate === null || rawDate === "") continue;

    const timestamp =
      typeof rawDate === "number"
        ? rawDate < 1e12
          ? rawDate * 1000
          : rawDate
        : new Date(rawDate).getTime();

    if (Number.isFinite(timestamp) && timestamp > 0) return timestamp;
  }

  // MongoDB ObjectIds contain their creation time in the first 8 hex digits.
  const id = getId(comment);
  if (/^[a-f0-9]{24}$/i.test(id)) {
    const objectIdTimestamp = parseInt(id.slice(0, 8), 16) * 1000;
    if (Number.isFinite(objectIdTimestamp) && objectIdTimestamp > 0) {
      return objectIdTimestamp;
    }
  }

  return 0;
}

function getLikesCount(comment) {
  const possibleValues = [
    comment?.likesCount,
    comment?.likeCount,
    comment?.likes,
  ];

  for (const value of possibleValues) {
    if (Array.isArray(value)) return value.length;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return 0;
}

// The API returns top-level comments with their replies nested in `replies`.
// The component's display logic works with a flat list, so normalize both
// nested API responses and already-flat lists into one consistent structure.
function normalizeComments(items = []) {
  const normalized = [];
  const seenIds = new Set();

  function addComment(comment, inferredParentId = "") {
    if (!comment || typeof comment !== "object") return;

    const id = getId(comment);
    if (id && seenIds.has(id)) return;
    if (id) seenIds.add(id);

    const { replies, ...commentFields } = comment;
    const existingParentId = getParentId(commentFields);
    const normalizedComment = inferredParentId
      ? {
          ...commentFields,
          parentCommentId: existingParentId || inferredParentId,
        }
      : commentFields;

    normalized.push(normalizedComment);

    if (Array.isArray(replies)) {
      for (const reply of replies) {
        addComment(reply, id);
      }
    }
  }

  for (const item of Array.isArray(items) ? items : []) {
    addComment(item);
  }

  return normalized;
}

export default function CommentSection({
  post,
  comments = [],
  loading = false,
  error = "",
  onSubmit,
  onClose,
  variant = "panel",
  title = "Comments",
}) {
  const [text, setText] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [replyError, setReplyError] = useState("");
  const [likeErrors, setLikeErrors] = useState({});
  const [sort, setSort] = useState("newest");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [liked, setLiked] = useState({});
  const [localComments, setLocalComments] = useState(comments);

  // How many replies are currently visible for each parent comment.
  const [visibleReplies, setVisibleReplies] = useState({});

  const postId = String(post?._id || post?.id || "");

  // Normalize nested API replies into the flat list used by this component,
  // and restore saved like status for both comments and replies.
  useEffect(() => {
    const normalizedComments = normalizeComments(comments);
    setLocalComments(normalizedComments);

    setLiked(
      Object.fromEntries(
        normalizedComments.map((comment) => [
          getId(comment),
          Boolean(comment.likedByMe),
        ]),
      ),
    );
  }, [comments]);

  // Reset form state when switching posts.
  useEffect(() => {
    setText("");
    setReplyText("");
    setReplyingTo(null);
    setSubmitError("");
    setReplyError("");
    setLikeErrors({});
    setVisibleReplies({});
  }, [postId]);

  // Group replies under their parent and keep replies in chronological order.
  const { topLevelComments, repliesByParent } = useMemo(() => {
    const roots = [];
    const replies = {};

    for (const comment of localComments) {
      const parentId = getParentId(comment);

      if (parentId) {
        if (!replies[parentId]) {
          replies[parentId] = [];
        }

        replies[parentId].push(comment);
      } else {
        roots.push(comment);
      }
    }

    // Oldest replies first prevents each "See more" click from
    // appearing to add newer replies above the existing replies.
    for (const replyList of Object.values(replies)) {
      replyList.sort((a, b) => getTimestamp(a) - getTimestamp(b));
    }

    return {
      topLevelComments: roots,
      repliesByParent: replies,
    };
  }, [localComments]);

  const sortedComments = useMemo(() => {
    const items = [...topLevelComments];

    if (sort === "top") {
      items.sort((a, b) => {
        const likesDifference = getLikesCount(b) - getLikesCount(a);

        // Break ties by recency so comments with equal likes remain predictable.
        return likesDifference || getTimestamp(b) - getTimestamp(a);
      });
    } else {
      // Newest comments first, including timestamps embedded in MongoDB IDs.
      items.sort((a, b) => getTimestamp(b) - getTimestamp(a));
    }

    return items;
  }, [topLevelComments, sort]);

  function showMoreReplies(parentId, totalReplies) {
    setVisibleReplies((previous) => {
      const currentlyVisible = previous[parentId] ?? INITIAL_VISIBLE_REPLIES;

      return {
        ...previous,
        [parentId]: Math.min(
          currentlyVisible + REPLIES_PER_BATCH,
          totalReplies,
        ),
      };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const value = text.trim();

    if (!value || !onSubmit || submitting) return;

    const temporaryId = `pending-comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticComment = {
      _id: temporaryId,
      text: value,
      createdAt: new Date().toISOString(),
      likesCount: 0,
      likedByMe: false,
      user: { name: "You" },
      pending: true,
    };

    // Render immediately; the network request continues in the background.
    setLocalComments((previous) => [optimisticComment, ...previous]);
    setText("");
    setSubmitting(true);
    setSubmitError("");

    try {
      const result = await onSubmit(value);
      const savedComment = result?.comment || result;

      // If the caller returns the saved comment, replace the temporary item.
      // Existing callers that update the comments prop are reconciled by the effect above.
      if (
        savedComment &&
        typeof savedComment === "object" &&
        getId(savedComment)
      ) {
        setLocalComments((previous) => [
          savedComment,
          ...previous.filter(
            (item) =>
              getId(item) !== temporaryId &&
              getId(item) !== getId(savedComment),
          ),
        ]);
      }
    } catch (failure) {
      setLocalComments((previous) =>
        previous.filter((item) => getId(item) !== temporaryId),
      );
      setText(value);
      setSubmitError(
        failure?.message || "Could not post your comment. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function openReply(comment) {
    setReplyingTo(getId(comment));
    setReplyText("");
    setReplyError("");
  }

  async function handleReplySubmit(event, parentComment) {
    event.preventDefault();

    const value = replyText.trim();
    const parentId = getId(parentComment);

    if (!value || !postId || !parentId || replySubmitting) return;

    const temporaryId = `pending-reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticReply = {
      _id: temporaryId,
      text: value,
      parentCommentId: parentId,
      createdAt: new Date().toISOString(),
      likesCount: 0,
      likedByMe: false,
      user: { name: "You" },
      pending: true,
    };

    // Put the reply under its parent before waiting for the API.
    setLocalComments((previous) => [...previous, optimisticReply]);
    setReplyText("");
    setReplySubmitting(true);
    setReplyError("");

    const currentReplyCount = (repliesByParent[parentId] || []).length;
    setVisibleReplies((previous) => ({
      ...previous,
      [parentId]: Math.max(
        previous[parentId] ?? INITIAL_VISIBLE_REPLIES,
        currentReplyCount + 1,
      ),
    }));

    try {
      const result = await api.posts.replyToComment(postId, parentId, value);

      if (!result?.comment) {
        throw new Error("The server did not return the saved reply.");
      }

      const savedReply = result.comment;
      const savedReplyId = getId(savedReply);

      // Replace the temporary reply with the database version, without duplicates.
      setLocalComments((previous) => [
        ...previous.filter(
          (item) => getId(item) !== temporaryId && getId(item) !== savedReplyId,
        ),
        savedReply,
      ]);

      setLiked((previous) => ({
        ...previous,
        [savedReplyId]: Boolean(savedReply.likedByMe),
      }));
      setReplyingTo(null);
    } catch (failure) {
      setLocalComments((previous) =>
        previous.filter((item) => getId(item) !== temporaryId),
      );
      setReplyText(value);
      setReplyError(
        failure?.message || "Could not post your reply. Try again.",
      );
    } finally {
      setReplySubmitting(false);
    }
  }

  async function toggleCommentLike(comment) {
    const id = getId(comment);

    if (!id || !postId || likeErrors[id]) return;

    const wasLiked = Boolean(liked[id]);

    setLikeErrors((previous) => ({
      ...previous,
      [id]: "",
    }));

    // Optimistic heart and count update.
    setLiked((previous) => ({
      ...previous,
      [id]: !wasLiked,
    }));

    setLocalComments((previous) =>
      previous.map((item) => {
        if (getId(item) !== id) return item;

        const currentCount = Number(item.likesCount) || 0;

        return {
          ...item,
          likesCount: Math.max(0, currentCount + (wasLiked ? -1 : 1)),
        };
      }),
    );

    try {
      const result = wasLiked
        ? await api.posts.unlikeComment(postId, id)
        : await api.posts.likeComment(postId, id);

      setLocalComments((previous) =>
        previous.map((item) =>
          getId(item) === id
            ? {
                ...item,
                likesCount:
                  typeof result?.likesCount === "number"
                    ? result.likesCount
                    : item.likesCount,
              }
            : item,
        ),
      );
    } catch (failure) {
      // Roll back if the server request fails.
      setLiked((previous) => ({
        ...previous,
        [id]: wasLiked,
      }));

      setLocalComments((previous) =>
        previous.map((item) => {
          if (getId(item) !== id) return item;

          const currentCount = Number(item.likesCount) || 0;

          return {
            ...item,
            likesCount: Math.max(0, currentCount + (wasLiked ? 1 : -1)),
          };
        }),
      );

      setLikeErrors((previous) => ({
        ...previous,
        [id]: failure?.message || "Could not update the like.",
      }));
    }
  }

  function renderComment(comment, isReply = false) {
    const id = getId(comment);
    const avatar = getAvatar(comment);
    const replies = isReply ? [] : repliesByParent[id] || [];
    const isLiked = Boolean(liked[id]);

    const visibleCount = Math.min(
      visibleReplies[id] ?? INITIAL_VISIBLE_REPLIES,
      replies.length,
    );

    const visibleItems = replies.slice(0, visibleCount);
    const remainingReplies = replies.length - visibleCount;

    return (
      <article
        key={id}
        className={`flex items-start gap-3 ${isReply ? "mt-3" : ""}`}
      >
        {avatar ? (
          <img
            src={avatar}
            alt=""
            className={`shrink-0 rounded-full bg-gray-100 object-cover ${
              isReply ? "h-7 w-7" : "h-8 w-8"
            }`}
          />
        ) : (
          <div
            className={`flex shrink-0 items-center justify-center rounded-full bg-gray-100 font-bold text-gray-500 ${
              isReply ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-xs"
            }`}
          >
            {getName(comment).slice(0, 1).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">
            {getName(comment)}
            {getDateLabel(comment) && (
              <span className="ml-2 font-normal text-gray-400">
                {getDateLabel(comment)}
              </span>
            )}
          </p>

          <p className="mt-1 wrap-break-word text-sm leading-relaxed text-gray-700">
            <MentionText text={getText(comment)} mentions={comment.mentions} />
          </p>

          <div className="mt-1 flex items-center gap-3">
            {!isReply && (
              <button
                type="button"
                onClick={() => openReply(comment)}
                className="text-[11px] font-medium text-gray-500 hover:text-[#FF2D4A]"
              >
                Reply
              </button>
            )}

            {isReply && (
              <span className="text-[11px] text-gray-400">Reply</span>
            )}
          </div>

          {likeErrors[id] && (
            <p role="alert" className="mt-1 text-[11px] text-red-600">
              {likeErrors[id]}
            </p>
          )}

          {!isReply && replyingTo === id && (
            <form
              onSubmit={(event) => handleReplySubmit(event, comment)}
              className="mt-2 flex items-center gap-2"
            >
              <MentionField
                autoFocus
                value={replyText}
                onChange={setReplyText}
                placeholder={`Reply to ${getName(comment)}…`}
                maxLength={1000}
                disabled={replySubmitting}
                className="w-full rounded-full bg-gray-100 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#FF2D4A]/40"
                ariaLabel="Write a reply"
              />

              <button
                type="submit"
                disabled={!replyText.trim() || replySubmitting}
                aria-label="Send reply"
                className="rounded-full p-2 text-[#FF2D4A] disabled:text-gray-300"
              >
                <Send size={15} />
              </button>

              <button
                type="button"
                onClick={() => {
                  setReplyingTo(null);
                  setReplyText("");
                  setReplyError("");
                }}
                aria-label="Cancel reply"
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
              >
                <X size={14} />
              </button>
            </form>
          )}

          {!isReply && replyError && replyingTo === id && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {replyError}
            </p>
          )}

          {!isReply && replies.length > 0 && (
            <div className="mt-2 border-l-2 border-gray-100 pl-3">
              <p className="mb-2 text-[11px] font-medium text-gray-500">
                {replies.length} {replies.length === 1 ? "reply" : "replies"}
              </p>

              {visibleItems.map((reply) => renderComment(reply, true))}

              {remainingReplies > 0 && (
                <button
                  type="button"
                  onClick={() => showMoreReplies(id, replies.length)}
                  className="mt-3 text-xs font-semibold text-[#FF2D4A] hover:opacity-80"
                >
                  See {Math.min(REPLIES_PER_BATCH, remainingReplies)} more{" "}
                  {remainingReplies === 1 ? "reply" : "replies"}
                </button>
              )}

              {visibleCount > INITIAL_VISIBLE_REPLIES && (
                <button
                  type="button"
                  onClick={() =>
                    setVisibleReplies((previous) => ({
                      ...previous,
                      [id]: INITIAL_VISIBLE_REPLIES,
                    }))
                  }
                  className="ml-3 mt-3 text-xs font-semibold text-gray-500 hover:text-gray-700"
                >
                  Show fewer
                </button>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => toggleCommentLike(comment)}
          aria-label={isLiked ? "Unlike comment" : "Like comment"}
          aria-pressed={isLiked}
          className="flex shrink-0 flex-col items-center gap-1 text-gray-400"
        >
          <Heart
            size={14}
            fill={isLiked ? BRAND : "none"}
            color={isLiked ? BRAND : "currentColor"}
          />

          <span className="text-[10px]">{Number(comment.likesCount) || 0}</span>
        </button>
      </article>
    );
  }

  const isSheet = variant === "sheet";

  return (
    <section
      aria-label={`${title} section`}
      className={`flex min-h-0 flex-col bg-white text-gray-900 ${
        isSheet
          ? "fixed inset-x-0 bottom-0 z-100 max-h-[82dvh] rounded-t-2xl shadow-2xl"
          : "h-full w-full"
      }`}
    >
      {isSheet && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close comments"
          className="absolute right-3 top-3 rounded-full p-2 text-gray-500 hover:bg-gray-100"
        >
          <X size={18} />
        </button>
      )}

      <header className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold">
            {title}{" "}
            <span className="font-normal text-gray-500">
              {topLevelComments.length}
            </span>
          </h2>

          {post?.caption && (
            <p className="mt-1 line-clamp-1 text-xs text-gray-500">
              <MentionText text={post.caption} mentions={post.mentions} />
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setSortMenuOpen((open) => !open)}
              aria-label="Sort comments"
              aria-haspopup="menu"
              aria-expanded={sortMenuOpen}
              className="flex items-center gap-1 whitespace-nowrap bg-transparent text-xs text-gray-500 outline-none"
            >
              {sort === "newest" ? "Newest" : "Top"}
              <ChevronDown size={12} />
            </button>

            {sortMenuOpen && (
              <div
                role="menu"
                aria-label="Comment sorting options"
                className="absolute right-0 top-full z-50 mt-1 min-w-19 overflow-hidden rounded-md border border-gray-200 bg-white py-1 text-xs shadow-lg"
              >
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={sort === "newest"}
                  onClick={() => {
                    setSort("newest");
                    setSortMenuOpen(false);
                  }}
                  className={`block w-full whitespace-nowrap px-3 py-2 text-left hover:bg-gray-50 ${sort === "newest" ? "font-semibold text-[#FF2D4A]" : "text-gray-600"}`}
                >
                  Newest
                </button>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={sort === "top"}
                  onClick={() => {
                    setSort("top");
                    setSortMenuOpen(false);
                  }}
                  className={`block w-full whitespace-nowrap px-3 py-2 text-left hover:bg-gray-50 ${sort === "top" ? "font-semibold text-[#FF2D4A]" : "text-gray-600"}`}
                >
                  Top
                </button>
              </div>
            )}
          </div>

          {!isSheet && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close comments"
              className="rounded-full p-1 text-gray-500 hover:bg-gray-100"
            >
              <X size={17} />
            </button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 scrollbar-none [&::-webkit-scrollbar]:hidden">
        {loading ? (
          <p className="py-8 text-center text-xs text-gray-500">
            Loading comments…
          </p>
        ) : error ? (
          <p role="alert" className="py-8 text-center text-xs text-red-600">
            {error}
          </p>
        ) : sortedComments.length === 0 ? (
          <div className="py-10 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-gray-100">
              <Heart size={19} className="text-gray-400" />
            </div>

            <p className="text-sm font-semibold">No comments yet</p>

            <p className="mt-1 text-xs text-gray-500">
              Be the first to share your thoughts.
            </p>
          </div>
        ) : (
          sortedComments.map((comment) => renderComment(comment))
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 items-center gap-2 border-t border-gray-100 p-3"
      >
        <MentionField
          value={text}
          onChange={setText}
          placeholder={
            onSubmit ? "Add a comment…" : "Comments are not connected yet"
          }
          disabled={!onSubmit || submitting}
          maxLength={1000}
          className="w-full rounded-full bg-gray-100 px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[#FF2D4A]/40 disabled:cursor-not-allowed disabled:opacity-70"
          ariaLabel="Write a comment"
        />

        <button
          type="submit"
          disabled={!text.trim() || !onSubmit || submitting}
          aria-label="Post comment"
          className="rounded-full p-2 text-[#FF2D4A] hover:bg-rose-50 disabled:text-gray-300"
        >
          <Send size={17} />
        </button>
      </form>

      {submitError && (
        <p role="alert" className="px-4 pb-3 text-xs text-red-600">
          {submitError}
        </p>
      )}
    </section>
  );
}
