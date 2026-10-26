const SETTINGS_KEY = "spotli.settings.preferences";

function normalizeAppearance(value) {
  const appearance = String(value || "light").toLowerCase();
  return ["light", "dark", "system"].includes(appearance)
    ? appearance
    : "light";
}

function readAppearancePreference() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return normalizeAppearance(stored.appearance);
  } catch {
    return "light";
  }
}

export function applyThemePreference(preference = readAppearancePreference()) {
  if (typeof document === "undefined") return;

  const appearance = normalizeAppearance(preference);
  const systemPrefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark =
    appearance === "dark" || (appearance === "system" && systemPrefersDark);

  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
}

export function initializeTheme() {
  if (typeof window === "undefined" || typeof document === "undefined")
    return () => {};

  applyThemePreference();

  const handleSettingsUpdated = (event) => {
    applyThemePreference(
      event.detail?.appearance ?? readAppearancePreference(),
    );
  };
  const handleStorage = (event) => {
    if (!event.key || event.key === SETTINGS_KEY) applyThemePreference();
  };
  const mediaQuery =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;
  const handleSystemThemeChange = () => {
    if (readAppearancePreference() === "system") applyThemePreference("system");
  };

  window.addEventListener("spotli:settings-updated", handleSettingsUpdated);
  window.addEventListener("storage", handleStorage);
  mediaQuery?.addEventListener?.("change", handleSystemThemeChange);
  // Compatibility with older browsers that implement addListener only.
  if (mediaQuery && !mediaQuery.addEventListener) {
    mediaQuery.addListener(handleSystemThemeChange);
  }

  return () => {
    window.removeEventListener(
      "spotli:settings-updated",
      handleSettingsUpdated,
    );
    window.removeEventListener("storage", handleStorage);
    mediaQuery?.removeEventListener?.("change", handleSystemThemeChange);
    if (mediaQuery && !mediaQuery.removeEventListener) {
      mediaQuery.removeListener(handleSystemThemeChange);
    }
  };
}
