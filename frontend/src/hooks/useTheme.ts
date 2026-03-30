import { useState, useEffect } from 'react'

export type ThemeName = 'black' | 'navy'

export function useTheme() {
  const [theme, setTheme] = useState<ThemeName>(
    () => (localStorage.getItem('mip_theme') as ThemeName) ?? 'black'
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme === 'navy' ? 'navy' : ''
    localStorage.setItem('mip_theme', theme)
  }, [theme])

  const toggle = () => setTheme(t => (t === 'black' ? 'navy' : 'black'))

  return { theme, toggle, isBlack: theme === 'black' }
}
