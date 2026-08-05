import React, { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { FiAlertCircle, FiFilter } from 'react-icons/fi'
import { Badge, Button } from '@open-family/ui'

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
    <div className="opa-facets" data-testid="facet-sidebar">
      <div className="oui-row oui-text-muted opa-facets-head">
        <FiFilter size={14} aria-hidden="true" /> Facets
      </div>
      {loadError ? (
        <div className="opa-facets-error oui-text-muted oui-text-sm">
          <span className="oui-row">
            <FiAlertCircle size={14} aria-hidden="true" />
            <span>Facets are temporarily unavailable.</span>
          </span>
          <Button size="sm" variant="secondary" onClick={retry}>Retry</Button>
        </div>
      ) : (
        <>
          {fields.map((field) => (
            <div key={field} className="opa-facet-group">
              <div className="oui-mono opa-facet-field">{field}</div>
              <div className="opa-facet-values">
                {(facets[field] || []).slice(0, 12).map((row) => {
                  const val = row.value || row.Value || ''
                  const count = row.count || row.Count || 0
                  const on = (include[field] || []).includes(val)
                  const off = (exclude[field] || []).includes(val)
                  return (
                    <Button
                      key={val}
                      size="sm"
                      variant="ghost"
                      block
                      className={`opa-facet-chip${on ? ' is-included' : ''}${off ? ' is-excluded' : ''}`}
                      aria-pressed={on}
                      onClick={() => toggle(field, val, 'include')}
                      onContextMenu={(e) => { e.preventDefault(); toggle(field, val, 'exclude') }}
                      title={`${val || 'empty'} — click to include, right-click to exclude`}
                    >
                      <span className="opa-facet-chip-label">{val || '—'}</span>
                      <Badge tone={off ? 'neutral' : 'accent'}>{count}</Badge>
                    </Button>
                  )
                })}
              </div>
            </div>
          ))}
          {(Object.keys(include).length > 0 || Object.keys(exclude).length > 0) && (
            <div className="oui-text-muted oui-mono opa-facet-dsl">
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
