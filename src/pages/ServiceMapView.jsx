import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Network } from 'vis-network'
import axios from 'axios'
import {
  FiShare2, FiServer, FiDatabase, FiGlobe, FiZap, FiHardDrive, FiActivity,
  FiClock, FiAlertTriangle, FiZoomIn, FiZoomOut, FiMaximize2, FiX, FiGitBranch,
  FiArrowUpRight, FiArrowDownLeft, FiSliders,
} from 'react-icons/fi'
import { PageHeader, readCssToken } from '@open-family/ui'
import { useApi } from '../hooks/useApi'

const API = import.meta.env.VITE_API_URL || ''
import {
  Panel, KpiTile, DataTable, InlineBar, StatusPill, SegmentedControl,
} from '../components/ui'
import { fmtMs, fmtBytes, fmtNum, fmtPct, fmtAgo, tierColor, latencyStatus, errorRateStatus, statusColor } from '../theme/format'
import './ServiceMapView.css'

// Resolve a design token to its concrete value. vis-network draws to a canvas,
// so it cannot consume a `var(…)` string and needs the computed colour.
//
// No hard-coded fallbacks: the token layer is always loaded before React renders
// and a contract test asserts every referenced property is defined. The old
// fallbacks were dark-theme hexes, so on the rare path where they fired they
// painted a dark map onto a light page.
function cssVar(name) {
  return readCssToken(name) ?? 'transparent'
}

// health_status -> semantic tone used across pills/dots/colors.
function healthTone(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'down' || s === 'error' || s === 'critical' || s === 'unhealthy') return 'error'
  if (s === 'degraded' || s === 'warn' || s === 'warning' || s === 'needs-improvement') return 'warn'
  if (s === 'healthy' || s === 'ok' || s === 'success' || s === 'up' || s === 'good') return 'ok'
  return 'neutral'
}

// Map a node_type to a vis-network shape so type is encoded independently of
// the health color.
function nodeShape(type) {
  switch (String(type || '').toLowerCase()) {
    case 'database': return 'database'
    case 'redis': return 'diamond'
    case 'curl': return 'hexagon'
    case 'cache': return 'triangle'
    case 'http': return 'dot'
    default: return 'box'
  }
}

// react-icons glyph for a node_type (used in the drawer header).
function TypeIcon({ type }) {
  switch (String(type || '').toLowerCase()) {
    case 'database': return <FiDatabase />
    case 'redis': return <FiZap />
    case 'curl': return <FiGlobe />
    case 'http': return <FiGlobe />
    case 'cache': return <FiHardDrive />
    default: return <FiServer />
  }
}

// "host:port" label, degrading gracefully to whatever is present.
function hostPort(o) {
  if (!o) return '—'
  const host = o.host || o.resolved_host || ''
  const port = o.port != null && o.port !== '' ? String(o.port) : ''
  if (host && port) return `${host}:${port}`
  return host || port || '—'
}

