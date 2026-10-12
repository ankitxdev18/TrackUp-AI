export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "trackup_theme";

/**
 * Retrieves user's saved theme from localStorage, defaulting to 'dark'.
 */
export function getStoredTheme(): Theme {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "light" || stored === "dark") {
        return stored;
      }
    }
  } catch {
    // LocalStorage access may fail in restricted/private contexts
  }
  return "dark";
}

type ThemeListener = (theme: Theme) => void;
const themeListeners = new Set<ThemeListener>();

/**
 * Subscribes a callback to theme changes. Returns an unsubscribe function.
 */
export function subscribeTheme(listener: ThemeListener): () => void {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

/**
 * Applies theme to the document root via data-theme attribute and synchronizes localStorage.
 */
export function applyTheme(theme: Theme): void {
  try {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
      if (theme === "light") {
        document.documentElement.classList.add("theme-light");
      } else {
        document.documentElement.classList.remove("theme-light");
      }
    }
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  } catch {
    // Ignore storage exceptions
  }

  themeListeners.forEach((listener) => {
    try {
      listener(theme);
    } catch {
      // Ignore listener callback errors
    }
  });
}

/**
 * Initializes the theme on application mount.
 */
export function initTheme(): Theme {
  const theme = getStoredTheme();
  applyTheme(theme);
  return theme;
}
