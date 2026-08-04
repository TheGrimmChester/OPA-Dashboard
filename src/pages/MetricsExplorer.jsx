import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  FiX, FiSearch, FiBarChart2, FiFilter, FiLayers, FiChevronDown, FiChevronRight,
  FiActivity, FiTrendingUp, FiTrendingDown, FiHash,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import {
  Panel, TimeSeriesChart, SegmentedControl, StatusPill, EmptyState, Badge, KpiTile,
} from '../components/ui'
import { fmtNum, fmtBytes, fmtMs, fmtPct, SERIES } from '../theme/format'
import './MetricsExplorer.css'

// Metrics Explorer — the surface for metrics nobody anticipated needing.
//
// Every other page in this app answers a question someone chose in advance. This is
// the one that does not: pick any metric, filter by any label, group by any
// dimension. Without it, a new metric arriving from a collector stays invisible
// until somebody ships a page for it.
//
// All state lives in the URL, so a view someone finds interesting is a link they
// can send.

const AGG_OPTIONS = [
  { value: 'avg', label: 'avg' },
  { value: 'max', label: 'max' },
  { value: 'min', label: 'min' },
  { value: 'sum', label: 'sum' },
  { value: 'last', label: 'last' },
  { value: 'p95', label: 'p95' },
  { value: 'p99', label: 'p99' },
]

// Soft ceiling: grouping above this draws a spaghetti chart. Still allowed —
// the warning is the product, not a hard stop.
const HIGH_CARDINALITY = 40
const MAX_LEGEND_SERIES = 12
const ROW_H = 30
const GROUP_H = 28

function namespaceOf(name) {
  const i = String(name || '').indexOf('.')
  return i > 0 ? name.slice(0, i) : (name || 'other')
}

function shortName(name, ns) {
  const prefix = `${ns}.`
  return name.startsWith(prefix) ? name.slice(prefix.length) : name
}

function fmtMetric(v) {
  if (v == null || Number.isNaN(v)) return '—'
  const abs = Math.abs(v)
  if (abs === 0) return '0'
  if (abs >= 1000) return fmtNum(v)
  if (abs >= 10) return v.toFixed(1)
  if (abs >= 1) return v.toFixed(2)
  if (abs >= 0.01) return v.toFixed(3)
  return v.toExponential(1)
}

function isRatioMetric(name) {
  return typeof name === 'string' && /\.(utilization|hit_rate)$/.test(name)
}

function unitFormatter(unit, name) {
  switch (unit) {
    case 'By':
      return fmtBytes
    case 's':
      return (v) => (v == null ? '—' : `${fmtMetric(v)} s`)
    case 'ms':
      return fmtMs
    case '1':
      if (!isRatioMetric(name)) return fmtMetric
      return (v) => (v == null ? '—' : fmtPct(v * 100, 1))
    default:
      return fmtMetric
  }
}

const UNIT_LABELS = {
  By: 'bytes',
  s: 'seconds',
  ms: 'milliseconds',
}

function unitLabel(unit, name) {
  if (!unit) return ''
  if (unit === '1') return isRatioMetric(name) ? 'ratio' : ''
  if (UNIT_LABELS[unit]) return UNIT_LABELS[unit]
  const annotated = unit.match(/^\{(.+)\}$/)
  return annotated ? annotated[1] : unit
}

function parseMatcher(raw) {
  if (raw.includes('=~')) {
    const [name, value] = raw.split('=~')
    return { raw, name, value, op: '=~' }
  }
  if (raw.includes('!:')) {
    const [name, value] = raw.split('!:')
    return { raw, name, value, op: '≠' }
  }
  const [name, value] = raw.split(':')
  return { raw, name, value, op: '=' }
}

function matcherKey(name, value) {
  return `${name}:${value}`
}

function lastNonNull(rows, key) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i][key]
    if (v != null && !Number.isNaN(v)) return v
  }
  return null
}

function extremes(rows, keys) {
  let min = null
  let max = null
  for (const row of rows) {
    for (const key of keys) {
      const v = row[key]
      if (v == null || Number.isNaN(v)) continue
      if (min == null || v < min) min = v
      if (max == null || v > max) max = v
    }
  }
  return { min, max }
}

