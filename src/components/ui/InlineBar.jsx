import React from 'react'
import { Meter } from '@open-family/ui'

/**
 * A proportion inside a table cell: this row's share of the column's maximum.
 *
 * The family's `Meter` requires a label, because a bar with no accessible name is
 * a decoration to a screen reader. The visible number stays beside it — the bar
 * carries the comparison, the number carries the value.
 */
export default function InlineBar({ value, max, label, width, tone = 'accent' }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <span className="opa-inline-meter" style={width ? { width } : undefined}>
      <Meter value={percent} tone={tone} label={label != null ? String(label) : 'Share of the column maximum'} />
      {label != null ? <span className="oui-num opa-inline-meter-label">{label}</span> : null}
    </span>
  )
}
