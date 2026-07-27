import React, { useState, useEffect } from 'react'
import { FiSun, FiMoon } from 'react-icons/fi'

// Dark/light theme toggle. Theme contract (shared with the command palette's
// "Toggle theme" action): dark is the default (no attribute); light =
// data-theme="light" on <html>; persisted in localStorage "opa_theme".
// The DOM/localStorage is the single source of truth — this button re-reads it
// on every toggle and listens for changes from the other entry point, so the
// icon never goes stale (no dead first click).

const currentTheme = () => document.documentElement.getAttribute('data-theme') || 'dark'

// Apply + persist + broadcast so any other theme control re-syncs immediately.
export function applyTheme(next) {
  if (next === 'dark') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', next)
  localStorage.setItem('opa_theme', next)
  window.dispatchEvent(new CustomEvent('opa-theme-change', { detail: next }))
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(currentTheme)

  // Re-sync when the theme is changed elsewhere (command palette, another tab).
  useEffect(() => {
    const sync = () => setTheme(currentTheme())
    window.addEventListener('opa-theme-change', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('opa-theme-change', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const toggle = () => {
    const next = currentTheme() === 'light' ? 'dark' : 'light'
    applyTheme(next)
    setTheme(next)
  }

  const goingTo = theme === 'light' ? 'dark' : 'light'
  return (
    <button
      className="opa-btn ghost"
      onClick={toggle}
      title={`Switch to ${goingTo} theme`}
      aria-label={`Switch to ${goingTo} theme`}
    >
      {theme === 'light' ? <FiMoon size={14} /> : <FiSun size={14} />}
    </button>
  )
}
