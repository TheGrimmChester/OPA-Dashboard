import React, { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FiX, FiSearch } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import {
  Panel, DataTable, TimeSeriesChart, SegmentedControl, StatusPill, EmptyState,
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

// The reductions the backend supports. Percentiles are served from the stored
// t-digest, so they stay correct at every downsample tier rather than only on raw.
const AGG_OPTIONS = [
  { value: 'avg', label: 'avg' },
  { value: 'max', label: 'max' },
  { value: 'min', label: 'min' },
  { value: 'sum', label: 'sum' },
  { value: 'last', label: 'last' },
  { value: 'p95', label: 'p95' },
  { value: 'p99', label: 'p99' },
]

// Significant-figure formatting for arbitrary magnitudes.
//
// fmtNum rounds anything under 1000 to a whole number, which is right for counts
// and wrong for metrics: a 0.37 CPU ratio or a 2.5ms latency would both render as
// "0". Metric values span many orders of magnitude, so precision has to follow
// magnitude — while still delegating to fmtNum's k/M/B abbreviation once the value
// is large enough for decimals to be noise.
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

// Unit "1" is UCUM for dimensionless — both 0–1 ratios (utilization) and
// unbounded gauges (load average) use it. Only names that are actually ratios
// should render as percentages; the rest stay plain numbers.
function isRatioMetric(name) {
  return typeof name === 'string' && /\.(utilization|hit_rate)$/.test(name)
}

// Format values by the metric's declared unit, so a byte counter reads as "2.1 GiB"
// rather than 2254857830. Units come from the collector and follow the same
// UCUM-style convention as the metric names.
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
      // A ratio. Shown as a percentage, because that is how utilization is read.
      // fmtPct expects an already-scaled percentage, hence the ×100.
      return (v) => (v == null ? '—' : fmtPct(v * 100, 1))
    default:
      return fmtMetric
  }
}

// Units arrive in the UCUM-style form the metric conventions use, which is right
// on the wire and unreadable on screen: "By" means bytes, neither of which is
// obvious. Curly-brace forms like "{packet}" are annotations, so the braces are
// just noise. Unit "1" only labels as "ratio" when the metric name is a ratio;
// otherwise it is omitted so load average is not mislabeled.
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

function unitSuffix(unit, name) {
  const label = unitLabel(unit, name)
  return label ? ` · ${label}` : ''
}