function MetricCatalogue({
  metrics, filtered, selected, search, onSearch, onSelect, loading, error, empty,
}) {
  const parentRef = useRef(null)
  const searching = search.trim().length > 0

  // Collapsed namespaces. Search forces groups open so hits stay visible.
  const [collapsed, setCollapsed] = useState(() => new Set())

  const groups = useMemo(() => {
    const map = new Map()
    for (const m of filtered) {
      const ns = namespaceOf(m.name)
      if (!map.has(ns)) map.set(ns, [])
      map.get(ns).push(m)
    }
    return Array.from(map, ([name, items]) => ({ name, items }))
  }, [filtered])

  const groupNames = useMemo(() => groups.map((g) => g.name), [groups])

  // Deep links / selection must not land inside a collapsed group.
  useEffect(() => {
    if (!selected) return
    const ns = namespaceOf(selected)
    setCollapsed((prev) => {
      if (!prev.has(ns)) return prev
      const next = new Set(prev)
      next.delete(ns)
      return next
    })
  }, [selected])

  const rows = useMemo(() => {
    const out = []
    for (const g of groups) {
      const open = searching || !collapsed.has(g.name)
      out.push({ kind: 'group', name: g.name, count: g.items.length, open })
      if (!open) continue
      for (const m of g.items) {
        out.push({ kind: 'metric', metric: m, ns: g.name })
      }
    }
    return out
  }, [groups, collapsed, searching])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (rows[i]?.kind === 'group' ? GROUP_H : ROW_H),
    getItemKey: (i) => {
      const r = rows[i]
      if (!r) return i
      return r.kind === 'group' ? `g:${r.name}` : r.metric.name
    },
    overscan: 20,
  })

  useEffect(() => {
    if (!selected || !rows.length) return
    const idx = rows.findIndex((r) => r.kind === 'metric' && r.metric.name === selected)
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'center' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, rows])

  const toggleGroup = (name) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const expandAll = () => setCollapsed(new Set())
  const collapseAll = () => setCollapsed(new Set(groupNames))
  const allExpanded = !searching && collapsed.size === 0
  const allCollapsed = !searching && groupNames.length > 0 && collapsed.size >= groupNames.length

  return (
    <Panel
      className="opa-mx-catalogue"
      title="Catalogue"
      icon={<FiHash />}
      actions={(
        <div className="opa-mx-cat-actions">
          <span className="oui-text-muted oui-num">{fmtNum(filtered.length)}/{fmtNum(metrics.length)}</span>
          {groupNames.length > 1 && !searching && (
            <>
              <button
                type="button"
                className="opa-btn ghost opa-btn-compact"
                onClick={expandAll}
                disabled={allExpanded}
                title="Expand all groups"
              >
                Expand
              </button>
              <button
                type="button"
                className="opa-btn ghost opa-btn-compact"
                onClick={collapseAll}
                disabled={allCollapsed}
                title="Collapse all groups"
              >
                Collapse
              </button>
            </>
          )}
        </div>
      )}
      loading={loading}
      error={error}
      empty={empty}
      emptyText="No metrics reported yet — run opa-collector on a host, or send a metric message over the agent transport."
      expandable={false}
    >
      <div className="opa-mx-search">
        <FiSearch size={13} aria-hidden />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Filter by name…"
          aria-label="Filter metrics"
          autoComplete="off"
          spellCheck={false}
        />
        {search && (
          <button type="button" className="opa-mx-search-clear" onClick={() => onSearch('')} aria-label="Clear search">
            <FiX size={12} />
          </button>
        )}
      </div>

      {groupNames.length > 0 && (
        <div className="opa-mx-group-count oui-text-muted">
          {fmtNum(groupNames.length)} group{groupNames.length === 1 ? '' : 's'}
          {searching ? ' · matching' : ''}
        </div>
      )}

      <div className="opa-mx-list" ref={parentRef}>
        {filtered.length === 0 && metrics.length > 0 ? (
          <div className="opa-mx-list-empty">Nothing matches “{search}”.</div>
        ) : (
          <div
            className="opa-mx-list-inner"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((virt) => {
              const row = rows[virt.index]
              if (row.kind === 'group') {
                return (
                  <div
                    key={`g:${row.name}`}
                    className="opa-mx-row"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: virt.size,
                      transform: `translateY(${virt.start}px)`,
                    }}
                  >
                    <button
                      type="button"
                      className={`opa-mx-group-head${row.open ? ' open' : ''}`}
                      onClick={() => !searching && toggleGroup(row.name)}
                      aria-expanded={row.open}
                      disabled={searching}
                      title={searching ? 'Groups stay open while filtering' : (row.open ? 'Collapse' : 'Expand')}
                    >
                      {row.open ? <FiChevronDown size={13} /> : <FiChevronRight size={13} />}
                      <span className="opa-mx-group-name">{row.name}</span>
                      <span className="opa-mx-group-n">{fmtNum(row.count)}</span>
                    </button>
                  </div>
                )
              }

              const m = row.metric
              const label = shortName(m.name, row.ns)
              return (
                <div
                  key={m.name}
                  className="opa-mx-row"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: virt.size,
                    transform: `translateY(${virt.start}px)`,
                  }}
                >
                  <button
                    type="button"
                    className={`opa-mx-item${m.name === selected ? ' active' : ''}`}
                    onClick={() => onSelect(m.name)}
                    title={`${m.name} · ${m.series_count} series · ${m.type}${unitLabel(m.unit, m.name) ? ` · ${unitLabel(m.unit, m.name)}` : ''}`}
                  >
                    <span className="opa-mx-name">{label}</span>
                    <span className="opa-mx-item-meta">
                      {m.type && <span className="opa-mx-type">{m.type}</span>}
                      <span className="opa-mx-count">{m.series_count}</span>
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Panel>
  )
}

