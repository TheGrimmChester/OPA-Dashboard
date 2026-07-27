import React from 'react'
import { FiClock, FiActivity, FiAlertTriangle, FiZap, FiDownload, FiUpload, FiGlobe, FiWifi } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, TimeSeriesChart } from '../components/ui'
import { fmtMs, fmtBytes, fmtNum, fmtPct, latencyStatus, errorRateStatus } from '../theme/format'

const hhmm = (t) => (t || '').slice(11, 16)

export default function PerformanceView() {
  const perf = useApi('/api/metrics/performance')
  const net = useApi('/api/metrics/network')

  const perfRows = (perf.data?.metrics || [])
  const netRows = (net.data?.metrics || [])

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
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Performance</h1>
          <div className="opa-page-sub">Response times, throughput &amp; network across {pm.length} interval{pm.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      {/* KPIs */}
      <div className="opa-grid cols-4" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <KpiTile label="p95 response" icon={<FiZap size={12} />} value={fmtMs(p95Cur)} status={latencyStatus(p95Cur)}
          spark={pm.map((m) => m.p95)} sparkColor="var(--p95)" current={p95Cur} previous={p95Prev} invert />
        <KpiTile label="p99 response" icon={<FiClock size={12} />} value={fmtMs(p99Cur)} status={latencyStatus(p99Cur)}
          spark={pm.map((m) => m.p99)} sparkColor="var(--p99)" current={p99Cur} previous={p99Prev} invert />
        <KpiTile label="Error rate" icon={<FiAlertTriangle size={12} />} value={fmtPct(erCur || 0)} status={errorRateStatus(erCur)}
          spark={pm.map((m) => m.error_rate)} sparkColor="var(--error)" current={erCur} previous={erPrev} invert />
        <KpiTile label="Throughput" icon={<FiActivity size={12} />} value={fmtNum(totalThroughput)} unit="req" status="neutral"
          spark={pm.map((m) => m.throughput)} sparkColor="var(--accent)" />
        <KpiTile label="Avg latency" icon={<FiWifi size={12} />} value={fmtMs(latCur)} status={latencyStatus(latCur)}
          spark={nm.map((m) => m.avg_latency)} sparkColor="var(--tier-http)" current={latCur} previous={latPrev} invert
          footer={<span className="opa-muted" style={{ fontSize: 'var(--fs-11)' }}>{fmtNum(totalReq)} requests</span>} />
      </div>

      {/* Charts */}
      <div className="opa-grid cols-2">
        <Panel title="Response time percentiles" icon={<FiClock />} loading={perf.loading} error={perf.error} empty={perfEmpty}>
          <TimeSeriesChart data={pm} series={[
            { key: 'p50', name: 'p50', color: 'var(--p50)', type: 'line' },
            { key: 'p95', name: 'p95', color: 'var(--p95)', type: 'line' },
            { key: 'p99', name: 'p99', color: 'var(--p99)', type: 'line' },
          ]} valueFmt={fmtMs} yFmt={fmtMs} height={240} />
        </Panel>

        <Panel title="Throughput &amp; error rate" icon={<FiActivity />} loading={perf.loading} error={perf.error} empty={perfEmpty}>
          <TimeSeriesChart data={pm} series={[
            { key: 'throughput', name: 'Throughput', color: 'var(--accent)', type: 'bar' },
            { key: 'error_rate', name: 'Error %', color: 'var(--error)', type: 'line' },
          ]} valueFmt={(v) => fmtNum(v)} height={240} />
        </Panel>

        <Panel title="Network bandwidth" icon={<FiGlobe />} loading={net.loading} error={net.error} empty={netEmpty}
          actions={<span className="opa-mono" style={{ fontSize: 'var(--fs-12)' }}>
            <span style={{ color: 'var(--tier-app)' }}>↑{fmtBytes(totalOut)}</span>{' '}
            <span className="opa-muted">/</span>{' '}
            <span style={{ color: 'var(--tier-db)' }}>↓{fmtBytes(totalIn)}</span>
          </span>}>
          <TimeSeriesChart data={nm} stacked series={[
            { key: 'bytes_sent', name: 'Sent', color: 'var(--tier-app)', type: 'area' },
            { key: 'bytes_received', name: 'Received', color: 'var(--tier-db)', type: 'area' },
          ]} valueFmt={fmtBytes} yFmt={fmtBytes} height={240} />
        </Panel>

        <Panel title="Latency &amp; request volume" icon={<FiWifi />} loading={net.loading} error={net.error} empty={netEmpty}>
          <TimeSeriesChart data={nm} series={[
            { key: 'request_count', name: 'Requests', color: 'var(--tier-http)', type: 'bar' },
            { key: 'avg_latency', name: 'Avg latency', color: 'var(--warn)', type: 'line' },
          ]} valueFmt={(v) => fmtNum(v)} height={240} />
        </Panel>
      </div>
    </div>
  )
}
