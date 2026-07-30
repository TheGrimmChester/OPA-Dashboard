import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FiGlobe, FiClock, FiAlertTriangle, FiEye, FiZap, FiActivity, FiLayers,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, TimeSeriesChart, StatusPill, EmptyState, DataTable, Badge, InlineBar, SegmentedControl } from '../components/ui'
import { fmtMs, fmtNum, fmtBytes, fmtAgo, fmtPct, latencyStatus, errorRateStatus, tierColor } from '../theme/format'
import './BrowserRum.css'

const ell = { display: 'block', maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

// Core Web Vitals rating → design-system status tone
const ratingTone = (rating) =>
  rating === 'good' ? 'ok' : rating === 'poor' ? 'error' : rating === 'needs-improvement' ? 'warn' : 'neutral'
const ratingLabel = (rating) =>
  rating === 'good' ? 'Good' : rating === 'poor' ? 'Poor' : rating === 'needs-improvement' ? 'Needs work' : '—'

// The vitals we render, in New Relic order. CLS is unitless (3 decimals); the rest are ms.
const VITALS = [
  { key: 'lcp', label: 'LCP', name: 'Largest Contentful Paint' },
  { key: 'inp', label: 'INP', name: 'Interaction to Next Paint' },
  { key: 'cls', label: 'CLS', name: 'Cumulative Layout Shift' },
  { key: 'fcp', label: 'FCP', name: 'First Contentful Paint' },
  { key: 'ttfb', label: 'TTFB', name: 'Time to First Byte' },
  { key: 'fid', label: 'FID', name: 'First Input Delay' },
]

function CoreWebVitalCard({ label, name, vital }) {
  const v = vital || {}
  const rating = v.rating
  const tone = ratingTone(rating)
  const p75 = v.p75
  const isCls = label === 'CLS'
  const display = p75 == null
    ? '—'
    : isCls
      ? Number(p75).toFixed(3)
      : fmtMs(p75)
  return (
    <div className={`cwv-card cwv-${tone}`}>
      <div className="cwv-head">
        <span className="cwv-label opa-mono">{label}</span>
        <StatusPill tone={tone}>{ratingLabel(rating)}</StatusPill>
      </div>
      <div className="cwv-value opa-tnum">{display}</div>
      <div className="cwv-name opa-muted">{name}</div>
    </div>
  )
}

export default function BrowserRum() {
  const navigate = useNavigate()
  const rum = useApi('/api/rum/metrics')
  const detail = useApi('/api/rum/detail')
  const slo = useApi('/api/rum/slo')
  const facets = useApi('/api/rum/facets')
  const [tab, setTab] = useState('resources')
  // Selected browser session, expanded into a timeline panel below the table.
  const [session, setSession] = useState(null)
  const sessions = useApi('/api/rum/sessions', {}, { skip: tab !== 'sessions' })
  const sessionDetail = useApi(
    `/api/rum/sessions/${encodeURIComponent(session || '')}`,
    {}, { skip: !session },
  )
  const replay = useApi(
    `/api/rum/replay/${encodeURIComponent(session || '')}`,
    {}, { skip: !session },
  )

  // Correlate a browser AJAX call to the backend that served it. The v0.2
  // beacon propagates a W3C traceparent and records the trace id, so those
  // rows open the exact trace; older rows fall back to matching on request
  // path (the beacon records the full URL; backend spans key on url_path).
  const drillAjax = (r) => {
    if (r?.trace_id) {
      navigate(`/traces/${encodeURIComponent(r.trace_id)}`)
      return
    }
    if (!r?.url) return
    let path = r.url
    try { path = new URL(r.url, window.location.origin).pathname } catch { /* keep raw */ }
    navigate('/traces?' + new URLSearchParams({ filter: `url_path:"${path}"` }).toString())
  }
  const d = rum.data || {}
  const cwv = d.core_web_vitals || {}
  const dd = detail.data || {}
  const resources = dd.resources || []
  const ajax = dd.ajax || []
  const pageViews = dd.page_views || []
  const maxRes = Math.max(1, ...resources.map((r) => Number(r.count) || 0))
  const maxAjax = Math.max(1, ...ajax.map((a) => Number(a.count) || 0))

  const resourceCols = [
    { key: 'name', header: 'Resource', render: (r) => <span className="opa-mono" style={{ ...ell, color: tierColor(r.type) }}>{r.name || '—'}</span> },
    { key: 'type', header: 'Type', render: (r) => <Badge>{r.type || '—'}</Badge> },
    { key: 'count', header: 'Count', num: true, sortValue: (r) => Number(r.count), render: (r) => (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><InlineBar value={Number(r.count)} max={maxRes} label={fmtNum(r.count)} color={tierColor(r.type)} width={80} /></div>
    ) },
    { key: 'avg_duration', header: 'Avg', num: true, sortValue: (r) => Number(r.avg_duration), render: (r) => <span style={{ color: `var(--${latencyStatus(Number(r.avg_duration))})` }}>{fmtMs(Number(r.avg_duration))}</span> },
    { key: 'avg_size', header: 'Avg size', num: true, sortValue: (r) => Number(r.avg_size), render: (r) => fmtBytes(Number(r.avg_size)) },
  ]
  const ajaxCols = [
    { key: 'method', header: 'Method', render: (r) => <Badge>{r.method || 'GET'}</Badge> },
    { key: 'url', header: 'URL', render: (r) => <span className="opa-mono" style={ell}>{r.url || '—'}</span> },
    { key: 'count', header: 'Count', num: true, sortValue: (r) => Number(r.count), render: (r) => (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><InlineBar value={Number(r.count)} max={maxAjax} label={fmtNum(r.count)} color="var(--accent)" width={80} /></div>
    ) },
    { key: 'avg_duration', header: 'Avg', num: true, sortValue: (r) => Number(r.avg_duration), render: (r) => <span style={{ color: `var(--${latencyStatus(Number(r.avg_duration))})` }}>{fmtMs(Number(r.avg_duration))}</span> },
    { key: 'error_count', header: 'Errors', num: true, sortValue: (r) => Number(r.error_count), render: (r) => {
      const rate = Number(r.count) ? (Number(r.error_count) / Number(r.count)) * 100 : 0
      return <span style={{ color: `var(--${errorRateStatus(rate)})` }}>{fmtNum(r.error_count)} <span className="opa-muted">({fmtPct(rate, 0)})</span></span>
    } },
    {
      key: 'trace_id', header: 'Trace', width: 120,
      render: (r) => (r.trace_id
        ? <span className="opa-mono cell-strong">{String(r.trace_id).slice(0, 12)}</span>
        : <span className="opa-muted">—</span>),
      sortValue: (r) => r.trace_id || '',
    },
  ]
  const pvCols = [
    { key: 'page_url', header: 'Page', render: (r) => <span className="opa-mono" style={ell}>{r.page_url || '—'}</span> },
    { key: 'load_ms', header: 'Load', num: true, sortValue: (r) => Number(r.load_ms), render: (r) => <span style={{ color: `var(--${latencyStatus(Number(r.load_ms))})` }}>{fmtMs(Number(r.load_ms))}</span> },
    { key: 'session_id', header: 'Session', mono: true, render: (r) => <span className="opa-muted opa-mono">{String(r.session_id || '').slice(0, 12) || '—'}</span> },
    { key: 'occurred_at', header: 'When', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.occurred_at)}</span> },
  ]
  // One row per browser session (the beacon keeps a session id for the tab and
  // rotates page_view_id on each SPA route change).
  const sessionRows = sessions.data?.sessions || []
  const sessionCols = [
    { key: 'session_id', header: 'Session', render: (r) => <span className="opa-mono cell-strong">{String(r.session_id || '').slice(0, 14)}</span> },
    { key: 'page_count', header: 'Pages', num: true, sortValue: (r) => Number(r.page_count), render: (r) => fmtNum(r.page_count) },
    { key: 'ajax_count', header: 'AJAX', num: true, sortValue: (r) => Number(r.ajax_count), render: (r) => fmtNum(r.ajax_count) },
    {
      key: 'error_count', header: 'Errors', num: true, sortValue: (r) => Number(r.error_count),
      render: (r) => (Number(r.error_count) > 0
        ? <span style={{ color: 'var(--error)' }}>{fmtNum(r.error_count)}</span>
        : <span className="opa-muted">0</span>),
    },
    { key: 'avg_load_ms', header: 'Avg load', num: true, sortValue: (r) => Number(r.avg_load_ms), render: (r) => <span style={{ color: `var(--${latencyStatus(Number(r.avg_load_ms))})` }}>{fmtMs(Number(r.avg_load_ms))}</span> },
    { key: 'user_agent', header: 'User agent', render: (r) => <span className="opa-muted" style={ell}>{r.user_agent || '—'}</span> },
    { key: 'last_seen', header: 'Last seen', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.last_seen)}</span>, sortValue: (r) => Date.parse(r.last_seen) || 0 },
  ]

  // Merge the session's page views, AJAX calls and JS errors into one
  // chronological stream — what the user actually did, in order.
  const timelineRows = (() => {
    const d = sessionDetail.data
    if (!d) return []
    const out = []
    ;(d.page_views || []).forEach((p) => out.push({ kind: 'page', at: p.occurred_at, label: p.page_url, meta: fmtMs(Number(p.load_ms)) }))
    ;(d.ajax || []).forEach((a) => out.push({
      kind: 'ajax', at: a.occurred_at, label: `${a.method || 'GET'} ${a.url}`,
      meta: `${fmtMs(Number(a.duration))} · ${a.status}`, trace_id: a.trace_id, status: Number(a.status),
    }))
    ;(d.errors || []).forEach((e) => out.push({ kind: 'error', at: e.occurred_at, label: e.message, meta: e.page_url }))
    return out.sort((x, y) => (Date.parse(x.at) || 0) - (Date.parse(y.at) || 0))
  })()

  const timelineCols = [
    {
      key: 'kind', header: 'Type', width: 84,
      render: (r) => <StatusPill tone={r.kind === 'error' ? 'error' : r.kind === 'ajax' ? 'neutral' : 'ok'}>{r.kind}</StatusPill>,
    },
    {
      key: 'label', header: 'Event',
      render: (r) => <span className={r.kind === 'error' ? '' : 'opa-mono'} style={{ ...ell, maxWidth: 520, color: r.kind === 'error' ? 'var(--error)' : undefined }}>{r.label || '—'}</span>,
    },
    { key: 'meta', header: 'Detail', render: (r) => <span className="opa-muted">{r.meta || '—'}</span> },
    {
      key: 'trace', header: 'Trace', width: 120,
      render: (r) => (r.trace_id
        ? <span className="opa-mono cell-strong">{String(r.trace_id).slice(0, 12)}</span>
        : <span className="opa-muted">—</span>),
    },
    { key: 'at', header: 'When', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.at)}</span>, sortValue: (r) => Date.parse(r.at) || 0 },
  ]

  const activeCols = tab === 'resources' ? resourceCols
    : tab === 'ajax' ? ajaxCols
      : tab === 'sessions' ? sessionCols : pvCols
  const activeRows = tab === 'resources' ? resources
    : tab === 'ajax' ? ajax
      : tab === 'sessions' ? sessionRows : pageViews

  const timeline = (d.timeline || []).map((t) => ({
    time: (t.time || '').slice(5, 16),
    avg_load_time: t.avg_load_time,
    p95_load_time: t.p95_load_time,
  }))

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Browser</h1>
          <div className="opa-page-sub">Real user monitoring · Core Web Vitals (p75)</div>
        </div>
      </div>

      {/* Core Web Vitals */}
      <Panel title="Core Web Vitals" icon={<FiZap />} loading={rum.loading} error={rum.error}
        empty={!rum.loading && Object.keys(cwv).length === 0} emptyText="No web-vitals data in range">
        <div className="cwv-grid">
          {VITALS.map((m) => (
            <CoreWebVitalCard key={m.key} label={m.label} name={m.name} vital={cwv[m.key]} />
          ))}
        </div>
      </Panel>

      {/* Wave 12: CWV SLO budgets + facets */}
      <div className="opa-grid cols-2">
        <Panel title="CWV SLO budgets" icon={<FiZap />} loading={slo.loading} error={slo.error}
          empty={!slo.loading && !slo.data?.slo} emptyText="No SLO data yet">
          <div className="opa-grid cols-3">
            {['lcp', 'inp', 'cls'].map((k) => {
              const s = slo.data?.slo?.[k] || {}
              return (
                <div key={k}>
                  <div className="opa-muted opa-mono" style={{ fontSize: 11 }}>{k.toUpperCase()} p75</div>
                  <div className="opa-tnum" style={{ fontSize: 18 }}>
                    {k === 'cls' ? (s.p75 == null ? '—' : Number(s.p75).toFixed(3)) : fmtMs(s.p75)}
                  </div>
                  <StatusPill tone={s.ok ? 'ok' : s.p75 ? 'error' : 'neutral'}>{s.rating || (s.ok ? 'ok' : '—')}</StatusPill>
                </div>
              )
            })}
          </div>
        </Panel>
        <Panel title="Facets" icon={<FiLayers />} loading={facets.loading} error={facets.error}
          empty={!facets.loading && !(facets.data?.route || []).length} emptyText="No facet data yet">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(facets.data?.route || []).slice(0, 12).map((r, i) => (
              <Badge key={i}>{r.value || r.route || '—'} · {fmtNum(r.count)}</Badge>
            ))}
            {(facets.data?.geo_country || []).slice(0, 6).map((r, i) => (
              <Badge key={`g${i}`}>{r.value || '—'} · {fmtNum(r.count)}</Badge>
            ))}
          </div>
        </Panel>
      </div>

      {/* KPI tiles */}
      <div className="opa-grid cols-4">
        <KpiTile label="Page views" icon={<FiEye size={12} />} value={fmtNum(d.total_page_views || 0)}
          unit="views" status="neutral" />
        <KpiTile label="JS errors" icon={<FiAlertTriangle size={12} />} value={fmtNum(d.total_errors || 0)}
          status={(d.total_errors || 0) > 0 ? 'error' : 'ok'} invert />
        <KpiTile label="Avg load" icon={<FiClock size={12} />} value={fmtMs(d.avg_page_load_time)}
          status="neutral" />
        <KpiTile label="Avg DOM ready" icon={<FiActivity size={12} />} value={fmtMs(d.avg_dom_ready_time)}
          status="neutral" />
      </div>

      {/* Load-time timeline */}
      <Panel title="Page load time" icon={<FiClock />} loading={rum.loading} error={rum.error}
        empty={!rum.loading && timeline.length === 0} emptyText="No timeline data in range">
        <TimeSeriesChart data={timeline} xKey="time" height={260}
          valueFmt={fmtMs} yFmt={fmtMs}
          series={[
            { key: 'avg_load_time', name: 'Avg load', color: 'var(--p50)', type: 'line' },
            { key: 'p95_load_time', name: 'p95 load', color: 'var(--p95)', type: 'line' },
          ]} />
      </Panel>

      {/* Resource timing / AJAX / recent page views (from /api/rum/detail) */}
      <Panel title="Resource & session detail" icon={<FiLayers />} flush
        loading={detail.loading} error={detail.error}
        actions={
          <SegmentedControl value={tab} onChange={(v) => { setTab(v); setSession(null) }} options={[
            { value: 'resources', label: `Resources ${resources.length}` },
            { value: 'ajax', label: `AJAX ${ajax.length}` },
            { value: 'pages', label: `Page views ${pageViews.length}` },
            { value: 'sessions', label: `Sessions ${sessionRows.length}` },
          ]} />
        }>
        {activeRows.length === 0 && !detail.loading && !sessions.loading
          ? <EmptyState icon={<FiGlobe />} title="No RUM detail in range"
              hint="Add the opa-rum.js snippet (<script src=&quot;/opa-rum.js&quot; …>) to your app to start capturing resource timing, AJAX calls and page views." />
          : <DataTable columns={activeCols} rows={activeRows} rowKey={(r, i) => i}
              onRowClick={tab === 'ajax' ? drillAjax
                : tab === 'sessions' ? (r) => setSession(r.session_id === session ? null : r.session_id)
                  : undefined}
              initialSort={tab === 'sessions' ? { key: 'last_seen', dir: 'desc' } : { key: 'count', dir: 'desc' }}
              maxHeight={420} />}
      </Panel>

      {/* Session timeline — page views, AJAX and errors in the order they happened. */}
      {session && (
        <Panel title={`Session timeline · ${String(session).slice(0, 14)}`} icon={<FiActivity />} flush
          loading={sessionDetail.loading} error={sessionDetail.error}
          empty={!sessionDetail.loading && timelineRows.length === 0}
          emptyText="No events recorded for this session"
          actions={
            <button className="opa-btn ghost" onClick={() => setSession(null)}>Close</button>
          }>
          <DataTable columns={timelineCols} rows={timelineRows} rowKey={(r, i) => i}
            onRowClick={(r) => r.trace_id && navigate(`/traces/${encodeURIComponent(r.trace_id)}`)}
            maxHeight={420} />
          {(replay.data?.chunks || []).length > 0 && (
            <div style={{ padding: '8px 12px' }} className="opa-muted">
              Session replay: {fmtNum(replay.data.chunks.length)} chunk(s) · {(replay.data.chunks.reduce((n, c) => n + (Number(c.bytes) || 0), 0))} bytes (masked)
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}
