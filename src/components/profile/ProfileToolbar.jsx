import React from 'react'
import { FiAlertTriangle, FiSearch, FiX } from 'react-icons/fi'
import { Badge, Button, Input, Select } from '@open-family/ui'
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

const METRIC_OPTIONS = METRICS.map((m) => ({ value: m, label: METRIC_LABELS[m] }))
const GROUP_BY_OPTIONS = GROUP_BY.map((g) => ({ value: g, label: GROUP_BY_LABELS[g] }))

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
    <div className="oui-row opa-prof-toolbar">
      <label className="opa-prof-field">
        Metric
        <Select
          value={metric}
          options={METRIC_OPTIONS}
          onChange={(e) => onMetricChange && onMetricChange(e.target.value)}
        />
      </label>

      <label className="opa-prof-field">
        Group by
        <Select
          value={groupBy}
          options={GROUP_BY_OPTIONS}
          onChange={(e) => onGroupByChange && onGroupByChange(e.target.value)}
        />
      </label>

      <div className="opa-prof-search">
        <Input
          icon={<FiSearch />}
          type="search"
          value={query}
          placeholder="Filter functions..."
          aria-label="Filter functions"
          onChange={(e) => onQueryChange && onQueryChange(e.target.value)}
        />
        {query !== '' && onQueryChange && (
          <Button
            variant="ghost"
            size="sm"
            className="opa-prof-search-clear"
            icon={<FiX />}
            aria-label="Clear filter"
            onClick={() => onQueryChange('')}
          />
        )}
      </div>

      {/* Compact for density; the exact counts live in the tooltip. */}
      <div
        className="opa-prof-sum oui-text-muted oui-num"
        title={`${t.calls} calls / ${t.symbols} functions / max depth ${t.maxDepth}`}
      >
        {fmtNum(t.calls)} calls / {fmtNum(t.symbols)} functions / depth {t.maxDepth}
      </div>

      {t.truncated && (
        <Badge tone="warning" icon={<FiAlertTriangle />}>
          capped at {fmtNum(t.calls)} of {fmtNum(t.scanned)}
        </Badge>
      )}
      {t.structureMode && (
        <Badge tone="neutral">no {metricLabel.toLowerCase()} data</Badge>
      )}

      {right && <div className="opa-prof-right">{right}</div>}
    </div>
  )
}
