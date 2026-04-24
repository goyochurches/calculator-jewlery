import { createContext, useContext, useEffect, useState } from 'react'

export interface ThemeColors {
  primary: string
  secondary: string
  tertiary: string
}

const DEFAULTS: ThemeColors = {
  primary: '#3C2E60',
  secondary: '#DBCEE2',
  tertiary: '#EDEAF9',
}

const STORAGE_KEY = 'workspace-theme-colors'

function applyToDOM(colors: ThemeColors) {
  const r = document.documentElement
  r.style.setProperty('--theme-primary', colors.primary)
  r.style.setProperty('--theme-secondary', colors.secondary)
  r.style.setProperty('--theme-tertiary', colors.tertiary)

  // Derived: lighter/darker variants
  r.style.setProperty('--theme-primary-muted', colors.primary + '26') // 15% opacity hex
  r.style.setProperty('--theme-secondary-muted', colors.secondary + '80') // 50% opacity
}

interface ThemeCtx {
  colors: ThemeColors
  setColors: (c: ThemeColors) => void
  resetColors: () => void
}

const ThemeContext = createContext<ThemeCtx>({
  colors: DEFAULTS,
  setColors: () => {},
  resetColors: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [colors, setColorsState] = useState<ThemeColors>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? { ...DEFAULTS, ...JSON.parse(stored) } : DEFAULTS
    } catch {
      return DEFAULTS
    }
  })

  useEffect(() => {
    applyToDOM(colors)
  }, [colors])

  const setColors = (c: ThemeColors) => {
    setColorsState(c)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
  }

  const resetColors = () => {
    setColors(DEFAULTS)
    localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <ThemeContext.Provider value={{ colors, setColors, resetColors }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
