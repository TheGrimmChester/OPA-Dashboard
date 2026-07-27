import React, { useState } from 'react'
import { FiSun, FiMoon } from 'react-icons/fi'

// Dark/light theme toggle. Theme contract (shared with the theme feature):
// dark is the default (no attribute); light = data-theme="light" on
// <html>; persisted in localStorage "opa_theme" ("light" | "dark").
// The button shows the icon for the theme you'd switch TO (sun = "go light",
// moon = "go dark"), and local state keeps that icon in sync immediately.
export default function ThemeToggle() {
  const [theme, setTheme] = useState(
    () => document.documentElement.getAttribute('data-theme') || 'dark'
  )

  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    if (next === 'dark') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('opa_theme', next)
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
