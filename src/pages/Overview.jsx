import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiAlertCircle, FiArrowRight, FiRefreshCw } from 'react-icons/fi'
import {
  PageHeader, Stack, Grid, Card, Table, StatRow, StatTile, Badge, Button,
  EmptyState, Meter,
} from '@open-family/ui'
import { useApi } from '../hooks/useApi'
import { TimeSeriesChart } from '../components/ui'
import {
  fmtMs, fmtNum, fmtPct, latencyStatus, errorRateStatus, statusColor,
} from '../theme/format'

/**
 * The product's landing page.
 *
 * `/overview` used to redirect to `/services`, so the product had no page that
 * answered "is anything wrong right now" — a user landed in an inventory and had
 * to read a table to find out. This is one hero figure, the golden signals, the
 * throughput trend and the slowest services, in that order.
 */
export default function Overview() {
  const navigate = useNavigate()
  const services = useApi('/api/services')
  const perf = useApi('/api/metrics/performance')

  const totals = services.data?.global_totals || {}
  const svc = services.data?.services || []

  const metrics = useMemo(() => (perf.data?.metrics || []).map((m) => ({
    time: String(m.time || '').slice(5, 16),
    throughput: m.throughput,
    error_rate: m.error_rate,
    p95: m.p95_duration,
  })), [perf.data])

  const series = (key) => metrics.map((m) => m[key]).filter((v) => v != null)
  const firstLast = (key) => {
    const present = metrics.filter((m) => m[key] != null)
    return present.length ? [present[0][key], present[present.length - 1][key]] : [null, null]
  }
  const [tpPrev, tpCur] = firstLast('throughput')
  const [p95Prev, p95Cur] = firstLast('p95')
  const [erPrev, erCur] = firstLast('error_rate')

  const errorRate = totals.total_spans ? (totals.error_count / totals.total_spans) * 100 : 0
  const unhealthy = svc.filter((s) => errorRateStatus(s.error_rate) !== 'ok').length

  // A delta's arrow is direction; its colour is sentiment. Falling latency is a
  // down arrow in the good colour, so the two are computed separately.
  const delta = (prev, cur, lowerIsBetter) => {
    if (prev == null || cur == null || prev === cur) return undefined
    const rising = cur > prev
    const magnitude = Math.abs(cur - prev)
    return {
      value: lowerIsBetter && magnitude < 10 ? fmtMs(magnitude) : fmtNum(magnitude),
      direction: rising ? 'up' : 'down',
      good: lowerIsBetter ? !rising : rising,
    }
  }

  const slowest = useMemo(
    () => [...svc].sort((a, b) => (b.p95_duration || 0) - (a.p95_duration || 0)).slice(0, 8),
    [svc]
  )

  const maxP95 = Math.max(1, ...slowest.map((s) => s.p95_duration || 0))

  const slowestColumns = [
    {
      key: 'service',
      header: 'Service',
      render: (r) => <span className="oui-mono">{r.service}</span>,
    },
    {
      key: 'p95_duration',
      header: 'p95',
      numeric: true,
      render: (r) => (
        <span style={{ color: statusColor(latencyStatus(r.p95_duration)) }}>{fmtMs(r.p95_duration)}</span>
      ),
    },
    {
      key: 'share',
      header: 'Relative',
      width: 160,
      render: (r) => (
        <Meter
          value={((r.p95_duration || 0) / maxP95) * 100}
          label={`${r.service} p95 relative to the slowest service`}
          tone={latencyStatus(r.p95_duration) === 'error' ? 'critical' : latencyStatus(r.p95_duration) === 'warn' ? 'warning' : 'accent'}
        />
      ),
    },
    {
      key: 'error_rate',
      header: 'Errors',
      numeric: true,
      render: (r) => (
        <span style={{ color: statusColor(errorRateStatus(r.error_rate)) }}>{fmtPct(r.error_rate)}</span>
      ),
    },
  ]

  const tableState = services.loading
    ? 'loading'
    : services.error
      ? 'error'
      : slowest.length
        ? 'ready'
        : 'empty'

  return (
    <Stack gap="sections">
      <PageHeader
        title="Overview"
        description="The health of every instrumented service in this project for the selected window."
        actions={
          <Button icon={<FiArrowRight />} onClick={() => navigate('/services')}>
            All services
          </Button>
        }
        meta={[
          { label: 'Services', value: fmtNum(svc.length) },
          { label: 'Needing attention', value: fmtNum(unhealthy) },
        ]}
      />

      <StatRow>
        <StatTile
          hero
          label="Throughput"
          value={fmtNum(totals.total_traces || 0)}
          delta={delta(tpPrev, tpCur, false)}
          deltaLabel="across the window"
          spark={series('throughput')}
        />
        <StatTile
          label="p95 response"
          value={fmtMs(p95Cur ?? totals.avg_duration)}
          delta={delta(p95Prev, p95Cur, true)}
          deltaLabel="across the window"
          spark={series('p95')}
        />
        <StatTile
          label="Error rate"
          value={fmtPct(errorRate)}
          delta={delta(erPrev, erCur, true)}
          deltaLabel="across the window"
          spark={series('error_rate')}
        />
        <StatTile
          label="Spans"
          value={fmtNum(totals.total_spans || 0)}
          foot={
            <span className="oui-text-muted">
              {fmtNum(totals.total_sql_queries)} SQL · {fmtNum(totals.total_http_requests)} HTTP
            </span>
          }
        />
      </StatRow>

      <Grid columns="split">
        <Card
          title="Throughput and errors"
          description="Requests and error rate over the selected window."
        >
          {perf.error ? (
            <EmptyState
              inline
              icon={<FiAlertCircle />}
              title="This chart failed to load"
              description={String(perf.error)}
              actions={<Button icon={<FiRefreshCw />} onClick={perf.reload}>Retry</Button>}
            />
          ) : (
            <TimeSeriesChart
              data={metrics}
              series={[
                { key: 'throughput', name: 'Throughput', color: 'var(--chart-1)', type: 'bar' },
                { key: 'error_rate', name: 'Error rate', color: 'var(--st-critical)', type: 'line' },
              ]}
              valueFmt={(v) => fmtNum(v)}
              height={260}
            />
          )}
        </Card>

        <Card title="Attention" description="What is outside its expected range right now.">
          <Stack>
            {unhealthy === 0 ? (
              <EmptyState
                inline
                title="Nothing needs attention"
                description="Every reporting service is inside its error-rate threshold for this window."
              />
            ) : (
              svc
                .filter((s) => errorRateStatus(s.error_rate) !== 'ok')
                .slice(0, 6)
                .map((s) => (
                  <div key={s.service} className="oui-row is-between">
                    <span className="oui-mono">{s.service}</span>
                    <Badge tone={errorRateStatus(s.error_rate) === 'error' ? 'critical' : 'warning'}>
                      {fmtPct(s.error_rate)} errors
                    </Badge>
                  </div>
                ))
            )}
          </Stack>
        </Card>
      </Grid>

      <Card
        flush
        title="Slowest services"
        description="Ranked by p95 response time for the selected window."
      >
        <Table
          aria-label="Slowest services"
          state={tableState}
          columns={slowestColumns}
          rows={slowest}
          getRowKey={(r) => r.service}
          onRowClick={(r) => navigate(`/services/${encodeURIComponent(r.service)}`)}
          emptyState={
            <EmptyState
              inline
              title="No services reporting"
              description="Nothing has reported into this project for the selected window. Widening the range usually resolves this."
            />
          }
          errorState={
            <EmptyState
              inline
              icon={<FiAlertCircle />}
              title="Services failed to load"
              description={String(services.error || 'The request did not complete.')}
              actions={<Button icon={<FiRefreshCw />} onClick={services.reload}>Retry</Button>}
            />
          }
        />
      </Card>
    </Stack>
  )
}
