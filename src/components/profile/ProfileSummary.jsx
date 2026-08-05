import React from 'react'
import { Badge, StatRow, StatTile } from '@open-family/ui'
import { fmtBytes, fmtMs, fmtNum, fmtPct } from '../../theme/format'
import { METRICS } from '../../utils/callGraphModel'
import { EMPTY_TOTALS } from './useProfileModel'
import './profile.css'

// Which tile the current ranking metric belongs to (network folds into I/O when
// the trace reports none, so the strip never shows an empty column).
const METRIC_TILE = { duration: 'wall', cpu: 'cpu', io: 'io', memory: 'memory', network: 'network' }

function share(part, whole) {
  return whole > 0 ? `${fmtPct((Math.abs(part) / whole) * 100, 0)} of wall` : null
}

/**
 * Trace-level KPI strip. Every tile distinguishes "zero" from "not measured":
 * OPA durations are frequently placeholder zeros, and a confident 0ms is worse
 * than an honest dash.
 */
export default function ProfileSummary({ totals, metric = 'duration' }) {
  const t = totals || EMPTY_TOTALS
  const activeTile = METRIC_TILE[METRICS.indexOf(metric) >= 0 ? metric : 'duration']
  const showNetwork = t.network !== 0 || activeTile === 'network'

  const tiles = [
    {
      id: 'wall',
      label: 'Wall time',
      value: t.wall,
      text: fmtMs(t.wall),
      note: 'self time of every call',
    },
    {
      id: 'cpu',
      label: 'CPU time',
      value: t.cpu,
      text: fmtMs(t.cpu),
      note: share(t.cpu, t.wall),
    },
    {
      id: 'io',
      label: 'I/O wait',
      value: t.io,
      text: fmtMs(t.io),
      note: share(t.io, t.wall),
    },
    {
      id: 'memory',
      label: 'Memory',
      value: t.memory,
      text: fmtBytes(t.memory),
      note: 'net delta',
    },
    showNetwork && {
      id: 'network',
      label: 'Network',
      value: t.network,
      text: fmtBytes(t.network),
      note: 'sent + received',
    },
    {
      id: 'calls',
      label: 'Calls',
      value: t.calls,
      text: fmtNum(t.calls),
      // A call count of 0 is a fact about the trace, not a missing measurement.
      factual: true,
      note: `${fmtNum(t.symbols)} functions · depth ${t.maxDepth}`,
    },
  ].filter(Boolean)

  return (
    // StatRow auto-fits, so five tiles and six tiles both read as one strip.
    <StatRow>
      {tiles.map((tile) => {
        const measured = tile.factual || tile.value !== 0
        const active = tile.id === activeTile
        return (
          <StatTile
            key={tile.id}
            label={tile.label}
            value={measured ? tile.text : '—'}
            foot={
              <span className="opa-prof-foot-row">
                {active && <Badge tone="accent" round>ranking</Badge>}
                {!measured
                  ? <span className="opa-prof-dim">not recorded{active && t.structureMode ? ' · ranked by calls' : ''}</span>
                  : tile.note && <span className="oui-text-muted">{tile.note}</span>}
                {tile.id === 'calls' && t.truncated && (
                  <span className="opa-prof-warn">capped · {fmtNum(t.scanned)} scanned</span>
                )}
              </span>
            }
          />
        )
      })}
    </StatRow>
  )
}
