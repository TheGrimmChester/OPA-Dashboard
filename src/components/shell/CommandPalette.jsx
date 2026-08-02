import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { FiSearch, FiSun, FiRefreshCw, FiCornerDownLeft, FiServer, FiActivity, FiHardDrive, FiMonitor } from 'react-icons/fi'
import { NAV_GROUPS } from './SideRail'
import { useTimeRange } from '../../contexts/TimeRangeContext'
import { useI18n } from '../../contexts/I18nContext'
import { applyTheme } from './ThemeToggle'
import './CommandPalette.css'

const API = import.meta.env.VITE_API_URL || ''

function isTyping(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

function fuzzy(text, q) {
  if (!q) return true
  const t = text.toLowerCase()
  let i = 0
  for (const ch of q) {
    i = t.indexOf(ch, i)
    if (i === -1) return false
    i += 1
  }
  return true
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark'
  applyTheme(current === 'light' ? 'dark' : 'light')
}

const IS_MAC = /mac|iphone|ipad|ipod/i.test(
  (typeof navigator !== 'undefined' && (navigator.platform || navigator.userAgent)) || ''
)

const KIND_ICON = {
  service: FiServer, host: FiHardDrive, trace: FiActivity, session: FiMonitor, release: FiActivity,
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [entities, setEntities] = useState([])
  const navigate = useNavigate()
  const { refresh } = useTimeRange()
  const { t } = useI18n()
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const allSections = useMemo(() => {
    const routeSections = NAV_GROUPS.map((g) => ({
      label: t(g.labelKey),
      items: g.items.map((it) => ({
        kind: 'route',
        id: `route:${it.to}`,
        to: it.to,
        label: t(it.labelKey),
        icon: it.icon,
        hint: it.to,
      })),
    }))
    const actions = {
      label: 'Actions',
      items: [
        { kind: 'action', id: 'action:theme', label: 'Toggle light/dark theme', icon: FiSun, hint: 'Theme', run: toggleTheme },
        { kind: 'action', id: 'action:refresh', label: 'Refresh data', icon: FiRefreshCw, hint: 'Data', run: refresh },
      ],
    }
    return [...routeSections, actions]
  }, [refresh, t])

  // Wave 14-4: entity search via /api/search
  useEffect(() => {
    if (!open || query.trim().length < 2) { setEntities([]); return undefined }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await axios.get(`${API}/api/search`, { params: { q: query.trim(), limit: 12 }, signal: ctrl.signal })
        setEntities((res.data?.results || []).map((r) => ({
          kind: 'entity',
          id: `entity:${r.kind}:${r.id}`,
          to: r.href,
          label: `${r.kind}: ${r.label}`,
          icon: KIND_ICON[r.kind] || FiSearch,
          hint: r.id,
        })))
      } catch {
        setEntities([])
      }
    }, 180)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [query, open])

  const q = query.trim().toLowerCase()
  const sections = useMemo(() => {
    const base = !q
      ? allSections
      : allSections
        .map((s) => ({ label: s.label, items: s.items.filter((it) => fuzzy(it.label, q) || (it.hint && fuzzy(it.hint, q))) }))
        .filter((s) => s.items.length > 0)
    if (entities.length) return [{ label: 'Entities', items: entities }, ...base]
    return base
  }, [q, allSections, entities])
  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections])

  useEffect(() => {
    const onKey = (e) => {
      const k = (e.key || '').toLowerCase()
      if ((e.metaKey || e.ctrlKey) && k === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
        return
      }
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }
      if (e.key === '/' && !isTyping(e.target)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    const prevFocus = document.activeElement
    setQuery('')
    setSelected(0)
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => {
      cancelAnimationFrame(id)
      if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector(`[data-idx="${selected}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected, open])

  const activate = (item) => {
    if (!item) return
    setOpen(false)
    if (item.kind === 'route' || item.kind === 'entity') navigate(item.to)
    else item.run?.()
  }

  const onInputKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => (flat.length ? (s + 1) % flat.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => (flat.length ? (s - 1 + flat.length) % flat.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      activate(flat[selected])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  if (!open) return null

  const placeholder = `Search pages & entities… (${IS_MAC ? '⌘K' : 'Ctrl K'})`
  let idx = -1

  return (
    <div className="opa-cmdk-overlay" onMouseDown={() => setOpen(false)}>
      <div
        className="opa-cmdk-card"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="opa-cmdk-search">
          <FiSearch aria-hidden="true" />
          <input
            ref={inputRef}
            className="opa-cmdk-input"
            type="text"
            placeholder={placeholder}
            aria-label="Search commands, pages, and entities"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0) }}
            onKeyDown={onInputKeyDown}
            autoFocus
          />
        </div>

        <div className="opa-cmdk-results" role="listbox" aria-label="Results" ref={listRef}>
          {flat.length === 0 ? (
            <div className="opa-cmdk-empty">No results for “{query}”</div>
          ) : (
            sections.map((section) => (
              <div className="opa-cmdk-section" key={section.label}>
                <div className="opa-cmdk-section-label">{section.label}</div>
                {section.items.map((item) => {
                  idx += 1
                  const i = idx
                  const active = i === selected
                  const Icon = item.icon
                  return (
                    <div
                      key={item.id}
                      data-idx={i}
                      role="option"
                      aria-selected={active}
                      className={`opa-cmdk-row ${active ? 'active' : ''}`}
                      onMouseEnter={() => setSelected(i)}
                      onClick={() => activate(item)}
                    >
                      {Icon ? <Icon className="opa-cmdk-row-icon" aria-hidden="true" /> : <span className="opa-cmdk-row-icon" />}
                      <span className="opa-cmdk-row-label">{item.label}</span>
                      {item.hint && <span className="opa-cmdk-row-hint opa-mono">{item.hint}</span>}
                      {active && <FiCornerDownLeft className="opa-cmdk-row-enter" aria-hidden="true" />}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="opa-cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
