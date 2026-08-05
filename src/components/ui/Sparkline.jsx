import React from 'react'
import { Sparkline as FamilySparkline } from '@open-family/ui'

/**
 * A micro-trend.
 *
 * The family's sparkline is a 2px line with a ringed end marker and no area fill:
 * the fill added a second, weaker encoding of the same series and made two
 * adjacent sparklines read as one shape. Colour follows the product accent via
 * `--chart-mono`, so it is not a per-call-site decision.
 */
export default function Sparkline({
  data = [], width = 96, height = 28,
  // Accepted so call sites can be converted independently; deliberately unused.
  color: _color, area: _area, strokeWidth: _strokeWidth,
}) {
  const points = (data || [])
    .map((d) => (typeof d === 'number' ? d : d?.value))
    .filter((v) => v != null && !isNaN(v))

  if (points.length < 2) return null
  return <FamilySparkline points={points} width={width} height={height} />
}
