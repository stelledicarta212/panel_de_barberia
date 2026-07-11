"use client";

import { Moon, Sun, Circle } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "classic-dark" | "dark";

function readTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem("ba_theme") as Theme | null;
  if (stored === "light" || stored === "classic-dark" || stored === "dark") {
    return stored;
  }
  return "dark";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const selectTheme = (next: Theme) => {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem("ba_theme", next);
  };

  return (
    <div className="ba-theme-switcher" role="group" aria-label="Selector de tema">
      <button
        type="button"
        className={theme === "light" ? "is-active" : ""}
        onClick={() => selectTheme("light")}
        aria-label="Tema claro"
        title="Tema claro"
      >
        <Sun size={18} />
      </button>

      <button
        type="button"
        className={theme === "classic-dark" ? "is-active" : ""}
        onClick={() => selectTheme("classic-dark")}
        aria-label="Tema oscuro clásico"
        title="Tema oscuro clásico"
      >
        <Circle size={14} fill="currentColor" />
      </button>

      <button
        type="button"
        className={theme === "dark" ? "is-active" : ""}
        onClick={() => selectTheme("dark")}
        aria-label="Tema oscuro glass"
        title="Tema oscuro glass"
      >
        <Moon size={18} />
      </button>
    </div>
  );
}
