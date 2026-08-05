import React from 'react'
import { Delta } from '@open-family/ui'

/**
 * Signed percentage change against a previous period.
 *
 * The arrow shows direction and the colour shows sentiment, which are two
 * different questions. `invert` marks a measure where a rise is unwelcome —
 * latency, error rate — so it flips the colour and leaves the arrow alone. This
 * used to conflate them behind one class name.
 */
export default function DeltaIndicator({ current, previous, invert = false, suffix = '' }) {
  if (current == null || previous == null || isNaN(current) || isNaN(previous)) {
    return <Delta value="—" direction="flat" />
  }

  if (previous === 0) {
    if (current === 0) return <Delta value={`0%${suffix}`} direction="flat" />
    // Growth from nothing has no meaningful percentage, so name it instead.
    return <Delta value="new" direction="up" good={!invert} />
  }

  const pct = ((current - previous) / Math.abs(previous)) * 100
  // Under half a percent is noise, not a movement.
  if (Math.abs(pct) < 0.5) return <Delta value={`${pct.toFixed(1)}%${suffix}`} direction="flat" />

  const rising = pct > 0
  return (
    <Delta
      value={`${Math.abs(pct).toFixed(1)}%${suffix}`}
      direction={rising ? 'up' : 'down'}
      good={invert ? !rising : rising}
    />
  )
}
