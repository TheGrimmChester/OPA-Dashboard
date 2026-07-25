import React from 'react'
import {
  FiGlobe, FiClock, FiAlertTriangle, FiEye, FiZap, FiActivity, FiLayers,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, TimeSeriesChart, StatusPill, EmptyState } from '../components/ui'
import { fmtMs, fmtNum } from '../theme/format'
import './BrowserRum.css'

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
  const d = rum.data || {}
  const cwv = d.core_web_vitals || {}

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

      {/* Detail views awaiting backend support */}
      <Panel title="Resource & session detail" icon={<FiLayers />}>
        <EmptyState icon={<FiGlobe />} title="Pending endpoint"
          hint="Per-resource waterfalls and session traces require a dedicated RUM detail endpoint (not yet available)." />
      </Panel>
    </div>
  )
}
