import { useEffect, useRef, useState } from "react";
import api from "../services/api";

/** A textarea/input with lightweight @username suggestions. */
export default function MentionField({
  as = "input",
  value,
  onChange,
  className = "",
  placeholder,
  maxLength,
  rows,
  disabled = false,
  autoFocus = false,
  ariaLabel,
  ...rest
}) {
  const fieldRef = useRef(null);
  const [query, setQuery] = useState("");
  const [mentionStart, setMentionStart] = useState(-1);
  const [users, setUsers] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (query.length < 2) {
      setUsers([]);
      setOpen(false);
      return undefined;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await api.users.search(query);
        if (!cancelled) {
          const matches = Array.isArray(result.users) ? result.users : [];
          setUsers(matches);
          setActiveIndex(0);
          setOpen(matches.length > 0);
        }
      } catch {
        if (!cancelled) {
          setUsers([]);
          setOpen(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function updateMentionState(nextValue, cursorPosition) {
    const beforeCursor = nextValue.slice(0, cursorPosition);
    const match = beforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_.]{1,24})$/);
    if (!match) {
      setQuery("");
      setMentionStart(-1);
      setOpen(false);
      return;
    }

    setQuery(match[1]);
    setMentionStart(cursorPosition - match[1].length - 1);
  }

  function handleChange(event) {
    const nextValue = event.target.value;
    onChange?.(nextValue);
    updateMentionState(
      nextValue,
      event.target.selectionStart ?? nextValue.length,
    );
  }

  function chooseUser(user) {
    const element = fieldRef.current;
    const currentValue = String(value || "");
    const cursor = element?.selectionStart ?? currentValue.length;
    const before = currentValue.slice(0, Math.max(0, mentionStart));
    const after = currentValue.slice(cursor);
    const nextValue = `${before}@${user.username} ${after}`;
    onChange?.(nextValue);
    setOpen(false);
    setUsers([]);
    setQuery("");
    setMentionStart(-1);
    requestAnimationFrame(() => {
      if (!element) return;
      const nextCursor = before.length + user.username.length + 2;
      element.focus();
      element.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function handleKeyDown(event) {
    if (!open || users.length === 0) {
      rest.onKeyDown?.(event);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % users.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + users.length) % users.length);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      chooseUser(users[activeIndex] || users[0]);
      return;
    }
    if (event.key === "Escape") setOpen(false);
    rest.onKeyDown?.(event);
  }

  const Field = as === "textarea" ? "textarea" : "input";

  return (
    <div className="relative min-w-0 flex-1">
      <Field
        {...rest}
        ref={fieldRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={as === "textarea" ? rows : undefined}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        className={className}
        autoComplete="off"
      />
      {open && users.length > 0 && (
        <div className="absolute bottom-full left-0 z-[80] mb-2 max-h-56 w-full min-w-52 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
          {users.map((user, index) => {
            const name =
              [user.firstName, user.lastName].filter(Boolean).join(" ") ||
              user.username;
            return (
              <button
                type="button"
                key={user._id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseUser(user)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition ${index === activeIndex ? "bg-rose-50" : "hover:bg-gray-50"}`}
              >
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                    {String(user.username || "?")
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-gray-900">
                    {name}
                  </span>
                  <span className="block truncate text-[11px] text-gray-500">
                    @{user.username}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
