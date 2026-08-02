import React from 'react'
import { inheritOptionLabel } from '../../utils/scmRuns'

/**
 * Tri-state preference control: Inherit | On | Off (or custom options).
 * Inherit label is generated from effective prefs + sources provenance.
 */
export default function TriStateSelect({
  field,
  value,
  onChange,
  effective = {},
  sources = {},
  disabled = false,
  options = null,
  'aria-label': ariaLabel,
}) {
  const inheritLabel = inheritOptionLabel(field, effective, sources)
  const opts = options || [
    { value: '', label: inheritLabel },
    { value: 'true', label: 'On' },
    { value: 'false', label: 'Off' },
  ]

  const selectValue = (() => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    return String(value)
  })()

  return (
    <select
      className="opa-select"
      value={selectValue}
      disabled={disabled}
      aria-label={ariaLabel || field}
      title={inheritLabel}
      onChange={(e) => {
        const v = e.target.value
        if (v === '') onChange(null)
        else if (v === 'true') onChange(true)
        else if (v === 'false') onChange(false)
        else onChange(v)
      }}
    >
      {opts.map((o) => (
        <option key={String(o.value)} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
