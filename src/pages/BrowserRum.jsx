import React, { useState } from 'react'
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
  const rum = useApi('/api/rum/metrics')
  const detail = useApi('/api/rum/detail')
  const [tab, setTab] = useState('resources')
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
  ]
  const pvCols = [
    { key: 'page_url', header: 'Page', render: (r) => <span className="opa-mono" style={ell}>{r.page_url || '—'}</span> },
    { key: 'load_ms', header: 'Load', num: true, sortValue: (r) => Number(r.load_ms), render: (r) => <span style={{ color: `var(--${latencyStatus(Number(r.load_ms))})` }}>{fmtMs(Number(r.load_ms))}</span> },
    { key: 'session_id', header: 'Session', mono: true, render: (r) => <span className="opa-muted opa-mono">{String(r.session_id || '').slice(0, 12) || '—'}</span> },
    { key: 'occurred_at', header: 'When', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.occurred_at)}</span> },
  ]
  const activeCols = tab === 'resources' ? resourceCols : tab === 'ajax' ? ajaxCols : pvCols
  const activeRows = tab === 'resources' ? resources : tab === 'ajax' ? ajax : pageViews

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
          <SegmentedControl value={tab} onChange={setTab} options={[
            { value: 'resources', label: `Resources ${resources.length}` },
            { value: 'ajax', label: `AJAX ${ajax.length}` },
            { value: 'sessions', label: `Page views ${pageViews.length}` },
          ]} />
        }>
        {activeRows.length === 0 && !detail.loading
          ? <EmptyState icon={<FiGlobe />} title="No RUM detail in range"
              hint="Include public/rum.js in your app to start capturing resource timing, AJAX calls and page views." />
          : <DataTable columns={activeCols} rows={activeRows} rowKey={(r, i) => i}
              initialSort={{ key: 'count', dir: 'desc' }} maxHeight={420} />}
      </Panel>
    </div>
  )
}
