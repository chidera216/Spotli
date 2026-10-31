import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  CircleHelp,
  Bell,
  LockKeyhole,
  PlayCircle,
  SlidersHorizontal,
  UserRound,
  ShieldCheck,
  Check,
  X,
  Settings as SettingsIcon,
  LogOut,
  Mail,
  ExternalLink,
  Smartphone,
  Moon,
  Sun,
  Monitor,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/useAuth";
import BottomNav from "../components/BottomNav";

const SETTINGS_KEY = "spotli.settings.preferences";

const DEFAULT_PREFERENCES = {
  showLikes: true,
  showComments: true,
  showFollows: true,
  showMentions: true,
  dataSaver: false,
  dataSaverUserChoice: false,
  startMuted: true,
  playbackRate: "1",
  appearance: "light",
  language: "English",
};

function normalizeAppearance(value) {
  const appearance = String(value || "light").toLowerCase();
  return ["light", "dark", "system"].includes(appearance)
    ? appearance
    : "light";
}

function shouldDefaultDataSaverOn() {
  if (typeof navigator === "undefined") return false;
  const connection =
    navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const effectiveType = String(connection?.effectiveType || "").toLowerCase();
  const downlink = Number(connection?.downlink);
  return Boolean(
    connection?.saveData === true ||
      ["slow-2g", "2g", "3g"].includes(effectiveType) ||
      (Number.isFinite(downlink) && downlink > 0 && downlink < 1.2),
  );
}

function readPreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      ...DEFAULT_PREFERENCES,
      ...stored,
      dataSaver:
        stored.dataSaverUserChoice === true &&
        typeof stored.dataSaver === "boolean"
          ? stored.dataSaver
          : shouldDefaultDataSaverOn(),
      dataSaverUserChoice: stored.dataSaverUserChoice === true,
      appearance: normalizeAppearance(stored.appearance),
    };
  } catch {
    return {
      ...DEFAULT_PREFERENCES,
      dataSaver: shouldDefaultDataSaverOn(),
      dataSaverUserChoice: false,
    };
  }
}

function savePreferences(next) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  window.dispatchEvent(
    new CustomEvent("spotli:settings-updated", { detail: next }),
  );
}

