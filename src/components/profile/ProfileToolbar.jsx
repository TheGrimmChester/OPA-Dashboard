import React from 'react'
import { FiSearch, FiX } from 'react-icons/fi'
import { StatusPill } from '../ui'
import { fmtNum } from '../../theme/format'
import { METRICS, GROUP_BY } from '../../utils/callGraphModel'
import { EMPTY_TOTALS } from './useProfileModel'
import './profile.css'

// Single source of the metric / grouping vocabulary for every profile view.
export const METRIC_LABELS = {
  duration: 'Wall time',
  cpu: 'CPU time',
  io: 'I/O wait',
  memory: 'Memory',
  network: 'Network',
}

export const GROUP_BY_LABELS = {
  method: 'Method',
  class: 'Class',
  file: 'File',
  namespace: 'Namespace',
}

/**
 * One dense control row for the profile views: what to rank by, what to
 * aggregate by, a symbol filter, the trace shape, and a slot for the caller's
 * own view switcher.
 */
export default function ProfileToolbar({
  metric = 'duration',
  onMetricChange,
  groupBy = 'method',
  onGroupByChange,
  query = '',
  onQueryChange,
  totals,
  right,
}) {
  const t = totals || EMPTY_TOTALS
  const metricLabel = METRIC_LABELS[metric] || METRIC_LABELS.duration

  return (
    <div className="opa-row opa-prof-toolbar">
      <label className="opa-prof-field">
        Metric
        <select
          className="opa-select"
          value={metric}
          onChange={(e) => onMetricChange && onMetricChange(e.target.value)}
        >
          {METRICS.map((m) => <option key={m} value={m}>{METRIC_LABELS[m]}</option>)}
        </select>
      </label>

      <label className="opa-prof-field">
        Group by
        <select
          className="opa-select"
          value={groupBy}
          onChange={(e) => onGroupByChange && onGroupByChange(e.target.value)}
        >
          {GROUP_BY.map((g) => <option key={g} value={g}>{GROUP_BY_LABELS[g]}</option>)}
        </select>
      </label>

      <div className="opa-prof-search">
        <FiSearch aria-hidden="true" />
        <input
          className="opa-input"
          type="search"
          value={query}
          placeholder="Filter functions..."
          aria-label="Filter functions"
          onChange={(e) => onQueryChange && onQueryChange(e.target.value)}
        />
        {query !== '' && onQueryChange && (
          <button type="button" className="opa-prof-search-clear" aria-label="Clear filter" onClick={() => onQueryChange('')}>
            <FiX size={13} />
          </button>
        )}
      </div>

      {/* Compact for density; the exact counts live in the tooltip. */}
      <div
        className="opa-prof-sum opa-muted opa-tnum"
        title={`${t.calls} calls / ${t.symbols} functions / max depth ${t.maxDepth}`}
      >
        {fmtNum(t.calls)} calls / {fmtNum(t.symbols)} functions / depth {t.maxDepth}
      </div>

      {t.truncated && (
        <StatusPill tone="warn">capped at {fmtNum(t.calls)} of {fmtNum(t.scanned)}</StatusPill>
      )}
      {t.structureMode && (
        <StatusPill tone="neutral">no {metricLabel.toLowerCase()} data</StatusPill>
      )}

      {right && <div className="opa-prof-right">{right}</div>}
    </div>
  )
}