// Beyond this many lines a legend is noise rather than navigation.
const MAX_LEGEND_SERIES = 12

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

  // The catalogue is not a time series, so noRange keeps it from refetching every
  // time the global range changes.
  const names = useApi('/api/metrics/names', {}, { noRange: true })
  const allMetrics = names.data?.metrics || []
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allMetrics
    return allMetrics.filter((m) => m.name.toLowerCase().includes(q))
  }, [allMetrics, search])

  const selected = allMetrics.find((m) => m.name === metric)
  // Tooltips get the full unit-aware format; the y-axis gets a compact one. The
  // axis is only ~44px wide, so a suffixed tick like "60.0k s" wraps onto two
  // lines and reads as two separate numbers. The unit is stated in the panel
  // header, so repeating it per tick buys nothing.
  const fmtValue = unitFormatter(selected?.unit, selected?.name)
  // Recharts wraps a tick on whitespace when it does not fit the axis, and the
  // shared chart fixes the y-axis at 44px — so "620 MB" renders as "620" above
  // "MB", which reads as two unrelated numbers. Axis ticks therefore drop the
  // space; the tooltip keeps the readable spaced form.
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

  // Recharts wants one row per timestamp with a column per series, so the
  // per-series point lists are pivoted into a single table.
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

  const removeMatcher = (m) => update((n) => {
    const keep = n.getAll('label').filter((x) => x !== m)
    n.delete('label')
    keep.forEach((k) => n.append('label', k))
  })

  const selectMetric = (name) => update((n) => {
    n.set('metric', name)
    // Filters and grouping belong to the previous metric; against a new one they
    // would silently match nothing.
    n.delete('label')
    n.delete('group_by')
  })

  return (
    <div className="opa-metrics-explorer">
      <Panel
        title="Metrics"
        actions={<span className="opa-muted">{filtered.length}/{allMetrics.length}</span>}
        loading={names.loading}
        error={names.error ? String(names.error) : null}
        empty={!names.loading && !names.error && allMetrics.length === 0}
        emptyText="No metrics reported yet — run opa-collector on a host, or send a metric message over the agent transport."
      >
        <div className="opa-mx-search">
          <FiSearch size={13} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter metrics…"
            aria-label="Filter metrics"
          />
        </div>

        <div className="opa-mx-list">
          {filtered.map((m) => (
            <button
              key={m.name}
              className={`opa-mx-item${m.name === metric ? ' active' : ''}`}
              onClick={() => selectMetric(m.name)}
              title={`${m.name} · ${m.series_count} series · ${m.type}${unitSuffix(m.unit, m.name)}`}
            >
              <span className="opa-mx-name">{m.name}</span>
              <span className="opa-mx-count">{m.series_count}</span>
            </button>
          ))}
          {filtered.length === 0 && allMetrics.length > 0 && (
            <div className="opa-muted" style={{ padding: '8px 4px', fontSize: 12 }}>
              Nothing matches “{search}”.
            </div>
          )}
        </div>
      </Panel>

      <div className="opa-mx-main">
        {!metric ? (
          <Panel title="Metrics Explorer">
            <EmptyState
              title="Pick a metric to chart it"
              hint="Then filter by label, or group by a dimension to split it into series."
            />
          </Panel>
        ) : (
          <Panel
            title={metric}
            // Only the control goes in the header. Putting the metric metadata
            // there too overflowed the header row at narrow widths and clipped the
            // right-hand aggregation buttons; the metadata reads fine in the body.
            actions={
              <SegmentedControl
                options={AGG_OPTIONS}
                value={agg}
                onChange={(v) => update((n) => n.set('agg', v))}
              />
            }
            loading={range.loading}
            error={range.error ? String(range.error) : null}
          >
            {selected && (
              <div className="opa-mx-meta">
                {selected.type}
                {unitSuffix(selected.unit, selected.name)}
                {` · ${selected.series_count} series`}
              </div>
            )}

            {matchers.length > 0 && (
              <div className="opa-mx-chips">
                {matchers.map((m) => (
                  <button key={m} className="opa-mx-chip active" onClick={() => removeMatcher(m)} title="Remove this filter">
                    {m}<FiX size={11} />
                  </button>
                ))}
              </div>
            )}

            {labelList.length > 0 && (
              <div className="opa-mx-chips">
                <span className="opa-muted" style={{ fontSize: 11 }}>Group by</span>
                <button className={`opa-mx-chip${!groupBy ? ' active' : ''}`} onClick={() => update((n) => n.delete('group_by'))}>
                  none
                </button>
                {labelList.map((l) => (
                  <button
                    key={l.name}
                    className={`opa-mx-chip${groupBy === l.name ? ' active' : ''}`}
                    onClick={() => update((n) => n.set('group_by', l.name))}
                    // The value count is the warning: grouping by a 400-value
                    // dimension draws 400 lines.
                    title={`${l.value_count} distinct values`}
                  >
                    {l.name}<span className="opa-mx-chip-n">{l.value_count}</span>
                  </button>
                ))}
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
                  height={280}
                  valueFmt={fmtValue}
                  yFmt={fmtAxis}
                  legend={chartSeries.length > 1 && chartSeries.length <= MAX_LEGEND_SERIES}
                />
                {resolution && (
                  // Say what resolution is on screen. A 90-day chart drawn from
                  // daily rollups looks identical to a live one, and conflating the
                  // two is how a flat line gets misread.
                  <div className="opa-mx-res">
                    <StatusPill tone={resolution.downsampled ? 'warn' : 'ok'}>
                      {resolution.downsampled ? `${resolution.tier} rollup` : 'raw'}
                    </StatusPill>
                    <span>{resolution.step_secs}s per point</span>
                    {chartSeries.length > MAX_LEGEND_SERIES && (
                      <span>· legend hidden ({chartSeries.length} series)</span>
                    )}
                  </div>
                )}
              </>
            )}
          </Panel>
        )}

        {metric && labelList.length > 0 && (
          <Panel title="Dimensions" actions={<span className="opa-muted">click to group</span>}>
            <DataTable
              columns={[
                { key: 'name', header: 'Label', mono: true },
                { key: 'value_count', header: 'Distinct values', num: true, sortable: true },
              ]}
              rows={labelList}
              rowKey={(r) => r.name}
              initialSort={{ key: 'value_count', dir: 'desc' }}
              onRowClick={(r) => update((n) => n.set('group_by', r.name))}
            />
          </Panel>
        )}
      </div>
    </div>
  )
}
