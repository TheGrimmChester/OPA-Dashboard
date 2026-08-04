import React, { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { FiAlertCircle, FiFilter } from 'react-icons/fi'
import { Badge } from './index'

const API = import.meta.env.VITE_API_URL || ''

/**
 * Dashboards: faceted sidebar with include/exclude chips.
 * onChange({ include: {field:[values]}, exclude: {field:[values]} })
 *
 * Calls GET /api/explore/facets (hub-owned). On transient failure/404, shows a
 * soft retry empty state — not ownership-deferred copy.
 */
export default function FacetSidebar({
  signal = 'spans',
  // Prefer dims with real NAS data (language/framework). environment/host/release
  // stay allowlisted on hub but are often empty until ingest fills them.
  fields = ['service', 'language', 'framework', 'status'],
  value,
  onChange,
}) {
  const [facets, setFacets] = useState({})
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const include = value?.include || {}
  const exclude = value?.exclude || {}

  const fieldsKey = fields.join(',')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const next = {}
      let anyOk = false
      let anyFail = false
      await Promise.all(fields.map(async (field) => {
        try {
          // Hub clamps hours to [1, 168]. Use the max window so chips align with
          // Trace Explorer list rows that are not limited to the last day.
          const res = await axios.get(`${API}/api/explore/facets`, { params: { signal, field, hours: 168 } })
          next[field] = res.data?.facets || []
          anyOk = true
        } catch {
          next[field] = []
          anyFail = true
        }
      }))
      if (!alive) return
      setFacets(next)
      setLoadError(anyFail && !anyOk)
    })()
    return () => { alive = false }
  }, [signal, fieldsKey, reloadKey])

  const retry = useCallback(() => {
    setLoadError(false)
    setReloadKey((k) => k + 1)
  }, [])

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

  return (
    <div style={{ minWidth: 200, maxWidth: 260 }} data-testid="facet-sidebar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }} className="oui-text-muted">
        <FiFilter size={12} /> Facets
      </div>
      {loadError ? (
        <div className="oui-text-muted" style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <FiAlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Facets temporarily unavailable. Try again.</span>
          </div>
          <button type="button" className="opa-btn ghost" style={{ fontSize: 12, alignSelf: 'flex-start' }} onClick={retry}>
            Retry
          </button>
        </div>
      ) : (
        <>
          {fields.map((field) => (
            <div key={field} style={{ marginBottom: 14 }}>
              <div className="oui-mono" style={{ fontSize: 11, marginBottom: 6 }}>{field}</div>
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
            <div className="oui-text-muted" style={{ fontSize: 11, wordBreak: 'break-all' }}>
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
