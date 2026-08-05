import React, { useState } from 'react'
import TimeSeriesChart from '../components/ui/TimeSeriesChart'
import { FiClock, FiActivity, FiAlertTriangle, FiZap, FiDownload, FiUpload, FiGlobe, FiWifi, FiBarChart2 } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { useTimeRange } from '../contexts/TimeRangeContext'
import { Panel, KpiTile } from '../components/ui'
import { fmtMs, fmtBytes, fmtNum, fmtPct, latencyStatus, errorRateStatus } from '../theme/format'
import { PageHeader } from '@open-family/ui'

const hhmm = (t) => (t || '').slice(11, 16)

// Muted/dashed styling shared by every "previous period" overlay series so the
// current-period lines stay the visual focus.
const PREV_COLOR = 'var(--text-muted)'
const prevLine = (key, name) => ({ key, name: `${name} (prev)`, color: PREV_COLOR, type: 'line', dashed: true })

export default function PerformanceView() {
  const [compare, setCompare] = useState(false)
  const { prevFrom, prevTo } = useTimeRange()

  const perf = useApi('/api/metrics/performance')
  const net = useApi('/api/metrics/network')

  // Previous-period series: same endpoints/interval, window shifted back one
  // full range. Skipped entirely (no fetch, no loading/error) when compare off.
  const perfPrev = useApi('/api/metrics/performance', { from: prevFrom, to: prevTo }, { skip: !compare })
  const netPrev = useApi('/api/metrics/network', { from: prevFrom, to: prevTo }, { skip: !compare })

  const perfRows = (perf.data?.metrics || [])
  const netRows = (net.data?.metrics || [])
  const perfPrevRows = (perfPrev.data?.metrics || [])
  const netPrevRows = (netPrev.data?.metrics || [])

  // Performance series (percentiles + throughput/error).
  const pm = perfRows.map((m) => ({
    time: hhmm(m.time),
    p50: m.p50_duration,
    p95: m.p95_duration,
    p99: m.p99_duration,
    throughput: m.throughput,
    error_rate: m.error_rate,
  }))

  // Merge both metric arrays by raw time for the network panels.
  const byTime = new Map()
  perfRows.forEach((m) => byTime.set(m.time, { time: hhmm(m.time) }))
  netRows.forEach((m) => {
    const row = byTime.get(m.time) || { time: hhmm(m.time) }
    row.bytes_sent = m.bytes_sent
    row.bytes_received = m.bytes_received
    row.avg_latency = m.avg_latency
    row.request_count = m.request_count
    byTime.set(m.time, row)
  })
  const nm = Array.from(byTime.values())

  // Overlay the previous period by index (both share interval → aligned
  // buckets). Guard for differing lengths: align up to the shorter, ignore
  // extra. Injected onto the SAME row objects the charts already render.
  if (compare) {
    const nPerf = Math.min(pm.length, perfPrevRows.length)
    for (let i = 0; i < nPerf; i++) {
      const p = perfPrevRows[i]
      pm[i].p50_prev = p.p50_duration
      pm[i].p95_prev = p.p95_duration
      pm[i].p99_prev = p.p99_duration
      pm[i].throughput_prev = p.throughput
      pm[i].error_rate_prev = p.error_rate
    }
    const nNet = Math.min(nm.length, netPrevRows.length)
    for (let i = 0; i < nNet; i++) {
      const p = netPrevRows[i]
      nm[i].bytes_sent_prev = p.bytes_sent
      nm[i].bytes_received_prev = p.bytes_received
      nm[i].avg_latency_prev = p.avg_latency
      nm[i].request_count_prev = p.request_count
    }
  }

  const firstLast = (rows, k) => {
    const a = rows.filter((r) => r[k] != null)
    return a.length ? [a[0][k], a[a.length - 1][k]] : [null, null]
  }
  const [p95Prev, p95Cur] = firstLast(pm, 'p95')
  const [p99Prev, p99Cur] = firstLast(pm, 'p99')
  const [erPrev, erCur] = firstLast(pm, 'error_rate')
  const [latPrev, latCur] = firstLast(nm, 'avg_latency')

  const totalThroughput = pm.reduce((s, m) => s + (m.throughput || 0), 0)
  const totalReq = nm.reduce((s, m) => s + (m.request_count || 0), 0)
  const totalOut = nm.reduce((s, m) => s + (m.bytes_sent || 0), 0)
  const totalIn = nm.reduce((s, m) => s + (m.bytes_received || 0), 0)

  const perfEmpty = !perf.loading && pm.length === 0
  const netEmpty = !net.loading && nm.length === 0

  return (
    <div className="oui-stack">
      <PageHeader
        title="Performance"
        description={<>Response times, throughput &amp; network across {pm.length} interval{pm.length === 1 ? '' : 's'}
            {compare && <span className="oui-text-muted"> · overlaying previous period (dashed)</span>}</>}
        actions={<><div className="oui-row">
          <button
            className={`oui-btn is-secondary ${compare ? 'primary' : 'ghost'}`}
            onClick={() => setCompare((c) => !c)}
            aria-pressed={compare}
            title="Overlay the immediately-preceding period of equal length as dashed lines"
          >
            <FiBarChart2 size={14} /> Compare to previous period
          </button>
        </div></>}
      />

      {/* KPIs */}
      <div className="oui-grid is-4" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <KpiTile label="p95 response" icon={<FiZap size={12} />} value={fmtMs(p95Cur)} status={latencyStatus(p95Cur)}
          spark={pm.map((m) => m.p95)} sparkColor="var(--chart-2)" current={p95Cur} previous={p95Prev} invert />
        <KpiTile label="p99 response" icon={<FiClock size={12} />} value={fmtMs(p99Cur)} status={latencyStatus(p99Cur)}
          spark={pm.map((m) => m.p99)} sparkColor="var(--chart-3)" current={p99Cur} previous={p99Prev} invert />
        <KpiTile label="Error rate" icon={<FiAlertTriangle size={12} />} value={fmtPct(erCur || 0)} status={errorRateStatus(erCur)}
          spark={pm.map((m) => m.error_rate)} sparkColor="var(--critical-text)" current={erCur} previous={erPrev} invert />
        <KpiTile label="Throughput" icon={<FiActivity size={12} />} value={fmtNum(totalThroughput)} unit="req" status="neutral"
          spark={pm.map((m) => m.throughput)} sparkColor="var(--accent)" />
        <KpiTile label="Avg latency" icon={<FiWifi size={12} />} value={fmtMs(latCur)} status={latencyStatus(latCur)}
          spark={nm.map((m) => m.avg_latency)} sparkColor="var(--chart-4)" current={latCur} previous={latPrev} invert
          footer={<span className="oui-text-muted" style={{ fontSize: 'var(--text-2xs)' }}>{fmtNum(totalReq)} requests</span>} />
      </div>

      {/* Charts */}
      <div className="oui-grid is-2">
        <Panel title="Response time percentiles" icon={<FiClock />} loading={perf.loading} error={perf.error} empty={perfEmpty}>
          <TimeSeriesChart data={pm} series={[
            { key: 'p50', name: 'p50', color: 'var(--chart-1)', type: 'line' },
            { key: 'p95', name: 'p95', color: 'var(--chart-2)', type: 'line' },
            { key: 'p99', name: 'p99', color: 'var(--chart-3)', type: 'line' },
            ...(compare ? [prevLine('p50_prev', 'p50'), prevLine('p95_prev', 'p95'), prevLine('p99_prev', 'p99')] : []),
          ]} valueFmt={fmtMs} yFmt={fmtMs} height={240} />
        </Panel>

        <Panel title="Throughput &amp; error rate" icon={<FiActivity />} loading={perf.loading} error={perf.error} empty={perfEmpty}>
          <TimeSeriesChart data={pm} series={[
            { key: 'throughput', name: 'Throughput', color: 'var(--accent)', type: 'bar' },
            { key: 'error_rate', name: 'Error %', color: 'var(--critical-text)', type: 'line' },
            ...(compare ? [prevLine('throughput_prev', 'Throughput'), prevLine('error_rate_prev', 'Error %')] : []),
          ]} valueFmt={(v) => fmtNum(v)} height={240} />
        </Panel>

        <Panel title="Network bandwidth" icon={<FiGlobe />} loading={net.loading} error={net.error} empty={netEmpty}
          actions={<span className="oui-mono" style={{ fontSize: 'var(--text-xs)' }}>
            <span style={{ color: 'var(--chart-1)' }}>↑{fmtBytes(totalOut)}</span>{' '}
            <span className="oui-text-muted">/</span>{' '}
            <span style={{ color: 'var(--chart-2)' }}>↓{fmtBytes(totalIn)}</span>
          </span>}>
          {/* Unstack when comparing so the dashed prev lines (which don't
              stack) share the current series' zero baseline and stay aligned. */}
          <TimeSeriesChart data={nm} stacked={!compare} series={[
            { key: 'bytes_sent', name: 'Sent', color: 'var(--chart-1)', type: 'area' },
            { key: 'bytes_received', name: 'Received', color: 'var(--chart-2)', type: 'area' },
            ...(compare ? [prevLine('bytes_sent_prev', 'Sent'), prevLine('bytes_received_prev', 'Received')] : []),
          ]} valueFmt={fmtBytes} yFmt={fmtBytes} height={240} />
        </Panel>

        <Panel title="Latency &amp; request volume" icon={<FiWifi />} loading={net.loading} error={net.error} empty={netEmpty}>
          <TimeSeriesChart data={nm} series={[
            { key: 'request_count', name: 'Requests', color: 'var(--chart-4)', type: 'bar' },
            { key: 'avg_latency', name: 'Avg latency', color: 'var(--warn-text)', type: 'line' },
            ...(compare ? [prevLine('request_count_prev', 'Requests'), prevLine('avg_latency_prev', 'Avg latency')] : []),
          ]} valueFmt={(v) => fmtNum(v)} height={240} />
        </Panel>
      </div>
    </div>
  )
}
