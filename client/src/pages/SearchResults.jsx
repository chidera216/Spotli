import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Search,
  X,
  UserRound,
  Play,
  Image as ImageIcon,
  Heart,
  MessageCircle,
  Clock3,
  TrendingUp,
  UserPlus,
  Check,
  LoaderCircle,
} from "lucide-react";
import api from "../services/api";

const API_ORIGIN = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/api\/?$/, "");
const RECENT_KEY = "spotli_recent_searches";
const TRENDING_TOPICS = [
  "#Spotli",
  "#Photography",
  "#Comedy",
  "#Fashion",
  "#Tech",
];

function mediaUrl(value) {
  if (!value || typeof value !== "string") return "";
  const url = value.trim();
  if (!url) return "";
  if (/^(https?:\/\/|blob:|data:)/i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`;
}

function fullName(user) {
  return (
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.displayName ||
    user?.username ||
    "Spotli user"
  );
}

function isPhoto(post) {
  return (
    post?.mediaType === "photo" ||
    post?.mediaType === "image" ||
    post?.type === "photo" ||
    post?.type === "image"
  );
}

function getPostId(post) {
  return post?._id || post?.id;
}

function getCount(value) {
  if (Array.isArray(value)) return value.length;
  return Number(value || 0);
}

function postLikes(post) {
  return getCount(
    post?.likesCount ?? post?.likeCount ?? post?.likes ?? post?.likedBy,
  );
}

function postComments(post) {
  return getCount(post?.commentsCount ?? post?.commentCount ?? post?.comments);
}

function Highlight({ text, query }) {
  const value = String(text || "");
  const needle = String(query || "").trim();
  if (!needle || needle.length < 2) return value;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = value.split(new RegExp(`(${escaped})`, "ig"));
  return parts.map((part, index) =>
    part.toLowerCase() === needle.toLowerCase() ? (
      <mark
        key={`${part}-${index}`}
        className="rounded bg-rose-100 px-0.5 text-inherit"
      >
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

function Avatar({ person, size = "h-12 w-12" }) {
  const avatar = mediaUrl(
    person?.avatar || person?.profilePicture || person?.profileImage,
  );
  return avatar ? (
    <img
      src={avatar}
      alt=""
      loading="lazy"
      className={`${size} shrink-0 rounded-full object-cover`}
    />
  ) : (
    <span
      className={`${size} grid shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-600`}
    >
      <UserRound size={22} />
    </span>
  );
}

function PostTile({ post, query, onOpen }) {
  const photo = isPhoto(post);
  const image = mediaUrl(
    photo
      ? post.mediaUrls?.[0] || post.mediaUrl || post.imageUrl
      : post.thumbnailUrl || post.thumbnail || post.previewUrl || "",
  );
  const video = mediaUrl(post.mediaUrl || post.mediaUrls?.[0]);
  const creator = post.creator || post.user || {};
  const likes = postLikes(post);
  const comments = postComments(post);

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => onOpen(post)}
        className="group relative block aspect-square w-full overflow-hidden rounded-xl bg-neutral-100 text-left"
        aria-label={`Open ${photo ? "photo" : "reel"} by ${fullName(creator)}`}
      >
        {photo ? (
          image ? (
            <img
              src={image}
              alt={post.caption || "Spotli photo"}
              loading="lazy"
              className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
            />
          ) : (
            <span className="grid h-full place-items-center text-neutral-500">
              <ImageIcon size={28} />
            </span>
          )
        ) : (
          <>
            {image ? (
              <img
                src={image}
                alt={post.caption || "Reel thumbnail"}
                loading="lazy"
                className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
              />
            ) : video ? (
              <video
                src={video}
                muted
                playsInline
                preload="metadata"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="grid h-full place-items-center text-neutral-500">
                <Play size={28} />
              </span>
            )}
            <span
              className="absolute left-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
              aria-label="Video"
            >
              <Play size={12} fill="currentColor" />
            </span>
          </>
        )}
        <span className="pointer-events-none absolute inset-0 bg-black/0 transition-colors duration-200 group-hover:bg-black/15" />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
        <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/30 px-2 py-1 text-[11px] font-semibold text-white">
          <Heart size={12} fill="currentColor" /> {likes}
        </span>
        <span className="pointer-events-none absolute bottom-2 right-2 hidden items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[11px] font-semibold text-white md:group-hover:inline-flex">
          <MessageCircle size={12} /> {comments}
        </span>
      </button>
      {post.caption ? (
        <p className="mt-1.5 line-clamp-2 text-xs leading-4 text-neutral-800">
          <Highlight text={post.caption} query={query} />
        </p>
      ) : null}
    </div>
  );
}

function SkeletonResults({ mode = "grid" }) {
  if (mode === "people") {
    return (
      <div
        className="mt-4 divide-y divide-neutral-100"
        aria-label="Loading people"
        aria-busy="true"
      >
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 py-3">
            <div className="h-12 w-12 animate-pulse rounded-full bg-neutral-200" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-32 animate-pulse rounded bg-neutral-200" />
              <div className="h-3 w-24 animate-pulse rounded bg-neutral-100" />
              <div className="h-2.5 w-3/4 animate-pulse rounded bg-neutral-100" />
            </div>
            <div className="h-8 w-16 animate-pulse rounded-full bg-neutral-200" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div
      className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3"
      aria-label="Loading posts"
      aria-busy="true"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="aspect-square animate-pulse rounded-xl bg-neutral-100"
        />
      ))}
    </div>
  );
}

function SectionHeading({ title, count, onSeeAll }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-neutral-900">
        {title}
        {typeof count === "number" ? (
          <span className="ml-2 text-xs font-medium text-neutral-600">
            {count}
          </span>
        ) : null}
      </h2>
      {onSeeAll ? (
        <button
          type="button"
          onClick={onSeeAll}
          className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-neutral-800 transition hover:bg-neutral-100"
        >
          See all
        </button>
      ) : null}
    </div>
  );
}

export default function SearchResults({ onOpenVideo, onOpenPhoto }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const query = (searchParams.get("q") || "").trim();
  const inputRef = useRef(null);
  const recentAddedRef = useRef("");
  const [input, setInput] = useState(query);
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [suggestedPeople, setSuggestedPeople] = useState([]);
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      return Array.isArray(stored)
        ? stored.filter((item) => typeof item === "string").slice(0, 8)
        : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [followStates, setFollowStates] = useState({});
  const [followLoading, setFollowLoading] = useState({});

  useEffect(() => setInput(query), [query]);

  // Keep URL/search results in sync with typing without a separate Search button.
  useEffect(() => {
    const value = input.trim();
    const timer = window.setTimeout(() => {
      if (value.length >= 2) {
        if (searchParams.get("q") !== value)
          setSearchParams({ q: value }, { replace: true });
      } else if (searchParams.has("q")) {
        setSearchParams({}, { replace: true });
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [input, searchParams, setSearchParams]);

  useEffect(() => {
    const handleSlash = (event) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey)
        return;
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (typing) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", handleSlash);
    return () => window.removeEventListener("keydown", handleSlash);
  }, []);

  useEffect(() => {
    let active = true;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setUsers([]);
      setPosts([]);
      setError("");
      setLoading(false);
      return () => {
        active = false;
      };
    }
    setLoading(true);
    setError("");
    api.users
      .search(trimmed)
      .then((result) => {
        if (!active) return;
        setUsers(Array.isArray(result.users) ? result.users : []);
        setPosts(Array.isArray(result.posts) ? result.posts : []);
      })
      .catch((loadError) => {
        if (!active) return;
        setUsers([]);
        setPosts([]);
        setError(loadError.message || "Unable to search Spotli.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, location.key]);

  useEffect(() => {
    if (query.length < 2 || query === recentAddedRef.current) return;
    recentAddedRef.current = query;
    setRecentSearches((previous) => {
      const next = [
        query,
        ...previous.filter(
          (item) => item.toLowerCase() !== query.toLowerCase(),
        ),
      ].slice(0, 8);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* storage may be unavailable */
      }
      return next;
    });
  }, [query]);

  // Use recent public-post creators as suggested people; this keeps suggestions inside this page.
  useEffect(() => {
    let active = true;
    setSuggestionsLoading(true);
    api.posts
      .getAll(1, 20)
      .then((result) => {
        if (!active) return;
        const list = Array.isArray(result.posts)
          ? result.posts
          : Array.isArray(result)
            ? result
            : [];
        const seen = new Set();
        const creators = [];
        list.forEach((post) => {
          const creator = post.creator || post.user;
          const id = creator?._id || creator?.id;
          if (creator && id && !seen.has(String(id))) {
            seen.add(String(id));
            creators.push(creator);
          }
        });
        setSuggestedPeople(creators.slice(0, 8));
      })
      .catch(() => {
        if (active) setSuggestedPeople([]);
      })
      .finally(() => {
        if (active) setSuggestionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const reels = useMemo(() => posts.filter((post) => !isPhoto(post)), [posts]);
  const photos = useMemo(() => posts.filter(isPhoto), [posts]);
  const tabs = [
    { label: "All", count: users.length + posts.length },
    { label: "People", count: users.length },
    { label: "Reels", count: reels.length },
    { label: "Photos", count: photos.length },
  ];

  const changeQuery = useCallback(
    (value) => {
      setInput(value);
      if (!value) {
        setSearchParams({}, { replace: true });
        setActiveTab("All");
      }
    },
    [setSearchParams],
  );

  function pickRecent(value) {
    setInput(value);
    setSearchParams({ q: value }, { replace: true });
    setActiveTab("All");
  }

  function removeRecent(value) {
    setRecentSearches((previous) => {
      const next = previous.filter((item) => item !== value);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* storage may be unavailable */
      }
      return next;
    });
  }

  function clearRecent() {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      /* storage may be unavailable */
    }
  }

  async function toggleFollow(person) {
    const id = person?._id || person?.id;
    if (!id || followLoading[id]) return;
    const currentlyFollowing = Boolean(
      followStates[id] ?? person.isFollowing ?? person.following,
    );
    setFollowLoading((previous) => ({ ...previous, [id]: true }));
    setFollowStates((previous) => ({ ...previous, [id]: !currentlyFollowing }));
    try {
      if (currentlyFollowing) await api.users.unfollow(id);
      else await api.users.follow(id);
    } catch {
      setFollowStates((previous) => ({
        ...previous,
        [id]: currentlyFollowing,
      }));
    } finally {
      setFollowLoading((previous) => ({ ...previous, [id]: false }));
    }
  }

  function openPost(post, collection = posts) {
    if (isPhoto(post)) (onOpenPhoto || onOpenVideo)?.(post, collection);
    else (onOpenVideo || onOpenPhoto)?.(post, collection);
  }

  function renderPeopleList(list) {
    return (
      <div className="mt-3 divide-y divide-neutral-100">
        {list.map((person) => {
          const id = person._id || person.id;
          const following = Boolean(
            followStates[id] ?? person.isFollowing ?? person.following,
          );
          return (
            <div key={id} className="flex items-center gap-3 py-3">
              <button
                type="button"
                onClick={() => navigate(`/profile/${id}`)}
                className="shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-rose-200"
              >
                <Avatar person={person} />
              </button>
              <button
                type="button"
                onClick={() => navigate(`/profile/${id}`)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-sm font-semibold text-neutral-900">
                  <Highlight text={fullName(person)} query={query} />
                </span>
                <span className="mt-0.5 block truncate text-xs text-neutral-700">
                  @{person.username || "user"}
                </span>
                {person.bio ? (
                  <span className="mt-1 block line-clamp-1 text-xs text-neutral-700">
                    {person.bio}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                disabled={Boolean(followLoading[id])}
                onClick={() => toggleFollow(person)}
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold transition disabled:opacity-60 ${following ? "bg-neutral-100 text-neutral-800 hover:bg-neutral-200" : "bg-black text-white hover:bg-neutral-800"}`}
              >
                {followLoading[id] ? (
                  <LoaderCircle size={13} className="animate-spin" />
                ) : following ? (
                  <>
                    <Check size={13} /> Following
                  </>
                ) : (
                  <>
                    <UserPlus size={13} /> Follow
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  function renderPeopleCards(list) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
        {list.slice(0, 8).map((person) => {
          const id = person._id || person.id;
          const following = Boolean(
            followStates[id] ?? person.isFollowing ?? person.following,
          );
          return (
            <div
              key={id}
              className="flex w-36 shrink-0 flex-col items-center rounded-2xl border border-neutral-100 bg-white p-3 text-center"
            >
              <button
                type="button"
                onClick={() => navigate(`/profile/${id}`)}
                className="rounded-full"
              >
                <Avatar person={person} size="h-14 w-14" />
              </button>
              <button
                type="button"
                onClick={() => navigate(`/profile/${id}`)}
                className="mt-2 w-full truncate text-xs font-semibold text-neutral-900"
              >
                <Highlight text={fullName(person)} query={query} />
              </button>
              <span className="mt-0.5 w-full truncate text-[11px] text-neutral-700">
                @{person.username || "user"}
              </span>
              <button
                type="button"
                disabled={Boolean(followLoading[id])}
                onClick={() => toggleFollow(person)}
                className={`mt-3 w-full rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${following ? "bg-neutral-100 text-neutral-800" : "bg-black text-white hover:bg-neutral-800"}`}
              >
                {followLoading[id] ? "..." : following ? "Following" : "Follow"}
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  function renderPostGrid(list) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {list.map((post) => (
          <PostTile
            key={getPostId(post)}
            post={post}
            query={query}
            onOpen={(item) => openPost(item, list)}
          />
        ))}
      </div>
    );
  }

  const showEmptyLanding = query.length < 2;
  const noResults =
    !loading &&
    !error &&
    query.length >= 2 &&
    users.length === 0 &&
    posts.length === 0;

  return (
    <main className="min-h-screen bg-white px-4 pb-24 pt-5 text-black sm:px-6 md:px-8 md:py-8">
      <div className="w-full">
        <form
          onSubmit={(event) => event.preventDefault()}
          className="mx-auto flex h-12 w-full items-center gap-3 rounded-full border border-neutral-200 bg-neutral-50 px-4 transition focus-within:border-neutral-400 focus-within:bg-white"
        >
          <Search size={18} className="shrink-0 text-neutral-700" />
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => changeQuery(event.target.value)}
            placeholder="Search people, reels, photos..."
            aria-label="Search Spotli"
            className="min-w-0 flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-500"
          />
          {input ? (
            <button
              type="button"
              onClick={() => changeQuery("")}
              aria-label="Clear search"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-neutral-700 transition hover:bg-neutral-200"
            >
              <X size={17} />
            </button>
          ) : (
            <span className="hidden rounded-md border border-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-600 sm:inline">
              /
            </span>
          )}
        </form>

        {!showEmptyLanding ? (
          <div className="sticky top-0 z-20 -mx-4 mt-4 border-b border-neutral-100 bg-white/95 px-4 pb-2 pt-2 backdrop-blur sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
            <div className="flex w-full gap-2 overflow-x-auto scrollbar-none">
              {tabs.map((tab) => (
                <button
                  key={tab.label}
                  type="button"
                  onClick={() => setActiveTab(tab.label)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${activeTab === tab.label ? "bg-black text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
                >
                  {tab.label}
                  {!loading && query.length >= 2 ? (
                    <span
                      className={`ml-1.5 text-xs ${activeTab === tab.label ? "text-white/80" : "text-neutral-600"}`}
                    >
                      {tab.count}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {showEmptyLanding ? (
          <div className="mt-8 w-full space-y-8">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                  <Clock3 size={16} /> Recent searches
                </h2>
                {recentSearches.length ? (
                  <button
                    type="button"
                    onClick={clearRecent}
                    className="text-xs font-semibold text-neutral-700 underline-offset-2 hover:underline"
                  >
                    Clear all
                  </button>
                ) : null}
              </div>
              {recentSearches.length ? (
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((item) => (
                    <span
                      key={item}
                      className="inline-flex items-center gap-1 rounded-full bg-neutral-100 py-1.5 pl-3 pr-1.5 text-sm text-neutral-800"
                    >
                      <button type="button" onClick={() => pickRecent(item)}>
                        {item}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRecent(item)}
                        aria-label={`Remove ${item}`}
                        className="grid h-5 w-5 place-items-center rounded-full text-neutral-600 hover:bg-neutral-200"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-600">
                  Your recent searches will appear here.
                </p>
              )}
            </section>

            <section>
              <SectionHeading title="Suggested people" />
              {suggestionsLoading ? (
                <div className="flex gap-3 overflow-hidden">
                  {[0, 1, 2, 3].map((item) => (
                    <div
                      key={item}
                      className="h-40 w-36 shrink-0 animate-pulse rounded-2xl bg-neutral-100"
                    />
                  ))}
                </div>
              ) : suggestedPeople.length ? (
                renderPeopleCards(suggestedPeople)
              ) : (
                <p className="text-sm text-neutral-600">
                  People you may like will appear here.
                </p>
              )}
            </section>

            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-900">
                <TrendingUp size={16} /> Trending
              </h2>
              <div className="flex flex-wrap gap-2">
                {TRENDING_TOPICS.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => pickRecent(topic)}
                    className="rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-50"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : loading ? (
          <div className="w-full pt-2">
            <SkeletonResults
              mode={activeTab === "People" ? "people" : "grid"}
            />
          </div>
        ) : error ? (
          <div role="alert" className="py-12 text-center text-sm text-red-700">
            {error}
          </div>
        ) : noResults ? (
          <div className="py-16 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-neutral-100 text-neutral-600">
              <Search size={21} />
            </span>
            <p className="mt-4 text-base font-semibold text-neutral-900">
              No results for “{query}”
            </p>
            <p className="mt-1 text-sm text-neutral-700">
              Try another word, a username, or a shorter search.
            </p>
          </div>
        ) : activeTab === "People" ? (
          users.length ? (
            renderPeopleList(users)
          ) : (
            <EmptyResults label="people" query={query} />
          )
        ) : activeTab === "Reels" ? (
          reels.length ? (
            <div className="mt-5">{renderPostGrid(reels)}</div>
          ) : (
            <EmptyResults label="reels" query={query} />
          )
        ) : activeTab === "Photos" ? (
          photos.length ? (
            <div className="mt-5">{renderPostGrid(photos)}</div>
          ) : (
            <EmptyResults label="photos" query={query} />
          )
        ) : (
          <div className="space-y-7 pt-5">
            {users.length ? (
              <section>
                <SectionHeading
                  title="People"
                  count={users.length}
                  onSeeAll={() => setActiveTab("People")}
                />
                {renderPeopleCards(users)}
              </section>
            ) : null}
            {reels.length ? (
              <section>
                <SectionHeading
                  title="Reels"
                  count={reels.length}
                  onSeeAll={() => setActiveTab("Reels")}
                />
                {renderPostGrid(reels.slice(0, 6))}
              </section>
            ) : null}
            {photos.length ? (
              <section>
                <SectionHeading
                  title="Photos"
                  count={photos.length}
                  onSeeAll={() => setActiveTab("Photos")}
                />
                {renderPostGrid(photos.slice(0, 6))}
              </section>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}

function EmptyResults({ label, query }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm font-medium text-neutral-800">
        No {label} found for “{query}”
      </p>
      <p className="mt-1 text-xs text-neutral-700">
        Try another word or keyword.
      </p>
    </div>
  );
}
