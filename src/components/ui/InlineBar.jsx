import React from 'react'

// Proportion bar for table cells: fraction 0..1 of the column max, with a label.
export default function InlineBar({ value, max, label, color = 'var(--accent)', width }) {
  const frac = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  return (
    <div className="opa-inlinebar" style={width ? { width } : undefined}>
      <div className="opa-inlinebar-fill" style={{ width: `${frac * 100}%`, background: color, opacity: 0.5 }} />
      {label != null && <span className="opa-inlinebar-label">{label}</span>}
    </div>
  )
}