export default function ServiceMapView() {
  const navigate = useNavigate()
  const map = useApi('/api/service-map')
  const thresholds = useApi('/api/service-map/thresholds', {}, { noRange: true })

  const [layout, setLayout] = useState('force') // 'force' | 'hierarchical'
  const [selected, setSelected] = useState(null) // { kind:'node'|'edge', data }
  const [editThresh, setEditThresh] = useState(false)

  const containerRef = useRef(null)
  const networkRef = useRef(null)
  // Latest resolved node/edge payloads so the (once-registered) click handler
  // always reads current data.
  const lookupRef = useRef({ nodes: {}, edges: {} })

  const nodes = useMemo(() => (Array.isArray(map.data?.nodes) ? map.data.nodes : []), [map.data])
  const edges = useMemo(() => (Array.isArray(map.data?.edges) ? map.data.edges : []), [map.data])

  // ---- Aggregate KPIs -----------------------------------------------------
  const kpis = useMemo(() => {
    const svc = nodes.filter((n) => String(n?.node_type || 'service').toLowerCase() === 'service')
    const unhealthy = nodes.filter((n) => healthTone(n?.health_status) === 'error' || healthTone(n?.health_status) === 'warn').length
    const totalCalls = edges.reduce((a, e) => a + (e?.call_count || 0), 0)
    const wLat = edges.reduce((a, e) => a + (e?.avg_latency_ms || 0) * (e?.call_count || 0), 0)
    const avgLat = totalCalls > 0 ? wLat / totalCalls : 0
    const errCalls = edges.reduce((a, e) => a + (e?.call_count || 0) * ((e?.error_rate || 0) / 100), 0)
    const errRate = totalCalls > 0 ? (errCalls / totalCalls) * 100 : 0
    const bytes = edges.reduce((a, e) => a + (e?.bytes_sent || 0) + (e?.bytes_received || 0), 0)
    return { services: svc.length, deps: nodes.length - svc.length, edges: edges.length, unhealthy, totalCalls, avgLat, errRate, bytes }
  }, [nodes, edges])

  // ---- Build vis-network graph -------------------------------------------
  const graph = useMemo(() => {
    const pal = {
      ok: cssVar('--good-text'),
      warn: cssVar('--warn-text'),
      error: cssVar('--critical-text'),
      neutral: cssVar('--text-muted'),
      accent: cssVar('--accent'),
      surface2: cssVar('--surface-2'),
      border: cssVar('--border-subtle'),
      text: cssVar('--text-primary'),
    }

    // Edge weight metric: throughput preferred, fall back to call volume when
    // the backend reports no per-second rate.
    const edgeWeight = (e) => (e?.throughput > 0 ? e.throughput : (e?.call_count || 0))
    const maxW = Math.max(1, ...edges.map(edgeWeight))

    const visNodes = nodes.map((n) => {
      const id = n?.id ?? n?.service
      const tone = healthTone(n?.health_status)
      const color = pal[tone] || pal.neutral
      const callVol = (n?.incoming_calls || 0) + (n?.outgoing_calls || 0)
      const size = Math.max(16, Math.min(46, 16 + Math.log10(callVol + 1) * 9))
      return {
        id,
        label: String(n?.service ?? id ?? ''),
        shape: nodeShape(n?.node_type),
        size,
        color: {
          background: color,
          border: color,
          highlight: { background: color, border: pal.accent },
          hover: { background: color, border: pal.accent },
        },
        borderWidth: 2,
        font: { color: pal.text, size: 13, face: readCssToken('--font-sans') ?? 'system-ui, sans-serif', strokeWidth: 3, strokeColor: cssVar('--surface-1') },
        _payload: n,
      }
    })

    const visEdges = edges.map((e, i) => {
      const tone = healthTone(e?.health_status)
      const w = 1 + (edgeWeight(e) / maxW) * 7
      return {
        id: `e${i}`,
        from: e?.from,
        to: e?.to,
        label: `${fmtNum(e?.call_count)} · ${fmtMs(e?.avg_latency_ms)}`,
        width: Math.max(1, w),
        color: {
          color: pal[tone] || pal.neutral,
          highlight: pal.accent,
          hover: pal.accent,
          opacity: 0.85,
        },
        arrows: { to: { enabled: true, scaleFactor: 0.7 } },
        smooth: { type: 'curvedCW', roundness: 0.18 },
        dashes: tone === 'warn' || tone === 'error',
        font: { size: 11, color: pal.text, strokeWidth: 3, strokeColor: pal.surface2, align: 'top' },
        _payload: e,
      }
    })

    return { visNodes, visEdges }
  }, [nodes, edges])

  // Keep the click-handler lookup fresh.
  useEffect(() => {
    const nl = {}, el = {}
    graph.visNodes.forEach((n) => { nl[n.id] = n._payload })
    graph.visEdges.forEach((e) => { el[e.id] = e._payload })
    lookupRef.current = { nodes: nl, edges: el }
  }, [graph])

  // Create / recreate the network on data or layout change.
  useEffect(() => {
    if (!containerRef.current) return undefined
    if (networkRef.current) { networkRef.current.destroy(); networkRef.current = null }
    if (graph.visNodes.length === 0) return undefined

    const options = {
      layout: layout === 'hierarchical'
        ? { hierarchical: { direction: 'LR', sortMethod: 'directed', levelSeparation: 260, nodeSpacing: 140, treeSpacing: 220 } }
        : { improvedLayout: true },
      physics: layout === 'hierarchical'
        ? { enabled: false }
        : {
            enabled: true,
            stabilization: { iterations: 250, fit: true },
            barnesHut: { gravitationalConstant: -6000, centralGravity: 0.3, springLength: 180, springConstant: 0.04, damping: 0.12 },
          },
      nodes: {
        shadow: { enabled: true, color: 'rgba(0,0,0,0.35)', size: 8, x: 2, y: 2 },
        margin: 12,
        shapeProperties: { borderRadius: 6 },
      },
      edges: { selectionWidth: 2, labelHighlightBold: true },
      interaction: { hover: true, tooltipDelay: 150, zoomView: true, dragView: true, navigationButtons: false },
    }

    const net = new Network(containerRef.current, { nodes: graph.visNodes, edges: graph.visEdges }, options)
    networkRef.current = net

    net.on('click', (params) => {
      if (params.nodes?.length) {
        const p = lookupRef.current.nodes[params.nodes[0]]
        if (p) setSelected({ kind: 'node', data: p })
      } else if (params.edges?.length) {
        const p = lookupRef.current.edges[params.edges[0]]
        if (p) setSelected({ kind: 'edge', data: p })
      } else {
        setSelected(null)
      }
    })

    const t = setTimeout(() => { try { net.fit({ animation: { duration: 350 } }) } catch (_) { /* noop */ } }, 250)
    return () => { clearTimeout(t); if (networkRef.current) { networkRef.current.destroy(); networkRef.current = null } }
    // `graph` is memoized on the resolved payload, so this redraws whenever the
    // topology itself changes — keying on node/edge counts alone would keep a
    // stale graph when a different tenant happens to have the same shape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, graph])

  const zoom = (factor) => {
    const net = networkRef.current
    if (!net) return
    try { net.moveTo({ scale: net.getScale() * factor, animation: true }) } catch (_) { /* noop */ }
  }
  const fit = () => { try { networkRef.current?.fit({ animation: { duration: 350 } }) } catch (_) { /* noop */ } }

  // ---- Dependencies table (also the fallback if the graph can't draw) ------
  const maxCalls = Math.max(1, ...edges.map((e) => e?.call_count || 0))
  const depColumns = [
    { key: 'from', header: 'Source', render: (r) => <span className="oui-cell-primary oui-mono">{r?.from}</span>, sortValue: (r) => r?.from },
    { key: 'to', header: 'Target', render: (r) => (
      <span className="oui-row" style={{ gap: 6 }}>
        <span style={{ color: tierColor(r?.dependency_type || r?.scheme) }}>●</span>
        <span className="oui-mono">{r?.to}</span>
      </span>
    ), sortValue: (r) => r?.to },
    { key: 'hostport', header: 'Host:Port', render: (r) => <span className="oui-mono oui-text-muted">{hostPort(r)}</span>, sortValue: (r) => hostPort(r) },
    { key: 'resolved_host', header: 'Resolved', render: (r) => <span className="oui-mono oui-text-muted">{r?.resolved_host || '—'}</span>, sortValue: (r) => r?.resolved_host || '' },
    { key: 'call_count', header: 'Calls', num: true, sortValue: (r) => r?.call_count || 0, render: (r) => (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <InlineBar value={r?.call_count || 0} max={maxCalls} label={fmtNum(r?.call_count)} color="var(--accent)" width={90} />
      </div>
    ) },
    { key: 'p95_latency_ms', header: 'p95', num: true, sortValue: (r) => r?.p95_latency_ms || 0, render: (r) => (
      <span style={{ color: statusColor(latencyStatus(r?.p95_latency_ms)) }}>{fmtMs(r?.p95_latency_ms)}</span>
    ) },
    { key: 'error_rate', header: 'Error %', num: true, sortValue: (r) => r?.error_rate || 0, render: (r) => (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <InlineBar value={r?.error_rate || 0} max={100} label={fmtPct(r?.error_rate)} color={statusColor(errorRateStatus(r?.error_rate))} width={80} />
      </div>
    ) },
    { key: 'io', header: 'I/O (out / in)', num: true, sortValue: (r) => (r?.bytes_sent || 0) + (r?.bytes_received || 0), render: (r) => (
      <span className="oui-mono">
        <span style={{ color: 'var(--chart-1)' }}>↑{fmtBytes(r?.bytes_sent)}</span>
        <span className="oui-text-muted"> / </span>
        <span style={{ color: 'var(--chart-2)' }}>↓{fmtBytes(r?.bytes_received)}</span>
      </span>
    ) },
  ]

  const loading = map.loading
  const empty = !loading && nodes.length === 0
  const th = thresholds.data || {}

  return (
    <div className="oui-stack">
      <PageHeader
        title="Service Map"
        description={<>{kpis.services} service{kpis.services === 1 ? '' : 's'} · {kpis.deps} external dependenc{kpis.deps === 1 ? 'y' : 'ies'} · {kpis.edges} connection{kpis.edges === 1 ? '' : 's'}</>}
        actions={<><div className="oui-row">
          <SegmentedControl
            options={[{ value: 'force', label: 'Force' }, { value: 'hierarchical', label: 'Hierarchical' }]}
            value={layout}
            onChange={setLayout}
          />
          <button className="oui-btn is-secondary" onClick={() => setEditThresh((v) => !v)} title="Edit health thresholds">
            <FiSliders size={13} /> Thresholds
          </button>
        </div></>}
      />

      {editThresh && (
        <ThresholdsEditor
          key={JSON.stringify(th)}
          initial={th}
          onSaved={() => thresholds.reload()}
          onClose={() => setEditThresh(false)}
        />
      )}

      {/* Golden-signal KPIs across the topology */}
      <div className="oui-grid is-4" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <KpiTile label="Services" icon={<FiServer size={12} />} value={fmtNum(kpis.services)} status="neutral"
          footer={<span className="oui-text-muted" style={{ fontSize: 'var(--text-2xs)' }}>{fmtNum(kpis.deps)} external deps</span>} />
        <KpiTile label="Unhealthy" icon={<FiAlertTriangle size={12} />} value={fmtNum(kpis.unhealthy)}
          status={kpis.unhealthy > 0 ? 'error' : 'ok'} />
        <KpiTile label="Total calls" icon={<FiActivity size={12} />} value={fmtNum(kpis.totalCalls)} status="neutral" />
        <KpiTile label="Avg latency" icon={<FiClock size={12} />} value={fmtMs(kpis.avgLat)} status={latencyStatus(kpis.avgLat)} />
        <KpiTile label="Error rate" icon={<FiAlertTriangle size={12} />} value={fmtPct(kpis.errRate)} status={errorRateStatus(kpis.errRate)}
          footer={<span className="oui-text-muted" style={{ fontSize: 'var(--text-2xs)' }}>{fmtBytes(kpis.bytes)} transferred</span>} />
      </div>

      {/* Topology graph */}
      <Panel
        title="Topology" icon={<FiShare2 />} loading={loading} error={map.error} empty={empty}
        emptyText="No service dependencies found for the selected time range."
        actions={<span className="oui-text-muted" style={{ fontSize: 'var(--text-xs)' }}>click a node or edge for detail</span>}
      >
        <div className="smap-graph-wrap">
          <div ref={containerRef} className="smap-graph" />
          <div className="smap-graph-controls">
            <button onClick={() => zoom(1.3)} title="Zoom in"><FiZoomIn size={15} /></button>
            <button onClick={() => zoom(0.75)} title="Zoom out"><FiZoomOut size={15} /></button>
            <button onClick={fit} title="Fit to view"><FiMaximize2 size={15} /></button>
          </div>
          <div className="smap-legend">
            <span className="lg"><span className="lg-dot" style={{ background: 'var(--good-text)' }} /> Healthy</span>
            <span className="lg"><span className="lg-dot" style={{ background: 'var(--warn-text)' }} /> Degraded</span>
            <span className="lg"><span className="lg-dot" style={{ background: 'var(--critical-text)' }} /> Down</span>
            <span className="lg oui-text-muted"><FiGitBranch size={11} /> edge width = throughput</span>
          </div>
        </div>
      </Panel>

      {/* Dependencies table (rich under-used metrics + graph fallback) */}
      <Panel title="Dependencies" icon={<FiGitBranch />} flush loading={loading} error={map.error}
        empty={!loading && edges.length === 0} emptyText="No dependency edges.">
        <DataTable
          loading={loading}
          error={map.error}
          columns={depColumns} rows={edges} rowKey={(r, i) => `${r?.from}->${r?.to}-${i}`}
          initialSort={{ key: 'call_count', dir: 'desc' }}
          onRowClick={(r) => setSelected({ kind: 'edge', data: r })}
        />
      </Panel>

      {/* Entity drawer */}
      {selected && (
        <EntityDrawer selected={selected} thresholds={th} onClose={() => setSelected(null)} navigate={navigate} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline editor for the shared health thresholds (POST /api/service-map/thresholds).
// Edges turn amber past the "degraded" line and red past the "down" line.
function ThresholdsEditor({ initial, onSaved, onClose }) {
  const [form, setForm] = useState({
    degraded_latency_ms: initial.degraded_latency_ms ?? 1000,
    down_latency_ms: initial.down_latency_ms ?? 5000,
    degraded_error_rate: initial.degraded_error_rate ?? 10,
    down_error_rate: initial.down_error_rate ?? 50,
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const setNum = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    setSaving(true); setErr(null)
    try {
      await axios.post(`${API}/api/service-map/thresholds`, {
        degraded_latency_ms: Number(form.degraded_latency_ms),
        down_latency_ms: Number(form.down_latency_ms),
        degraded_error_rate: Number(form.degraded_error_rate),
        down_error_rate: Number(form.down_error_rate),
      })
      onSaved()
      onClose()
    } catch (e) {
      setErr(e.response?.data || e.message || 'Save failed')
    } finally { setSaving(false) }
  }

  const field = (label, key) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
      {label}
      <input className="oui-input" type="number" min="0" value={form[key]} onChange={setNum(key)} style={{ width: 130 }} />
    </label>
  )

  return (
    <Panel
      title="Health thresholds" icon={<FiSliders size={14} />}
      actions={<button className="oui-btn is-ghost" onClick={onClose} title="Close"><FiX size={13} /></button>}
    >
      <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {field('Degraded latency (ms)', 'degraded_latency_ms')}
        {field('Down latency (ms)', 'down_latency_ms')}
        {field('Degraded error rate (%)', 'degraded_error_rate')}
        {field('Down error rate (%)', 'down_error_rate')}
        <button className="oui-btn is-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save thresholds'}</button>
      </div>
      {err && <div className="oui-error-text" style={{ marginTop: 'var(--space-2)' }}>{String(err)}</div>}
      <div className="oui-text-muted" style={{ fontSize: 'var(--text-xs)', marginTop: 'var(--space-2)' }}>
        Applied across the topology: an edge is amber past the degraded line and red past the down line.
      </div>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
function Metric({ label, value, sub, wide, color }) {
  return (
    <div className={`smap-metric ${wide ? 'wide' : ''}`}>
      <div className="m-label">{label}</div>
      <div className="m-value" style={color ? { color } : undefined}>{value}</div>
      {sub != null && <div className="m-sub">{sub}</div>}
    </div>
  )
}

function KV({ k, v }) {
  return (
    <div className="smap-kv-row"><span className="k">{k}</span><span className="v">{v ?? '—'}</span></div>
  )
}

function EntityDrawer({ selected, thresholds, onClose, navigate }) {
  const isNode = selected.kind === 'node'
  const d = selected.data || {}

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="smap-drawer-scrim" onClick={onClose} />
      <aside className="smap-drawer" role="dialog" aria-label="Entity details">
        <div className="smap-drawer-head">
          <span className="icon">{isNode ? <TypeIcon type={d.node_type} /> : <FiGitBranch />}</span>
          <div className="titles">
            <h3>{isNode ? (d.service || d.id) : `${d.from} → ${d.to}`}</h3>
            <div className="sub">
              {isNode
                ? <StatusPill tone={healthTone(d.health_status)}>{d.health_status || 'unknown'}</StatusPill>
                : <StatusPill tone={healthTone(d.health_status)}>{d.dependency_type || 'dependency'}</StatusPill>}
            </div>
          </div>
          <button className="smap-drawer-close" onClick={onClose} aria-label="Close"><FiX /></button>
        </div>

        <div className="smap-drawer-body">
          {isNode ? <NodeBody d={d} /> : <EdgeBody d={d} thresholds={thresholds} />}

          {isNode ? (
            <button
              className="oui-btn is-secondary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
              onClick={() => navigate(`/traces?service=${encodeURIComponent(d.service || d.id)}`)}
            >
              <FiActivity size={13} /> View traces
            </button>
          ) : (
            <EdgeTraces d={d} navigate={navigate} />
          )}
        </div>
      </aside>
    </>
  )
}

function NodeBody({ d }) {
  return (
    <>
      <div className="smap-section">
        <div className="smap-section-title">Golden signals</div>
        <div className="smap-metrics">
          <Metric label="Throughput" value={`${fmtNum(d.throughput)} rps`} />
          <Metric label="Total spans" value={fmtNum(d.total_spans)} />
          <Metric label="Avg latency" value={fmtMs(d.avg_duration)} color={statusColor(latencyStatus(d.avg_duration))}
            sub={`min ${fmtMs(d.min_duration)} · max ${fmtMs(d.max_duration)}`} />
          <Metric label="p95 / p99" value={fmtMs(d.p95_duration)} sub={`p99 ${fmtMs(d.p99_duration)}`}
            color={statusColor(latencyStatus(d.p95_duration))} />
          <Metric label="Error rate" value={fmtPct(d.error_rate)} color={statusColor(errorRateStatus(d.error_rate))} />
          <Metric label="Traffic" value={fmtBytes(d.total_traffic)} />
        </div>
      </div>
      <div className="smap-section">
        <div className="smap-section-title">Connectivity</div>
        <div className="smap-metrics">
          <Metric label="Incoming calls" value={fmtNum(d.incoming_calls)} />
          <Metric label="Outgoing calls" value={fmtNum(d.outgoing_calls)} />
        </div>
      </div>
      <div className="smap-section">
        <div className="smap-section-title">Identity</div>
        <div className="smap-kv">
          <KV k="Service" v={<span className="oui-mono">{d.service || d.id}</span>} />
          <KV k="Type" v={d.node_type || 'service'} />
        </div>
      </div>
    </>
  )
}

function EdgeBody({ d, thresholds }) {
  const sent = d.bytes_sent || 0
  const recv = d.bytes_received || 0
  const maxIo = Math.max(1, sent, recv)
  const successRate = d.success_rate != null ? d.success_rate : (d.error_rate != null ? 100 - d.error_rate : null)
  return (
    <>
      <div className="smap-section">
        <div className="smap-section-title">Latency</div>
        <div className="smap-metrics">
          <Metric label="Avg" value={fmtMs(d.avg_latency_ms)} color={statusColor(latencyStatus(d.avg_latency_ms))} />
          <Metric label="p95" value={fmtMs(d.p95_latency_ms)} color={statusColor(latencyStatus(d.p95_latency_ms))} />
          <Metric label="p99" value={fmtMs(d.p99_latency_ms)} />
          <Metric label="min / max" value={fmtMs(d.min_latency_ms)} sub={`max ${fmtMs(d.max_latency_ms)}`} />
        </div>
      </div>

      <div className="smap-section">
        <div className="smap-section-title">Traffic & reliability</div>
        <div className="smap-metrics">
          <Metric label="Call count" value={fmtNum(d.call_count)} />
          <Metric label="Throughput" value={`${fmtNum(d.throughput)} rps`} />
          <Metric label="Success rate" value={fmtPct(successRate)} color="var(--good-text)" />
          <Metric label="Error rate" value={fmtPct(d.error_rate)} color={statusColor(errorRateStatus(d.error_rate))} />
        </div>
      </div>

      <div className="smap-section">
        <div className="smap-section-title">Data transfer</div>
        <div className="smap-io">
          <div className="smap-io-row">
            <span className="io-cap"><FiArrowUpRight size={11} /> out</span>
            <span className="smap-io-track"><span className="smap-io-fill" style={{ width: `${(sent / maxIo) * 100}%`, background: 'var(--chart-1)' }} /></span>
            <span className="io-val">{fmtBytes(sent)}</span>
          </div>
          <div className="smap-io-row">
            <span className="io-cap"><FiArrowDownLeft size={11} /> in</span>
            <span className="smap-io-track"><span className="smap-io-fill" style={{ width: `${(recv / maxIo) * 100}%`, background: 'var(--chart-2)' }} /></span>
            <span className="io-val">{fmtBytes(recv)}</span>
          </div>
        </div>
      </div>

      <div className="smap-section">
        <div className="smap-section-title">Connection</div>
        <div className="smap-kv">
          <KV k="From → To" v={<span className="oui-mono">{d.from} → {d.to}</span>} />
          <KV k="Type" v={d.dependency_type} />
          <KV k="Scheme" v={d.scheme} />
          <KV k="Host:Port" v={<span className="oui-mono">{hostPort(d)}</span>} />
          <KV k="Resolved host" v={<span className="oui-mono">{d.resolved_host || '—'}</span>} />
        </div>
      </div>

      {(thresholds.degraded_latency_ms || thresholds.down_latency_ms) && (
        <div className="smap-section">
          <div className="smap-section-title">Thresholds</div>
          <div className="smap-kv">
            <KV k="Degraded latency" v={fmtMs(thresholds.degraded_latency_ms)} />
            <KV k="Down latency" v={fmtMs(thresholds.down_latency_ms)} />
            <KV k="Degraded error %" v={fmtPct(thresholds.degraded_error_rate)} />
            <KV k="Down error %" v={fmtPct(thresholds.down_error_rate)} />
          </div>
        </div>
      )}
    </>
  )
}

// Traces that actually crossed this edge — the parent(from)/child(to) self-join
// (GET /api/service-map/edge-traces). Service→service edges resolve to a concrete
// trace list; external-dep edges (redis/db/http hosts aren't traced services)
// return nothing, so we fall back to the calling service's traces.
function EdgeTraces({ d, navigate }) {
  const q = useApi('/api/service-map/edge-traces', { from_service: d.from, to_service: d.to })
  const traces = q.data?.traces || []
  const viewAll = (
    <button
      className="oui-btn is-secondary"
      style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
      onClick={() => navigate(`/traces?service=${encodeURIComponent(d.from)}`)}
    >
      <FiActivity size={13} /> View all traces from {d.from}
    </button>
  )
  return (
    <div className="smap-section">
      <div className="smap-section-title">Traces on this edge</div>
      {q.loading ? (
        <div className="oui-text-muted" style={{ fontSize: 'var(--text-xs)' }}>Loading…</div>
      ) : traces.length === 0 ? (
        <>
          <div className="oui-text-muted" style={{ fontSize: 'var(--text-xs)', marginBottom: 8 }}>
            No service-to-service traces on this edge
            {d.dependency_type && d.dependency_type !== 'service' ? ` — external ${d.dependency_type} dependency` : ''}.
          </div>
          {viewAll}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {traces.slice(0, 12).map((t) => (
            <button
              key={t.trace_id}
              className="oui-btn is-ghost"
              style={{ justifyContent: 'space-between', width: '100%', fontSize: 'var(--text-xs)' }}
              onClick={() => navigate(`/traces/${encodeURIComponent(t.trace_id)}`)}
              title={`Open trace ${t.trace_id}`}
            >
              <span className="oui-mono">{String(t.trace_id || '').slice(0, 14)}</span>
              <span style={{ color: statusColor(latencyStatus(t.duration_ms)) }}>{fmtMs(t.duration_ms)}</span>
              <span className="oui-text-muted">{fmtAgo(t.created_at)}</span>
            </button>
          ))}
          {viewAll}
        </div>
      )}
    </div>
  )
}