function DimensionPanel({
  labels, loading, metric, groupBy, matchers, onGroupBy, onToggleFilter,
}) {
  const [open, setOpen] = useState('')
  const [valueQuery, setValueQuery] = useState('')
  const values = useApi(
    '/api/metrics/label-values',
    { metric, label: open },
    { noRange: true, skip: !metric || !open },
  )
  const valueList = values.data?.values || []
  const filteredValues = useMemo(() => {
    const q = valueQuery.trim().toLowerCase()
    if (!q) return valueList
    return valueList.filter((v) => v.toLowerCase().includes(q))
  }, [valueList, valueQuery])

  const activeByName = useMemo(() => {
    const map = new Map()
    matchers.forEach((raw) => {
      const m = parseMatcher(raw)
      if (!m.name) return
      if (!map.has(m.name)) map.set(m.name, new Set())
      map.get(m.name).add(m.raw)
    })
    return map
  }, [matchers])

  useEffect(() => {
    setValueQuery('')
  }, [open])

  if (!metric) return null

  return (
    <Panel
      title="Dimensions"
      icon={<FiLayers />}
      loading={loading}
      empty={!loading && labels.length === 0}
      emptyText="This metric has no label dimensions yet."
      actions={<span className="oui-text-muted">filter · group</span>}
    >
      <div className="opa-mx-dims">
        {labels.map((l) => {
          const isOpen = open === l.name
          const isGroup = groupBy === l.name
          const high = l.value_count > HIGH_CARDINALITY
          const activeCount = activeByName.get(l.name)?.size || 0
          return (
            <div key={l.name} className={`opa-mx-dim${isOpen ? ' open' : ''}${isGroup ? ' grouped' : ''}`}>
              <div className="opa-mx-dim-head">
                <button
                  type="button"
                  className="opa-mx-dim-toggle"
                  onClick={() => setOpen(isOpen ? '' : l.name)}
                  aria-expanded={isOpen}
                >
                  {isOpen ? <FiChevronDown size={13} /> : <FiChevronRight size={13} />}
                  <span className="opa-mx-dim-name">{l.name}</span>
                  <span className={`opa-mx-dim-n${high ? ' warn' : ''}`} title={high ? 'High cardinality' : undefined}>
                    {fmtNum(l.value_count)}
                  </span>
                  {activeCount > 0 && <Badge>{activeCount} filter{activeCount === 1 ? '' : 's'}</Badge>}
                </button>
                <button
                  type="button"
                  className={`opa-btn opa-btn-compact${isGroup ? ' primary' : ' ghost'}`}
                  onClick={() => onGroupBy(isGroup ? '' : l.name)}
                  title={high ? `${l.value_count} distinct values — chart may be dense` : `Group series by ${l.name}`}
                >
                  {isGroup ? 'Grouped' : 'Group'}
                </button>
              </div>

              {isOpen && (
                <div className="opa-mx-dim-body">
                  {high && (
                    <div className="opa-mx-dim-warn">
                      {fmtNum(l.value_count)} values — filtering before grouping keeps the chart readable.
                    </div>
                  )}
                  {(valueList.length > 8 || valueQuery) && (
                    <div className="opa-mx-search opa-mx-search-sm">
                      <FiSearch size={12} aria-hidden />
                      <input
                        value={valueQuery}
                        onChange={(e) => setValueQuery(e.target.value)}
                        placeholder="Filter values…"
                        aria-label={`Filter ${l.name} values`}
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>
                  )}
                  {values.loading ? (
                    <div className="oui-text-muted opa-mx-dim-hint">Loading values…</div>
                  ) : values.error ? (
                    <div className="opa-mx-dim-warn">{String(values.error)}</div>
                  ) : filteredValues.length === 0 ? (
                    <div className="oui-text-muted opa-mx-dim-hint">
                      {valueList.length === 0 ? 'No values found.' : `Nothing matches “${valueQuery}”.`}
                    </div>
                  ) : (
                    <div className="opa-mx-values">
                      {filteredValues.slice(0, 200).map((v) => {
                        const key = matcherKey(l.name, v)
                        const on = matchers.includes(key)
                        return (
                          <button
                            key={v}
                            type="button"
                            className={`opa-mx-value${on ? ' active' : ''}`}
                            onClick={() => onToggleFilter(key)}
                            title={on ? 'Remove filter' : `Filter ${l.name}=${v}`}
                          >
                            <span>{v}</span>
                            {on && <FiX size={11} />}
                          </button>
                        )
                      })}
                      {filteredValues.length > 200 && (
                        <div className="oui-text-muted opa-mx-dim-hint">
                          Showing 200 of {fmtNum(filteredValues.length)} — refine the search.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

export default function MetricsExplorer() {
  const [params, setParams] = useSearchParams()

  const metric = params.get('metric') || ''
  const agg = params.get('agg') || 'avg'
  const groupBy = params.get('group_by') || ''
  const matchers = params.getAll('label')
  const [search, setSearch] = useState('')

  const update = (mutate) => {
    const next = new URLSearchParams(params)
    mutate(next)
    setParams(next, { replace: true })
  }

  const names = useApi('/api/metrics/names', {}, { noRange: true })
  const allMetrics = names.data?.metrics || []
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allMetrics
    return allMetrics.filter((m) => m.name.toLowerCase().includes(q))
  }, [allMetrics, search])

  const selected = allMetrics.find((m) => m.name === metric)
  const fmtValue = unitFormatter(selected?.unit, selected?.name)
  const fmtAxis = selected?.unit === 'By' ? (v) => fmtBytes(v).replace(/\s+/g, '')
    : selected?.unit === '1' && isRatioMetric(selected?.name) ? (v) => fmtPct(v * 100, 0)
      : fmtMetric

  const labels = useApi('/api/metrics/labels', { metric }, { noRange: true, skip: !metric })
  const labelList = labels.data?.labels || []

  const queryParams = useMemo(() => {
    const p = { metric, agg }
    if (groupBy) p.group_by = groupBy
    if (matchers.length) p.label = matchers
    return p
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, agg, groupBy, matchers.join('|')])

  const range = useApi('/api/metrics/query-range', queryParams, { skip: !metric })
  const series = range.data?.series || []
  const resolution = range.data?.resolution

  const { chartData, chartSeries } = useMemo(() => {
    if (!series.length) return { chartData: [], chartSeries: [] }
    const byTs = new Map()
    const defs = []
    series.forEach((s, i) => {
      const key = `s${i}`
      defs.push({
        key,
        name: s.name || metric || 'value',
        color: SERIES[i % SERIES.length],
        type: 'line',
      })
      ;(s.points || []).forEach((pt) => {
        const raw = pt.ts
        let timeMs = 0
        if (typeof raw === 'number') timeMs = raw
        else if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
          timeMs = Date.parse(raw.replace(' ', 'T') + (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? '' : 'Z'))
        } else if (typeof raw === 'string') {
          timeMs = Date.parse(raw)
        }
        const row = byTs.get(pt.ts) || { time: pt.ts, timeMs: Number.isFinite(timeMs) ? timeMs : 0 }
        row[key] = pt.value
        byTs.set(pt.ts, row)
      })
    })
    const rows = Array.from(byTs.values()).sort((a, b) => (a.time < b.time ? -1 : 1))
    return { chartData: rows, chartSeries: defs }
  }, [series, metric])

  const stats = useMemo(() => {
    if (!chartData.length || !chartSeries.length) return null
    const keys = chartSeries.map((s) => s.key)
    const { min, max } = extremes(chartData, keys)
    const latest = chartSeries.length === 1
      ? lastNonNull(chartData, keys[0])
      : null
    return { min, max, latest, series: chartSeries.length, points: chartData.length }
  }, [chartData, chartSeries])

  const hasQueryState = !!(metric || matchers.length || groupBy || (agg && agg !== 'avg'))

  const removeMatcher = (m) => update((n) => {
    const keep = n.getAll('label').filter((x) => x !== m)
    n.delete('label')
    keep.forEach((k) => n.append('label', k))
  })

  const toggleFilter = (key) => update((n) => {
    const keep = n.getAll('label')
    n.delete('label')
    if (keep.includes(key)) {
      keep.filter((x) => x !== key).forEach((k) => n.append('label', k))
    } else {
      keep.forEach((k) => n.append('label', k))
      n.append('label', key)
    }
  })

  const selectMetric = (name) => update((n) => {
    n.set('metric', name)
    n.delete('label')
    n.delete('group_by')
  })

  const clearAll = () => setParams(new URLSearchParams(), { replace: true })

  const setGroupBy = (name) => update((n) => {
    if (name) n.set('group_by', name)
    else n.delete('group_by')
  })

  const unit = unitLabel(selected?.unit, selected?.name)
  const suggestions = allMetrics.slice(0, 6)

  return (
    <div className="oui-stack opa-metrics-page">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Metrics Explorer</h1>
          <div className="opa-page-sub">
            {metric
              ? <>Charting <span className="oui-mono">{metric}</span>{matchers.length ? ` · ${matchers.length} filter${matchers.length === 1 ? '' : 's'}` : ''}{groupBy ? ` · grouped by ${groupBy}` : ''}</>
              : <>Browse any collector metric · filter by label · group by dimension{allMetrics.length ? ` · ${fmtNum(allMetrics.length)} available` : ''}</>}
          </div>
        </div>
        {hasQueryState && (
          <div className="oui-row">
            <button type="button" className="opa-btn ghost" onClick={clearAll} title="Clear metric, filters, and grouping">
              <FiX size={13} /> Clear
            </button>
          </div>
        )}
      </div>

      <div className="opa-metrics-explorer">
        <MetricCatalogue
          metrics={allMetrics}
          filtered={filtered}
          selected={metric}
          search={search}
          onSearch={setSearch}
          onSelect={selectMetric}
          loading={names.loading}
          error={names.error ? String(names.error) : null}
          empty={!names.loading && !names.error && allMetrics.length === 0}
        />

        <div className="opa-mx-main">
          {!metric ? (
            <Panel title="Get started" icon={<FiBarChart2 />} expandable={false}>
              <EmptyState
                icon={<FiActivity />}
                title="Pick a metric to chart it"
                hint="Search the catalogue, then filter by any label or group by a dimension. Views are shareable via the URL."
              />
              {suggestions.length > 0 && (
                <div className="opa-mx-suggest">
                  <div className="opa-mx-suggest-label">Try one of these</div>
                  <div className="opa-mx-suggest-list">
                    {suggestions.map((m) => (
                      <button
                        key={m.name}
                        type="button"
                        className="opa-mx-suggest-item"
                        onClick={() => selectMetric(m.name)}
                      >
                        <span className="oui-mono">{m.name}</span>
                        <span className="oui-text-muted">{m.type} · {m.series_count} series</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Panel>
          ) : (
            <>
              {stats && !range.loading && (
                <div className="opa-mx-kpis">
                  <KpiTile
                    label={stats.latest != null ? 'Latest' : 'Series'}
                    icon={stats.latest != null ? <FiActivity size={12} /> : <FiLayers size={12} />}
                    value={stats.latest != null ? fmtValue(stats.latest) : fmtNum(stats.series)}
                    spark={stats.latest != null && chartSeries.length === 1
                      ? chartData.map((r) => r[chartSeries[0].key]).filter((v) => v != null)
                      : undefined}
                    sparkColor="var(--accent)"
                  />
                  <KpiTile
                    label="Min"
                    icon={<FiTrendingDown size={12} />}
                    value={fmtValue(stats.min)}
                  />
                  <KpiTile
                    label="Max"
                    icon={<FiTrendingUp size={12} />}
                    value={fmtValue(stats.max)}
                  />
                  <KpiTile
                    label="Points"
                    icon={<FiHash size={12} />}
                    value={fmtNum(stats.points)}
                    footer={stats.series > 1 ? <span className="oui-text-muted">{stats.series} series</span> : undefined}
                  />
                </div>
              )}

              <Panel
                title={metric}
                icon={<FiBarChart2 />}
                actions={(
                  <div className="opa-mx-actions">
                    <SegmentedControl
                      options={AGG_OPTIONS}
                      value={agg}
                      onChange={(v) => update((n) => n.set('agg', v))}
                    />
                  </div>
                )}
                loading={range.loading}
                error={range.error ? String(range.error) : null}
              >
                <div className="opa-mx-toolbar">
                  <div className="opa-mx-meta-row">
                    {selected && (
                      <>
                        <Badge title="Metric type">{selected.type}</Badge>
                        {unit && <Badge title="Unit">{unit}</Badge>}
                        <span className="oui-text-muted oui-num">{fmtNum(selected.series_count)} series in catalogue</span>
                      </>
                    )}
                  </div>

                  <div className="opa-mx-group">
                    <label className="opa-mx-group-label" htmlFor="opa-mx-groupby">
                      <FiLayers size={12} /> Group by
                    </label>
                    <select
                      id="opa-mx-groupby"
                      className="opa-select oui-mono"
                      value={groupBy}
                      onChange={(e) => setGroupBy(e.target.value)}
                      disabled={!labelList.length}
                    >
                      <option value="">None (single series)</option>
                      {labelList.map((l) => (
                        <option key={l.name} value={l.name}>
                          {l.name} ({l.value_count}{l.value_count > HIGH_CARDINALITY ? ' · high' : ''})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {(matchers.length > 0 || labelList.length > 0) && (
                  <div className="opa-mx-filters">
                    <span className="opa-mx-filters-label"><FiFilter size={12} /> Filters</span>
                    <div className="opa-mx-chips">
                      {matchers.length === 0 && (
                        <span className="oui-text-muted opa-mx-filters-hint">
                          Expand a dimension below and click a value to filter
                        </span>
                      )}
                      {matchers.map((raw) => {
                        const m = parseMatcher(raw)
                        return (
                          <button
                            key={raw}
                            type="button"
                            className="opa-mx-chip active"
                            onClick={() => removeMatcher(raw)}
                            title="Remove this filter"
                          >
                            <span className="opa-mx-chip-k">{m.name}</span>
                            <span className="opa-mx-chip-op">{m.op}</span>
                            <span className="opa-mx-chip-v">{m.value}</span>
                            <FiX size={11} />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {groupBy && labelList.find((l) => l.name === groupBy)?.value_count > HIGH_CARDINALITY && (
                  <div className="opa-mx-banner">
                    Grouping by <span className="oui-mono">{groupBy}</span> has{' '}
                    {fmtNum(labelList.find((l) => l.name === groupBy).value_count)} values.
                    Filter first if the chart gets noisy.
                  </div>
                )}

                {!range.loading && !range.error && chartData.length === 0 && (
                  <EmptyState
                    title="No data in this range"
                    hint={range.data?.note || 'Try a wider time range, or check the metric is still being reported.'}
                  />
                )}

                {chartData.length > 0 && (
                  <>
                    <TimeSeriesChart
                      brushZoom
                      data={chartData}
                      series={chartSeries}
                      height={320}
                      valueFmt={fmtValue}
                      yFmt={fmtAxis}
                      legend={chartSeries.length > 1 && chartSeries.length <= MAX_LEGEND_SERIES}
                    />
                    {resolution && (
                      <div className="opa-mx-res">
                        <StatusPill tone={resolution.downsampled ? 'warn' : 'ok'}>
                          {resolution.downsampled ? `${resolution.tier} rollup` : 'raw'}
                        </StatusPill>
                        <span>{resolution.step_secs}s per point</span>
                        {chartSeries.length > 1 && (
                          <span>· {fmtNum(chartSeries.length)} series</span>
                        )}
                        {chartSeries.length > MAX_LEGEND_SERIES && (
                          <span>· legend hidden</span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </Panel>

              <DimensionPanel
                labels={labelList}
                loading={labels.loading}
                metric={metric}
                groupBy={groupBy}
                matchers={matchers}
                onGroupBy={setGroupBy}
                onToggleFilter={toggleFilter}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