function PreferenceSwitch({ checked, onChange, label, description }) {
  return (
    <div className="flex items-center gap-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-neutral-900">{label}</p>
        {description && (
          <p className="mt-1 text-xs leading-5 text-neutral-500">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2D4A] focus-visible:ring-offset-2 ${checked ? "bg-[#FF2D4A]" : "bg-neutral-300"}`}
      >
        <span
          className={`spotli-switch-thumb absolute top-[3px] h-[26px] w-[26px] rounded-full bg-white shadow-sm transition-all duration-200 ${checked ? "left-[27px]" : "left-[3px]"}`}
        />
      </button>
    </div>
  );
}

const sections = [
  {
    id: "account",
    title: "Account",
    description: "Your personal details and account information",
    icon: UserRound,
  },
  {
    id: "privacy",
    title: "Privacy and security",
    description: "Control who can follow you and see your posts",
    icon: ShieldCheck,
  },
  {
    id: "notifications",
    title: "Notifications",
    description: "Manage your activity alerts",
    icon: Bell,
  },
  {
    id: "playback",
    title: "Content and playback",
    description: "Video playback and sound preferences",
    icon: PlayCircle,
  },
  {
    id: "preferences",
    title: "App preferences",
    description: "Appearance and language",
    icon: SlidersHorizontal,
  },
  {
    id: "help",
    title: "Help and about",
    description: "Support and Spotli information",
    icon: CircleHelp,
  },
];

function SettingsRow({ icon: Icon, title, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left transition hover:bg-neutral-50"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-800">
        <Icon size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-neutral-900">
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-neutral-500">
          {description}
        </span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-neutral-400" />
    </button>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [section, setSection] = useState("");
  const [isSavingPrivacy, setIsSavingPrivacy] = useState(false);
  const [privacyError, setPrivacyError] = useState("");
  const [privacySuccess, setPrivacySuccess] = useState("");
  const [requests, setRequests] = useState([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [busyRequestId, setBusyRequestId] = useState("");
  const [preferences, setPreferences] = useState(readPreferences);
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return false;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [logoutError, setLogoutError] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemAppearanceChange = (event) => {
      setSystemPrefersDark(event.matches);
    };

    mediaQuery.addEventListener?.("change", handleSystemAppearanceChange);
    if (!mediaQuery.addEventListener) {
      mediaQuery.addListener?.(handleSystemAppearanceChange);
    }

    return () => {
      mediaQuery.removeEventListener?.("change", handleSystemAppearanceChange);
      if (!mediaQuery.removeEventListener) {
        mediaQuery.removeListener?.(handleSystemAppearanceChange);
      }
    };
  }, []);

  function updatePreference(key, value) {
    setPreferences((current) => {
      const next = {
        ...current,
        [key]: value,
        ...(key === "dataSaver" ? { dataSaverUserChoice: true } : {}),
      };
      savePreferences(next);
      return next;
    });
  }

  const isPrivate = Boolean(user?.isPrivate);
  const effectiveAppearance =
    preferences.appearance === "system"
      ? systemPrefersDark
        ? "dark"
        : "light"
      : preferences.appearance;

  function handleAppearanceKeyDown(event, currentValue) {
    const optionValues = ["light", "dark", "system"];
    const currentIndex = optionValues.indexOf(currentValue);
    let nextIndex = currentIndex;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % optionValues.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex =
        (currentIndex - 1 + optionValues.length) % optionValues.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = optionValues.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextValue = optionValues[nextIndex];
    updatePreference("appearance", nextValue);
    event.currentTarget.parentElement
      ?.querySelector(`[data-appearance-option="${nextValue}"]`)
      ?.focus();
  }

  useEffect(() => {
    if (section !== "privacy") return;
    let active = true;
    setIsLoadingRequests(true);
    setRequestError("");
    api.users
      .getFollowRequests(1, 50)
      .then((result) => {
        if (active)
          setRequests(Array.isArray(result.requests) ? result.requests : []);
      })
      .catch((error) => {
        if (active)
          setRequestError(error.message || "Unable to load follow requests.");
      })
      .finally(() => {
        if (active) setIsLoadingRequests(false);
      });
    return () => {
      active = false;
    };
  }, [section]);

  async function handlePrivacyChange(nextValue) {
    if (isSavingPrivacy || nextValue === isPrivate) return;
    setIsSavingPrivacy(true);
    setPrivacyError("");
    setPrivacySuccess("");
    try {
      const result = await api.auth.updatePrivacy(nextValue);
      if (result.user) setUser((current) => ({ ...current, ...result.user }));
      setPrivacySuccess(result.message || "Privacy setting updated.");
    } catch (error) {
      setPrivacyError(error.message || "Unable to update account privacy.");
    } finally {
      setIsSavingPrivacy(false);
    }
  }

  async function handleRequest(followerId, action) {
    if (!followerId || busyRequestId) return;
    setBusyRequestId(followerId);
    setRequestError("");
    try {
      await api.users.respondToFollowRequest(followerId, action);
      setRequests((current) =>
        current.filter(
          (item) =>
            String(item.user?._id || item.user?.id) !== String(followerId),
        ),
      );
    } catch (error) {
      setRequestError(error.message || "Unable to update this follow request.");
    } finally {
      setBusyRequestId("");
    }
  }

  return (
    <div className="spotli-settings-page min-h-screen bg-white font-sans text-[#111111]">
      <main className="mx-auto min-h-screen w-full px-4 pb-24 pt-4 sm:w-[90%] sm:px-0 sm:pb-8 lg:pt-7">
        <div className="mb-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => (section ? setSection("") : navigate(-1))}
            aria-label={section ? "Back to settings" : "Go back"}
            className="grid h-10 w-10 place-items-center rounded-full transition hover:bg-neutral-100"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              {section
                ? sections.find((item) => item.id === section)?.title ||
                  "Settings"
                : "Settings"}
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              {section === "privacy"
                ? "Choose who can follow you and view your posts."
                : section
                  ? sections.find((item) => item.id === section)?.description ||
                    "Manage your Spotli preferences."
                  : "Manage your Spotli account and preferences."}
            </p>
          </div>
          {!section && <SettingsIcon size={21} className="text-neutral-500" />}
        </div>

        {!section ? (
          <>
            <section className="mb-4 rounded-2xl border border-neutral-200 px-4 py-1 sm:px-5">
              <PreferenceSwitch
                checked={Boolean(preferences.dataSaver)}
                onChange={(value) => updatePreference("dataSaver", value)}
                label="Data Saver"
                description="Reduce mobile data use by limiting automatic video quality and background downloads. Active videos still autoplay."
              />
              <p className="pb-3 text-xs text-neutral-500" role="status">
                {preferences.dataSaver
                  ? "Data Saver is on. Automatic playback is limited to a lower data profile."
                  : "Data Saver is off. Spotli will use the normal automatic playback profile."}
              </p>
            </section>
            <section className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 p-1 sm:p-2">
            {sections.map((item) => (
              <SettingsRow
                key={item.id}
                icon={item.icon}
                title={item.title}
                description={item.description}
                onClick={() => setSection(item.id)}
              />
            ))}
            <button
              type="button"
              disabled={isLoggingOut}
              onClick={async () => {
                if (isLoggingOut) return;
                setIsLoggingOut(true);
                setLogoutError("");
                try {
                  await api.auth.logout();
                  setUser(null);
                  navigate("/login", { replace: true });
                } catch (error) {
                  setLogoutError(error.message || "Unable to log out.");
                } finally {
                  setIsLoggingOut(false);
                }
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left text-sm font-semibold text-[#FF2D4A] transition hover:bg-neutral-50"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-rose-50">
                <LogOut size={19} />
              </span>
              {isLoggingOut ? "Logging out…" : "Log out"}
            </button>
            {logoutError && (
              <p role="alert" className="px-4 py-2 text-sm text-red-600">
                {logoutError}
              </p>
            )}
            {privacyError && (
              <p className="px-4 py-2 text-sm text-red-600">{privacyError}</p>
            )}
            </section>
          </>
        ) : section === "privacy" ? (
          <div className="space-y-5">
            <section className="rounded-2xl border border-neutral-200 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-100">
                  <LockKeyhole size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-neutral-900">
                    Private account
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-neutral-500">
                    {isPrivate
                      ? "Only approved followers can view your posts. New people must request to follow you."
                      : "Your profile and posts are public. Anyone can follow you without approval."}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isPrivate}
                  aria-label="Private account"
                  disabled={isSavingPrivacy}
                  onClick={() => handlePrivacyChange(!isPrivate)}
                  className={`relative mt-1 h-8 w-14 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2D4A] focus-visible:ring-offset-2 disabled:opacity-60 ${isPrivate ? "bg-[#FF2D4A]" : "bg-neutral-300"}`}
                >
                  <span
                    className={`spotli-switch-thumb absolute top-[3px] h-[26px] w-[26px] rounded-full bg-white shadow-sm transition-all duration-200 ${isPrivate ? "left-[27px]" : "left-[3px]"}`}
                  />
                </button>
              </div>
              {isSavingPrivacy && (
                <p className="mt-3 text-xs text-neutral-500">
                  Saving privacy setting…
                </p>
              )}
              {privacyError && (
                <p role="alert" className="mt-3 text-sm text-red-600">
                  {privacyError}
                </p>
              )}
              {privacySuccess && (
                <p role="status" className="mt-3 text-sm text-emerald-700">
                  {privacySuccess}
                </p>
              )}
              {isPrivate && (
                <p className="mt-4 rounded-xl bg-neutral-50 px-3 py-3 text-xs leading-5 text-neutral-600">
                  Your existing followers stay approved when you make your
                  account private.
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-neutral-200 p-4 sm:p-5">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-neutral-900">
                  Follow requests
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Approve or reject people who want to follow you.
                </p>
              </div>
              {isLoadingRequests ? (
                <p className="py-5 text-center text-sm text-neutral-500">
                  Loading requests…
                </p>
              ) : requestError ? (
                <p role="alert" className="py-3 text-sm text-red-600">
                  {requestError}
                </p>
              ) : requests.length ? (
                <div className="divide-y divide-neutral-100">
                  {requests.map((item) => {
                    const person = item.user || {};
                    const id = String(person._id || person.id || "");
                    const name =
                      `${person.firstName || ""} ${person.lastName || ""}`.trim() ||
                      person.username ||
                      "Spotli user";
                    return (
                      <div key={id} className="flex items-center gap-3 py-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-neutral-100 text-sm font-semibold text-neutral-700">
                          {person.avatar ? (
                            <img
                              src={person.avatar}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            name.slice(0, 1).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {name}
                          </p>
                          <p className="truncate text-xs text-neutral-500">
                            @{person.username || "creator"}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={Boolean(busyRequestId)}
                          onClick={() => handleRequest(id, "approve")}
                          className="inline-flex h-9 items-center gap-1 rounded-full bg-[#FF2D4A] px-3 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          <Check size={14} /> Approve
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busyRequestId)}
                          onClick={() => handleRequest(id, "reject")}
                          className="grid h-9 w-9 place-items-center rounded-full border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-60"
                          aria-label={`Reject ${name}`}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="py-5 text-center text-sm text-neutral-500">
                  No pending follow requests.
                </p>
              )}
            </section>
          </div>
        ) : section === "account" ? (
          <div className="space-y-4">
            <section className="rounded-2xl border border-neutral-200 p-4 sm:p-5">
              <h2 className="mb-4 text-sm font-semibold text-neutral-900">
                Account information
              </h2>
              <div className="divide-y divide-neutral-100">
                {[
                  [
                    "Full name",
                    [user?.firstName, user?.lastName]
                      .filter(Boolean)
                      .join(" ") || "Not set",
                  ],
                  [
                    "Username",
                    user?.username ? `@${user.username}` : "Not set",
                  ],
                  ["Email address", user?.email || "Not available"],
                  [
                    "Sign-in method",
                    user?.authProvider === "google"
                      ? "Google"
                      : "Email and password",
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <span className="text-sm text-neutral-500">{label}</span>
                    <span className="max-w-full break-all text-right text-sm font-medium text-neutral-900">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-neutral-500">
                To change your name, username, or profile details, use Edit
                Profile.
              </p>
              <button
                type="button"
                onClick={() => navigate("/profile")}
                className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-[#FF2D4A] px-5 text-sm font-semibold text-white transition hover:brightness-95"
              >
                Edit Profile
              </button>
            </section>
            <section className="rounded-2xl border border-neutral-200 p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-neutral-900">
                Account access
              </h2>
              <p className="mt-1 text-sm leading-6 text-neutral-500">
                Password changes and account deletion are not available in this
                version. We won't show controls that pretend these actions are
                supported.
              </p>
            </section>
          </div>
        ) : section === "notifications" ? (
          <section className="rounded-2xl border border-neutral-200 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-neutral-900">
              Notification display
            </h2>
            <p className="mt-1 text-sm leading-6 text-neutral-500">
              Choose which types appear in your Notifications page on this
              device. These preferences do not change server-side notification
              delivery or the unread badge count.
            </p>
            <div className="mt-3 divide-y divide-neutral-100">
              <PreferenceSwitch
                checked={preferences.showLikes}
                onChange={(value) => updatePreference("showLikes", value)}
                label="Likes"
                description="When someone likes your posts"
              />
              <PreferenceSwitch
                checked={preferences.showComments}
                onChange={(value) => updatePreference("showComments", value)}
                label="Comments and replies"
                description="When someone comments or replies to you"
              />
              <PreferenceSwitch
                checked={preferences.showFollows}
                onChange={(value) => updatePreference("showFollows", value)}
                label="Follows and requests"
                description="New followers, follow requests, and approvals"
              />
              <PreferenceSwitch
                checked={preferences.showMentions}
                onChange={(value) => updatePreference("showMentions", value)}
                label="Mentions and messages"
                description="Mentions and message-related notifications"
              />
            </div>
            <p className="mt-3 text-xs text-emerald-700" role="status">
              Preferences save automatically on this device.
            </p>
          </section>
        ) : section === "playback" ? (
          <section className="rounded-2xl border border-neutral-200 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-neutral-900">
              Video playback
            </h2>
            <p className="mt-1 text-sm leading-6 text-neutral-500">
              Set your default video sound and playback speed. Changes are saved
              on this device.
            </p>
            <div className="mt-3 divide-y divide-neutral-100">
              <PreferenceSwitch
                checked={preferences.startMuted}
                onChange={(value) => updatePreference("startMuted", value)}
                label="Start videos muted"
                description="Keep videos silent until you turn the sound on"
              />
              <div className="flex items-center gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-neutral-900">
                    Default playback speed
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Choose your preferred starting speed.
                  </p>
                </div>
                <select
                  value={preferences.playbackRate}
                  onChange={(event) =>
                    updatePreference("playbackRate", event.target.value)
                  }
                  className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-800 outline-none focus:border-[#FF2D4A]"
                >
                  <option value="0.5">0.5×</option>
                  <option value="0.75">0.75×</option>
                  <option value="1">1× Normal</option>
                  <option value="1.25">1.25×</option>
                  <option value="1.5">1.5×</option>
                  <option value="2">2×</option>
                </select>
              </div>
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              These defaults will be used when opening the video viewer; an
              in-player change can still override them for the current session.
            </p>
          </section>
        ) : section === "preferences" ? (
          <section className="spotli-settings-preferences-card rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
            <div className="divide-y divide-neutral-100">
              <div className="py-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-100">
                    {preferences.appearance === "dark" ? (
                      <Moon size={18} />
                    ) : preferences.appearance === "system" ? (
                      <Monitor size={18} />
                    ) : (
                      <Sun size={18} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-neutral-900">
                      Appearance
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {preferences.appearance === "system"
                        ? `Following your device's ${effectiveAppearance} appearance.`
                        : effectiveAppearance === "dark"
                          ? "Dark mode is on across Spotli."
                          : "Light mode is on across Spotli."}
                    </p>
                  </div>
                </div>
                <div
                  role="radiogroup"
                  aria-label="Website appearance"
                  className="mt-4 divide-y divide-neutral-100"
                >
                  {[
                    {
                      value: "light",
                      label: "Light mode",
                      description: "Use Spotli's light appearance.",
                    },
                    {
                      value: "dark",
                      label: "Dark mode",
                      description: "Use Spotli's dark appearance.",
                    },
                    {
                      value: "system",
                      label: "System",
                      description: "Follow your device's appearance setting.",
                    },
                  ].map(({ value, label, description }) => {
                    const selected = preferences.appearance === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={label}
                        tabIndex={selected ? 0 : -1}
                        data-appearance-option={value}
                        onClick={() => updatePreference("appearance", value)}
                        onKeyDown={(event) =>
                          handleAppearanceKeyDown(event, value)
                        }
                        className="flex w-full items-center gap-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF2D4A]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-neutral-900">
                            {label}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-neutral-500">
                            {description}
                          </span>
                        </span>
                        <span
                          aria-hidden="true"
                          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200 ${selected ? "bg-[#FF2D4A]" : "bg-neutral-300"}`}
                        >
                          <span
                            className={`spotli-switch-thumb absolute top-[3px] h-[26px] w-[26px] rounded-full bg-white shadow-sm transition-all duration-200 ${selected ? "left-[27px]" : "left-[3px]"}`}
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-3 py-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-neutral-100">
                  <Smartphone size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-neutral-900">
                    Language
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Only English is currently available.
                  </p>
                </div>
                <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-600">
                  English
                </span>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-neutral-500">
              Appearance is saved on this device and applies across Spotli.
              System follows your device's light or dark preference. English is
              the only language currently available.
            </p>
          </section>
        ) : section === "help" ? (
          <div className="space-y-4">
            <section className="rounded-2xl border border-neutral-200 p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-neutral-900">
                Help and support
              </h2>
              <p className="mt-2 text-sm leading-6 text-neutral-500">
                Need help with Spotli? You can review these quick pointers.
              </p>
              <div className="mt-4 divide-y divide-neutral-100">
                <div className="py-3">
                  <p className="text-sm font-semibold text-neutral-900">
                    Account and privacy
                  </p>
                  <p className="mt-1 text-sm leading-6 text-neutral-500">
                    Manage private-account settings and approve follow requests
                    under Privacy and security.
                  </p>
                </div>
                <div className="py-3">
                  <p className="text-sm font-semibold text-neutral-900">
                    Notifications
                  </p>
                  <p className="mt-1 text-sm leading-6 text-neutral-500">
                    Your unread notification count appears in the sidebar.
                    Follow requests can be accepted from Notifications or
                    Privacy and security.
                  </p>
                </div>
                <div className="py-3">
                  <p className="text-sm font-semibold text-neutral-900">
                    Profile details
                  </p>
                  <p className="mt-1 text-sm leading-6 text-neutral-500">
                    Use Edit Profile to update your profile information.
                  </p>
                </div>
              </div>
            </section>
            <section className="rounded-2xl border border-neutral-200 p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-neutral-900">
                About Spotli
              </h2>
              <p className="mt-2 text-sm leading-6 text-neutral-500">
                Spotli is a place to share videos, photos, and moments with your
                community.
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3 text-sm">
                <span className="text-neutral-500">Application</span>
                <span className="font-semibold text-neutral-900">Spotli</span>
              </div>
              <p className="mt-3 text-xs leading-5 text-neutral-500">
                Privacy policy and community guidelines links will be added when
                their official pages are available.
              </p>
            </section>
          </div>
        ) : (
          <section className="rounded-2xl border border-neutral-200 px-4 py-8 text-center sm:px-6">
            <p className="text-sm text-neutral-600">
              This section is not available yet.
            </p>
          </section>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
