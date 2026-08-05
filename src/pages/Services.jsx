import React from 'react'
import { useNavigate } from 'react-router-dom'
import { FiAlertCircle, FiClock, FiRefreshCw } from 'react-icons/fi'
import {
  Badge, Button, Card, EmptyState, Grid, Meter, PageHeader, Skeleton, Stack,
  StatRow, StatTile, Table,
} from '@open-family/ui'
import { useApi } from '../hooks/useApi'
import { useTableSort } from '../hooks/useTableSort'
import { TimeSeriesChart } from '../components/ui'
import { fmtMs, fmtNum, fmtPct, fmtBytes, latencyStatus, errorRateStatus, statusColor } from '../theme/format'

// The old HealthDot was a bare colour dot with a `title` — colour alone, and a
// tooltip no keyboard or screen-reader user reached. errorRateStatus() already
// classifies the rate; this pairs the classification with a word.
const HEALTH = {
  ok: { tone: 'good', label: 'Healthy' },
  warn: { tone: 'warning', label: 'Degraded' },
  error: { tone: 'critical', label: 'Failing' },
  neutral: { tone: 'neutral', label: 'No data' },
}

/**
 * KpiTile derived its own arrow from `current`/`previous`, and `invert` flipped
 * both the arrow and the colour. StatTile keeps them apart on purpose: a rise in
 * latency is still a rise, it is just not welcome. `riseIsGood` is the sentiment.
 */
function windowDelta(current, previous, riseIsGood) {
  if (current == null || previous == null || !previous) return undefined
  const pct = ((current - previous) / Math.abs(previous)) * 100
  if (!Number.isFinite(pct)) return undefined
  if (Math.abs(pct) < 0.05) return { value: 'no change', direction: 'flat' }
  const up = pct > 0
  return { value: fmtPct(Math.abs(pct)), direction: up ? 'up' : 'down', good: up === riseIsGood }
}

