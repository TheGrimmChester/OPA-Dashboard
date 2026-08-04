import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FiBookmark, FiChevronDown, FiTrash2 } from 'react-icons/fi'
import axios from 'axios'
import { Button, Input } from '@open-family/ui'
import { useTimeRange } from '../../contexts/TimeRangeContext'
import './SavedViews.css'

const API = import.meta.env.VITE_API_URL || ''

// Saved views: capture the current location + time range so a layout the user
// cares about can be recalled in one click. Backed by /api/dashboards; the
// global axios interceptor (main.jsx) attaches auth. config shape is
// { path, search, range } — nothing more is needed to restore a view.
export default function SavedViews() {
  const [open, setOpen] = useState(false)
  const [views, setViews] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')

  const ref = useRef(null)
  const location = useLocation()
  const navigate = useNavigate()
  const { range, setRange } = useTimeRange()

  const uid = localStorage.getItem('username') || 'local'

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await axios.get(`${API}/api/dashboards`, { params: { user_id: uid } })
      setViews(Array.isArray(data?.dashboards) ? data.dashboards : [])
    } catch {
      setError('Failed to load views')
    } finally {
      setLoading(false)
    }
  }, [uid])

  // (re)load the list every time the popover opens, and focus the name input.
  // The input is queried from the popover rather than held by a ref: the kit's
  // `Input` is a plain function component and does not forward one.
  useEffect(() => {
    if (!open) return
    load()
    const t = setTimeout(() => {
      ref.current?.querySelector('.opa-savedviews-input')?.focus()
    }, 0)
    return () => clearTimeout(t)
  }, [open, load])

  // close on outside-click + Esc (mirrors UserMenu behaviour).
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const saveCurrent = async () => {
    const trimmed = name.trim()
    if (!trimmed || saving) return
    setSaving(true)
    setError(null)
    const config = { path: location.pathname, search: location.search, range }
    try {
      await axios.post(`${API}/api/dashboards`, {
        name: trimmed,
        description: '',
        config,
        user_id: uid,
        is_shared: false,
      })
      setName('')
      await load()
    } catch {
      setError('Failed to save view')
    } finally {
      setSaving(false)
    }
  }

  const applyView = (v) => {
    const cfg = v?.config || {}
    if (cfg.range) setRange(cfg.range)
    navigate((cfg.path || '/') + (cfg.search || ''))
    setOpen(false)
  }

  const removeView = async (e, id) => {
    e.stopPropagation()
    setError(null)
    try {
      await axios.delete(`${API}/api/dashboards/${id}`)
      await load()
    } catch {
      setError('Failed to delete view')
    }
  }

  return (
    <div className="opa-savedviews" ref={ref}>
      <Button
        variant="ghost"
        onClick={() => setOpen((o) => !o)}
        title="Saved views"
        aria-haspopup="true"
        aria-expanded={open}
        icon={<FiBookmark />}
        iconAfter={<FiChevronDown />}
      >
        <span className="opa-savedviews-trigger-label">Views</span>
      </Button>

      {open && (
        <div className="opa-savedviews-pop" role="menu">
          <div className="opa-savedviews-save">
            <Input
              className="opa-savedviews-input"
              placeholder="Save current view…"
              aria-label="Name for the current view"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveCurrent() }}
            />
            <Button
              variant="primary"
              onClick={saveCurrent}
              disabled={!name.trim() || saving}
              loading={saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>

          {error && <div className="opa-savedviews-err">{error}</div>}

          <div className="opa-savedviews-list">
            {loading && <div className="opa-savedviews-state oui-text-muted">Loading…</div>}

            {!loading && !error && views.length === 0 && (
              <div className="opa-savedviews-state oui-text-muted">No saved views yet</div>
            )}

            {!loading && views.map((v) => {
              const cfg = v?.config || {}
              const meta = `${cfg.path || '/'}${cfg.range ? ` · ${cfg.range}` : ''}`
              return (
                <div
                  key={v.id}
                  className="opa-savedviews-item"
                  onClick={() => applyView(v)}
                  role="menuitem"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') applyView(v) }}
                  title={meta}
                >
                  <div className="opa-savedviews-item-main">
                    <div className="opa-savedviews-item-name">
                      {v.name}
                      {v.is_shared ? <span className="opa-badge opa-savedviews-shared">shared</span> : null}
                    </div>
                    <div className="opa-savedviews-item-meta oui-mono">{meta}</div>
                  </div>
                  <button
                    className="opa-savedviews-del"
                    onClick={(e) => removeView(e, v.id)}
                    title="Delete view"
                    aria-label={`Delete ${v.name}`}
                  >
                    <FiTrash2 size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
