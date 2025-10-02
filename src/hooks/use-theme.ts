import { useState, useEffect } from "react"

type Theme = "dark" | "light" | "system"

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("system")

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove("light", "dark")

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light"
      root.classList.add(systemTheme)
    } else {
      root.classList.add(theme)
    }
  }, [theme])

  return {
    theme,
    setTheme,
  }
}