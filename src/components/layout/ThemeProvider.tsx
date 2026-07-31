'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

type Theme = 'dark' | 'light' | 'system'
interface ThemeContextType { theme: Theme; setTheme: (t: Theme) => void; resolvedTheme: 'dark' | 'light' }

const ThemeContext = createContext<ThemeContextType>({ theme: 'dark', setTheme: () => {}, resolvedTheme: 'dark' })
export const useTheme = () => useContext(ThemeContext)

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const resolved = theme === 'system' ? getSystemTheme() : theme
  document.documentElement.classList.remove('dark', 'light')
  document.documentElement.classList.add(resolved)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark')
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>('dark')

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    try { localStorage.setItem('theme', t) } catch {}
    const resolved = t === 'system' ? getSystemTheme() : t
    setResolvedTheme(resolved)
    applyTheme(t)
  }, [])

  useEffect(() => {
    try {
      const stored = localStorage.getItem('theme') as Theme | null
      if (stored) setThemeState(stored)
    } catch {}
    applyTheme(theme)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => { if (theme === 'system') setResolvedTheme(getSystemTheme()); applyTheme(theme) }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
