"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const THEMES = {
  "solarized-dark": { name: "Solarized Dark", icon: "🌙" },
  "solarized-light": { name: "Solarized Light", icon: "☀️" },
  midnight: { name: "Midnight Blue", icon: "🌃" },
  forest: { name: "Forest", icon: "🌿" },
  ocean: { name: "Ocean", icon: "🌊" },
  royal: { name: "Royal", icon: "👑" },
  sunset: { name: "Sunset", icon: "🌅" },
} as const;

export type Theme = keyof typeof THEMES;

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  themes: typeof THEMES;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "solarized-dark",
  setTheme: () => {},
  toggleTheme: () => {},
  themes: THEMES,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("solarized-dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    if (stored && stored in THEMES) {
      setTheme(stored);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    root.classList.remove(...Object.keys(THEMES));
    root.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme, mounted]);

  const toggleTheme = () => {
    const keys = Object.keys(THEMES) as Theme[];
    const idx = keys.indexOf(theme);
    setTheme(keys[(idx + 1) % keys.length]);
  };

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
