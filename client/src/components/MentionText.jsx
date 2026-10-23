import { Link } from "react-router-dom";

/** Render known @username mentions as links to their Spotli profiles. */
export default function MentionText({
  text = "",
  mentions = [],
  className = "",
}) {
  const mentionByUsername = new Map(
    (Array.isArray(mentions) ? mentions : [])
      .filter((user) => user?.username && user?._id)
      .map((user) => [String(user.username).toLowerCase(), user]),
  );
  const parts = String(text || "").split(/(@[a-zA-Z0-9_.]{3,24})/g);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (!part.startsWith("@"))
          return <span key={`${index}-${part}`}>{part}</span>;
        const user = mentionByUsername.get(part.slice(1).toLowerCase());
        if (!user) return <span key={`${index}-${part}`}>{part}</span>;
        return (
          <Link
            key={`${index}-${part}`}
            to={`/profile/${user._id}`}
            onClick={(event) => event.stopPropagation()}
            className="font-medium text-[#FF2D4A] hover:underline"
          >
            {part}
          </Link>
        );
      })}
    </span>
  );
}
