"use client";

/**
 * Light and dark, following the system unless the user says otherwise.
 *
 * The design tokens for both already existed in `globals.css` -- shadcn ships
 * a `.dark` block -- but nothing ever put the class on `<html>`, so the dark
 * half was unreachable and pages drifted into hardcoded greys instead.
 *
 * "System" is the default rather than "light", because a desktop app that
 * ignores the OS setting looks broken next to everything else, and a web page
 * that ignores `prefers-color-scheme` looks worse.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ThemePreference = "dark" | "light" | "system";

const STORAGE_KEY = "hdr-theme";

interface ThemeContextValue {
  /** What is actually on screen, once "system" has been resolved. */
  resolved: "dark" | "light";
  setTheme: (theme: ThemePreference) => void;
  theme: ThemePreference;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Always "system" on the first render. This is a static export, so the
  // server-rendered HTML is produced at build time and cannot know the user's
  // preference; reading localStorage here instead of in an effect would make
  // the first client render disagree with it and hydration would fail.
  const [theme, setThemeState] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<"dark" | "light">("light");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    if (stored === "dark" || stored === "light" || stored === "system") {
      setThemeState(stored);
    }
  }, []);

  useEffect(() => {
    const apply = () => {
      let next: "dark" | "light";
      if (theme === "system") {
        next = systemPrefersDark() ? "dark" : "light";
      } else {
        next = theme;
      }
      setResolved(next);
      document.documentElement.classList.toggle("dark", next === "dark");
      // Tells the browser which scrollbar and form-control palette to use, so
      // native chrome matches rather than staying stubbornly light.
      document.documentElement.style.colorScheme = next;
    };
    apply();

    if (theme !== "system") {
      return;
    }
    // Only while following the system: an explicit choice should not be
    // overridden when the OS flips at sunset.
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [theme]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo(
    () => ({ resolved, setTheme, theme }),
    [resolved, setTheme, theme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return context;
}
