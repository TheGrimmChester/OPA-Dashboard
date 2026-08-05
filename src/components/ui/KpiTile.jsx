import React from 'react'
import { StatTile } from '@open-family/ui'

/**
 * A single measurement, on the family's stat tile.
 *
 * The one substantive change is the delta. This tile used to derive both the arrow
 * and the colour from `current` vs `previous`, with an `invert` flag that flipped
 * the *colour* for measures where a rise is bad. The family separates the two,
 * because they answer different questions: the arrow says which way the number
 * moved, and the colour says whether that is welcome. A falling error rate is a
 * down arrow in the good colour — drawing an up arrow because the change was
 * welcome would misstate the data.
 *
 * `status` and `sparkColor` are accepted and ignored. A tile's value is not
 * coloured by threshold in the family: a status hue always ships with a word
 * beside it, so thresholds belong on a badge, and the spark follows the accent.
 */
export default function KpiTile({
  label, value, unit, spark, current, previous, invert = false, footer,
  // Accepted so call sites can be converted independently; deliberately unused.
  icon: _icon, status: _status, sparkColor: _sparkColor,
}) {
  const comparable = current != null && previous != null && previous !== 0 && current !== previous
  const rising = comparable && current > previous

  const delta = comparable
    ? {
      value: `${Math.abs(((current - previous) / previous) * 100).toFixed(1)}%`,
      direction: rising ? 'up' : 'down',
      // `invert` marked a measure where a rise is unwelcome — latency, error rate.
      good: invert ? !rising : rising,
    }
    : undefined

  const points = Array.isArray(spark) ? spark.filter((v) => v != null) : null

  return (
    <StatTile
      label={label}
      value={unit ? `${value} ${unit}` : value}
      delta={delta}
      spark={points && points.length > 1 ? points : undefined}
      foot={footer}
    />
  )
}
