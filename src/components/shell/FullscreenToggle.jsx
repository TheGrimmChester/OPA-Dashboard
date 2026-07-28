import React, { useCallback, useEffect, useState } from 'react'
import { FiMaximize, FiMinimize } from 'react-icons/fi'

// Whole-page full screen, for putting a dashboard on a wall display or getting
// the chrome out of the way while reading a dense page.
//
// It does two things together, because either alone is half a feature: it asks
// the browser for real full screen (no tabs/URL bar) AND hides the app's own
// rail + top bar via a class on <html>, so the content actually gets the space.
// Leaving full screen — button, Esc, or F11 — restores both, which is why the
// state is driven by the fullscreenchange event rather than our own click.
export default function FullscreenToggle() {
  const [active, setActive] = useState(false)
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    setSupported(!!document.documentElement.requestFullscreen)
  }, [])

  // Single source of truth: whatever the browser says is full screen.
  useEffect(() => {
    const sync = () => {
      const on = !!document.fullscreenElement
      setActive(on)
      document.documentElement.classList.toggle('opa-page-fullscreen', on)
      // Fixed-width SVG children (flame/call graphs) re-measure on resize.
      requestAnimationFrame(() => {
        try { window.dispatchEvent(new Event('resize')) } catch (_e) { /* ignore */ }
      })
    }
    document.addEventListener('fullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.documentElement.classList.remove('opa-page-fullscreen')
    }
  }, [])

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch (_e) {
      // Denied (permissions policy, or not a user gesture): fall back to just
      // hiding the chrome, which is the useful half and always available.
      const on = !document.documentElement.classList.contains('opa-page-fullscreen')
      document.documentElement.classList.toggle('opa-page-fullscreen', on)
      setActive(on)
    }
  }, [])

  if (!supported) return null

  return (
    <button
      type="button"
      className="opa-btn ghost"
      onClick={toggle}
      title={active ? 'Exit full screen (Esc)' : 'Full screen'}
      aria-label={active ? 'Exit full screen' : 'Full screen'}
      aria-pressed={active}
    >
      {active ? <FiMinimize size={14} /> : <FiMaximize size={14} />}
    </button>
  )
}