/** Service inventory + golden signals (canonical home; formerly also labeled Overview). */
export default function Services() {
  const navigate = useNavigate()
  // (No /api/stats call here: its result was never read, so it was a wasted
  // request on every load — the KPIs come from /api/services.)
  const services = useApi('/api/services')
  const perf = useApi('/api/metrics/performance')

  const g = services.data?.global_totals || {}
  const svc = services.data?.services || []
  const metrics = (perf.data?.metrics || []).map((m) => {
    const raw = m.time || ''
    const timeMs = /^\d{4}-\d{2}-\d{2}/.test(raw)
      ? Date.parse(raw.replace(' ', 'T') + (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? '' : 'Z'))
      : 0
    return {
      time: raw.slice(5, 16),
      timeMs: Number.isFinite(timeMs) ? timeMs : 0,
      throughput: m.throughput, error_rate: m.error_rate,
      p50: m.p50_duration, p95: m.p95_duration, p99: m.p99_duration,
    }
  })

  const spark = (k) => metrics.map((m) => m[k])
  const firstLast = (k) => { const a = metrics.filter((m) => m[k] != null); return a.length ? [a[0][k], a[a.length - 1][k]] : [null, null] }
  const [tpPrev, tpCur] = firstLast('throughput')
  const [p95Prev, p95Cur] = firstLast('p95')
  const [erPrev, erCur] = firstLast('error_rate')

  const errRate = g.total_spans ? (g.error_count / g.total_spans) * 100 : 0
  const maxTp = Math.max(1, ...svc.map((s) => s.total_traces || 0))

  const svcColumns = [
    {
      key: 'service', header: 'Service', sortValue: (r) => r.service,
      render: (r) => {
        const health = HEALTH[errorRateStatus(r.error_rate)] || HEALTH.neutral
        return (
          <span className="oui-row">
            <Badge tone={health.tone} dot>{health.label}</Badge>
            <span className="oui-mono">{r.service}</span>
            {r.language && (
              <Badge>{r.language}{r.language_version ? ` ${r.language_version}` : ''}</Badge>
            )}
          </span>
        )
      },
    },
    {
      key: 'total_traces', header: 'Throughput', numeric: true, sortValue: (r) => r.total_traces || 0,
      render: (r) => (
        <>
          <span className="oui-num">{fmtNum(r.total_traces)}</span>
          <Meter
            value={((r.total_traces || 0) / maxTp) * 100}
            label={`Throughput for ${r.service}, ${fmtNum(r.total_traces)} traces`}
          />
        </>
      ),
    },
    { key: 'avg_duration', header: 'Avg', numeric: true, render: (r) => fmtMs(r.avg_duration) },
    { key: 'p95_duration', header: 'p95', numeric: true, render: (r) => <span style={{ color: statusColor(latencyStatus(r.p95_duration)) }}>{fmtMs(r.p95_duration)}</span> },
    { key: 'error_rate', header: 'Error %', numeric: true, render: (r) => <span style={{ color: statusColor(errorRateStatus(r.error_rate)) }}>{fmtPct(r.error_rate)}</span> },
    { key: 'sql_query_count', header: 'SQL', numeric: true, render: (r) => fmtNum(r.sql_query_count) },
    { key: 'total_cpu_ms', header: 'CPU', numeric: true, render: (r) => fmtMs(r.total_cpu_ms) },
    {
      key: 'io', header: 'I/O (out / in)', numeric: true,
      sortValue: (r) => (r.total_bytes_sent || 0) + (r.total_bytes_received || 0),
      render: (r) => (
        <span className="oui-mono">
          <span style={{ color: 'var(--chart-1)' }}>↑{fmtBytes(r.total_bytes_sent)}</span>{' '}
          <span className="oui-text-muted">/</span>{' '}
          <span style={{ color: 'var(--chart-2)' }}>↓{fmtBytes(r.total_bytes_received)}</span>
        </span>
      ),
    },
  ]

  const { rows: sortedServices, columns: sortableColumns, onSort } =
    useTableSort(svc, svcColumns, { key: 'total_traces', dir: 'desc' })

  // The two charts read the same fetch, so their three states are the same
  // decision made twice. Keeping it in one place stops one card claiming "no
  // data" while the other renders a skeleton.
  const chartBody = (chart, name) => {
    if (perf.loading) return <Skeleton height={230} />
    if (perf.error) {
      return (
        <EmptyState
          inline
          icon={<FiAlertCircle />}
          title={`${name} failed to load`}
          description={String(perf.error || 'The request did not complete.')}
          actions={<Button icon={<FiRefreshCw />} onClick={perf.reload}>Retry</Button>}
        />
      )
    }
    if (metrics.length === 0) {
      return (
        <EmptyState
          inline
          icon={<FiClock />}
          title="No samples in this time range"
          description="The range, not the data, is empty. Widening it usually resolves this."
        />
      )
    }
    return chart
  }

  return (
    <Stack gap="sections">
      <PageHeader
        title="Services"
        description="Golden signals for every instrumented service reporting into this project."
        meta={[{ label: 'Services', value: <span className="oui-num">{svc.length}</span> }]}
      />

      {/* Golden signal KPIs */}
      <StatRow>
        <StatTile
          hero
          label="Throughput"
          value={`${fmtNum(g.total_traces || 0)} traces`}
          spark={spark('throughput')}
          delta={windowDelta(tpCur, tpPrev, true)}
          deltaLabel="across the selected window"
        />
        <StatTile label="Avg response" value={fmtMs(g.avg_duration)} />
        <StatTile
          label="p95 response"
          value={fmtMs(p95Cur ?? g.avg_duration)}
          spark={spark('p95')}
          delta={windowDelta(p95Cur, p95Prev, false)}
          deltaLabel="across the selected window"
        />
        <StatTile
          label="Error rate"
          value={fmtPct(errRate)}
          spark={spark('error_rate')}
          delta={windowDelta(erCur, erPrev, false)}
          deltaLabel="across the selected window"
        />
        <StatTile
          label="Spans"
          value={fmtNum(g.total_spans || 0)}
          foot={(
            <span className="oui-text-muted">
              {fmtNum(g.total_sql_queries)} SQL · {fmtNum(g.total_http_requests)} HTTP
            </span>
          )}
        />
      </StatRow>

      {/* Charts */}
      <Grid columns={2}>
        <Card title="Throughput and errors" description="Traces recorded per interval, with the error rate over the same window.">
          {chartBody(
            <TimeSeriesChart brushZoom data={metrics} series={[
              { key: 'throughput', name: 'Throughput', color: 'var(--chart-1)', type: 'bar' },
              { key: 'error_rate', name: 'Error %', color: 'var(--critical-text)', type: 'line' },
            ]} valueFmt={(v) => fmtNum(v)} height={230} />,
            'Throughput and errors',
          )}
        </Card>
        <Card title="Response time percentiles" description="Median, p95 and p99 response time across every service.">
          {chartBody(
            <TimeSeriesChart brushZoom data={metrics} series={[
              { key: 'p50', name: 'p50', color: 'var(--chart-1)', type: 'line' },
              { key: 'p95', name: 'p95', color: 'var(--chart-2)', type: 'line' },
              { key: 'p99', name: 'p99', color: 'var(--chart-3)', type: 'line' },
            ]} valueFmt={fmtMs} yFmt={fmtMs} height={230} />,
            'Response time percentiles',
          )}
        </Card>
      </Grid>

      {/* Services table */}
      <Card flush title="Services" description="Every service reporting into this project. Select a row to drill into it.">
        <Table
          aria-label="Services"
          state={services.loading ? 'loading' : services.error ? 'error' : sortedServices.length ? 'ready' : 'empty'}
          columns={sortableColumns}
          rows={sortedServices}
          getRowKey={(r) => r.service}
          onSort={onSort}
          onRowClick={(r) => navigate(`/services/${encodeURIComponent(r.service)}`)}
          emptyState={(
            <EmptyState
              inline
              icon={<FiClock />}
              title="No services reported in this time range"
              description="Nothing has reported into this project for the selected window. Widening the range usually resolves this."
            />
          )}
          errorState={(
            <EmptyState
              inline
              icon={<FiAlertCircle />}
              title="Services failed to load"
              description={String(services.error || 'The request did not complete.')}
              actions={<Button icon={<FiRefreshCw />} onClick={services.reload}>Retry</Button>}
            />
          )}
        />
      </Card>
    </Stack>
  )
}
