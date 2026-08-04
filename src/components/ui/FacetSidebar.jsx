import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { FiClock, FiFilter } from 'react-icons/fi'
import { Badge } from './index'
import { EmptyState } from './States'
import { hubDeferredCopy, isHubDeferred } from '../../utils/hubDeferred'

const API = import.meta.env.VITE_API_URL || ''
const DEFERRED_ID = 'exploreFacets'

/**
 * Dashboards: faceted sidebar with include/exclude chips.
 * onChange({ include: {field:[values]}, exclude: {field:[values]} })
 *
 * When GET /api/explore/facets is deferred (hub+edge 404), show an intentional
 * empty state instead of blank field chips that look broken.
 */
export default function FacetSidebar({
  signal = 'spans',
  fields = ['service', 'environment', 'release', 'host', 'status'],
  value,
  onChange,
}) {
  const deferred = isHubDeferred(DEFERRED_ID)
  const deferredCopy = deferred ? hubDeferredCopy(DEFERRED_ID) : null
  const [facets, setFacets] = useState({})
  const [unavailable, setUnavailable] = useState(false)
  const include = value?.include || {}
  const exclude = value?.exclude || {}

  useEffect(() => {
    if (deferred) return undefined
    let alive = true
    ;(async () => {
      const next = {}
      let anyOk = false
      let anyFail = false
      await Promise.all(fields.map(async (field) => {
        try {
          const res = await axios.get(`${API}/api/explore/facets`, { params: { signal, field, hours: 24 } })
          next[field] = res.data?.facets || []
          anyOk = true
        } catch {
          next[field] = []
          anyFail = true
        }
      }))
      if (!alive) return
      setFacets(next)
      // No fake chips: if every field failed (typical 404), show ownership empty state.
      setUnavailable(anyFail && !anyOk)
    })()
    return () => { alive = false }
  }, [deferred, signal, fields.join(',')])

  const toggle = (field, val, mode) => {
    const bucket = mode === 'exclude' ? { ...exclude } : { ...include }
    const other = mode === 'exclude' ? { ...include } : { ...exclude }
    const list = new Set(bucket[field] || [])
    if (list.has(val)) list.delete(val)
    else list.add(val)
    bucket[field] = [...list]
    // remove from the other polarity
    if (other[field]) other[field] = other[field].filter((v) => v !== val)
    onChange?.(mode === 'exclude'
      ? { include: other, exclude: bucket }
      : { include: bucket, exclude: other })
  }

  const toFilterDSL = () => {
    const parts = []
    Object.entries(include).forEach(([f, vals]) => vals.forEach((v) => parts.push(`${f}:"${v}"`)))
    Object.entries(exclude).forEach(([f, vals]) => vals.forEach((v) => parts.push(`-${f}:"${v}"`)))
    return parts.join(' ')
  }

  const showDeferred = deferred || unavailable
  const emptyTitle = deferredCopy?.title || 'Not available on hub yet'
  const emptyHint = deferredCopy?.hint
    || 'Trace explore facets are deferred — no hub or edge backend for GET /api/explore/facets. Restore the ClickHouse facet query on hub before enabling chips.'

  return (
    <div style={{ minWidth: 200, maxWidth: 260 }} data-testid="facet-sidebar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }} className="opa-muted">
        <FiFilter size={12} /> Facets
      </div>
      {showDeferred ? (
        <EmptyState
          icon={<FiClock />}
          title={emptyTitle}
          hint={emptyHint}
        />
      ) : (
        <>
          {fields.map((field) => (
            <div key={field} style={{ marginBottom: 14 }}>
              <div className="opa-mono" style={{ fontSize: 11, marginBottom: 6 }}>{field}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(facets[field] || []).slice(0, 12).map((row) => {
                  const val = row.value || row.Value || ''
                  const count = row.count || row.Count || 0
                  const on = (include[field] || []).includes(val)
                  const off = (exclude[field] || []).includes(val)
                  return (
                    <div key={val} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <button
                        type="button"
                        className="opa-btn ghost"
                        style={{
                          flex: 1, display: 'flex', justifyContent: 'space-between', fontSize: 12,
                          opacity: off ? 0.4 : 1,
                          outline: on ? '1px solid var(--accent)' : undefined,
                        }}
                        onClick={() => toggle(field, val, 'include')}
                        onContextMenu={(e) => { e.preventDefault(); toggle(field, val, 'exclude') }}
                        title="Click include · right-click exclude"
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{val || '—'}</span>
                        <Badge>{count}</Badge>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {(Object.keys(include).length > 0 || Object.keys(exclude).length > 0) && (
            <div className="opa-muted" style={{ fontSize: 11, wordBreak: 'break-all' }}>
              {toFilterDSL()}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function facetsToFilterString(value) {
  const include = value?.include || {}
  const exclude = value?.exclude || {}
  const parts = []
  Object.entries(include).forEach(([f, vals]) => vals.forEach((v) => parts.push(`${f}:"${v}"`)))
  Object.entries(exclude).forEach(([f, vals]) => vals.forEach((v) => parts.push(`-${f}:"${v}"`)))
  return parts.join(' ')
}
