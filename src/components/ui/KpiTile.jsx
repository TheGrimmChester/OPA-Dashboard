import React from 'react'
import Sparkline from './Sparkline'
import DeltaIndicator from './DeltaIndicator'

// Golden-signal tile: big tabular value + micro-label, optional inline sparkline,
// delta-vs-previous, and a status accent bar. `status` in ok|warn|error|neutral.
const STATUS_COLOR = { ok: 'var(--ok)', warn: 'var(--warn)', error: 'var(--error)', neutral: 'var(--neutral)' }

export default function KpiTile({ label, value, unit, icon, spark, sparkColor, status = 'neutral', current, previous, invert = false, footer }) {
  const color = STATUS_COLOR[status] || 'var(--neutral)'
  return (
    <div className="opa-kpi">
      <div className="opa-kpi-accent" style={{ background: color }} />
      <div className="opa-kpi-label">{icon}{label}</div>
      <div className="opa-kpi-value" style={status !== 'neutral' ? { color } : undefined}>
        {value}{unit && <span className="unit">{unit}</span>}
      </div>
      <div className="opa-kpi-foot">
        {(current != null && previous != null) && <DeltaIndicator current={current} previous={previous} invert={invert} />}
        {footer}
      </div>
      {spark && spark.length > 1 && (
        <div className="opa-kpi-spark"><Sparkline data={spark} width={110} height={30} color={sparkColor || color} /></div>
      )}
    </div>
  )
}
