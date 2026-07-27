import React, { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  FiGitBranch, FiClock, FiDatabase, FiServer, FiActivity, FiX,
  FiArrowUp, FiArrowDown, FiChevronLeft, FiFileText, FiGlobe,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import {
  Panel, DataTable, EntityHeader, Badge, StatusPill, LanguageBadge,
} from '../components/ui'
import { fmtMs, fmtBytes, fmtNum, fmtAgo, tierColor, statusColor, latencyStatus, SERIES } from '../theme/format'
import './TraceDetail.css'

const TIERS = ['app', 'db', 'redis', 'http']
const TIER_LABEL = { app: 'App / PHP', db: 'Database', redis: 'Redis', http: 'HTTP' }

// Classify a span into a breakdown tier from its name/service.
function spanTier(span) {
  const n = String(span?.name || '').toLowerCase()
  if (n.includes('pdo') || n.includes('sql') || n.includes('select') || n.includes('mysql') ||
      n.includes('query') || n.includes('insert') || n.includes('update') || n.includes('delete')) return 'db'
  if (n.includes('redis') || n.includes('cache')) return 'redis'
  if (n.includes('curl') || n.includes('http') || n.includes('guzzle') || n.includes('fetch')) return 'http'
  return 'app'
}

function toneForLevel(level) {
  const l = String(level || '').toUpperCase()
  if (l === 'ERROR' || l === 'CRITICAL' || l === 'FATAL') return 'error'
  if (l === 'WARN' || l === 'WARNING') return 'warn'
  if (l === 'INFO' || l === 'NOTICE') return 'ok'
  return 'neutral'
}

// Flatten a span tree (root.children) into rows carrying depth; fall back to a flat list.
function flattenTree(root, flat) {
  const out = []
  const walk = (node, depth) => {
    if (!node) return
    out.push({ ...node, _depth: depth })
    ;(node.children || []).forEach((c) => walk(c, depth + 1))
  }
  if (root) walk(root, 0)
  if (out.length === 0 && Array.isArray(flat)) flat.forEach((s) => out.push({ ...s, _depth: 0 }))
  return out
}

export default function TraceDetail() {
  const { traceId } = useParams()
  const navigate = useNavigate()
  const [selected, setSelected] = useState(null)

  const trace = useApi(`/api/traces/${traceId}`, {}, { noRange: true })
  const logsQ = useApi(`/api/traces/${traceId}/logs`, {}, { noRange: true })

  const data = trace.data || {}
  const root = data.root || null
  const flatSpans = Array.isArray(data.spans) ? data.spans : []

  // Ordered waterfall rows.
  const rows = useMemo(() => {
    const r = flattenTree(root, flatSpans)
    return r.slice().sort((a, b) => (a.start_ts || 0) - (b.start_ts || 0))
  }, [root, flatSpans])

  const traceStart = rows.length ? Math.min(...rows.map((s) => s.start_ts || 0)) : 0
  const traceEnd = rows.length ? Math.max(...rows.map((s) => s.end_ts || (s.start_ts || 0))) : 0
  const totalMs = Math.max(1, root?.duration_ms || (traceEnd - traceStart) || 1)

  // Distributed tracing: a trace can span multiple services (same trace id
  // propagated via W3C traceparent). Assign each service a stable color and mark
  // the spans where the service changes from its parent (a cross-service hop).
  const services = useMemo(() => [...new Set(rows.map((s) => s.service).filter(Boolean))], [rows])
  const multiService = services.length > 1
  const serviceColor = useMemo(() => {
    const m = {}
    services.forEach((s, i) => { m[s] = SERIES[i % SERIES.length] })
    return m
  }, [services])
  const svcBySpanId = useMemo(() => {
    const m = {}
    rows.forEach((s) => { if (s.span_id) m[s.span_id] = s.service })
    return m
  }, [rows])
  const isServiceEntry = (s) => s.service && s.parent_id && svcBySpanId[s.parent_id] && svcBySpanId[s.parent_id] !== s.service

  // Aggregate per-operation collections across every span (defensive).
  const allSql = useMemo(() => rows.flatMap((s) => s.sql || []), [rows])
  const allRedis = useMemo(() => rows.flatMap((s) => s.redis || []), [rows])
  const allHttp = useMemo(() => rows.flatMap((s) => s.http || []), [rows])

  const totalCpu = rows.reduce((a, s) => a + (s.cpu_ms || 0), 0)
  const anyError = rows.some((s) => String(s.status || '').toLowerCase() === 'error')

  // Response-time breakdown by tier (sum op durations; app = remainder / self-time).
  const breakdown = useMemo(() => {
    const db = allSql.reduce((a, x) => a + (x.duration_ms || 0), 0)
    const redis = allRedis.reduce((a, x) => a + (x.duration_ms || 0), 0)
    const http = allHttp.reduce((a, x) => a + (x.duration_ms || 0), 0)
    const app = Math.max(0, totalMs - db - redis - http)
    return { app, db, redis, http }
  }, [allSql, allRedis, allHttp, totalMs])
  const breakdownTotal = Math.max(1, TIERS.reduce((a, t) => a + breakdown[t], 0))

  // Network I/O — prefer root.net, else sum across spans.
  const net = useMemo(() => {
    const acc = { bytes_in: 0, bytes_out: 0, in_by_type: {}, out_by_type: {} }
    const src = root?.net ? [root] : rows
    src.forEach((s) => {
      const n = s.net || {}
      acc.bytes_in += n.bytes_in || 0
      acc.bytes_out += n.bytes_out || 0
      ;['db', 'http', 'redis'].forEach((k) => {
        acc.in_by_type[k] = (acc.in_by_type[k] || 0) + ((n.in_by_type || {})[k] || 0)
        acc.out_by_type[k] = (acc.out_by_type[k] || 0) + ((n.out_by_type || {})[k] || 0)
      })
    })
    return acc
  }, [root, rows])

  const logs = logsQ.data?.logs || []

  // ---- render helpers ----
  const stackedBar = (parts, total) => (
    <div className="tb-bar">
      {parts.map((p) => {
        const pct = total > 0 ? (p.value / total) * 100 : 0
        if (pct <= 0) return null
        return <div key={p.key} className="tb-seg" style={{ width: `${pct}%`, background: p.color }} title={`${p.label}: ${p.display}`} />
      })}
    </div>
  )

  const netTotal = Math.max(1, net.bytes_out, net.bytes_in)
  const dtParts = (byType) => ['db', 'http', 'redis'].map((k) => ({
    key: k, value: byType[k] || 0, color: tierColor(k), label: TIER_LABEL[k] || k, display: fmtBytes(byType[k] || 0),
  }))

  // ---- op tables ----
  const sqlCols = [
    { key: 'query', header: 'Query', render: (r) => (
      <span className="td-sql" title={r.query}>{r.query || '—'}</span>
    ), sortValue: (r) => r.query },
    { key: 'query_type', header: 'Type', render: (r) => <Badge>{r.query_type || r.type || '—'}</Badge>, sortValue: (r) => r.query_type },
    { key: 'db_system', header: 'System', render: (r) => <span className="opa-muted">{r.db_system || '—'}</span> },
    { key: 'duration_ms', header: 'Duration', num: true, render: (r) => <span style={{ color: `var(--${latencyStatus(r.duration_ms)})` }}>{fmtMs(r.duration_ms)}</span> },
    { key: 'rows_affected', header: 'Rows', num: true, render: (r) => (r.rows_affected == null || r.rows_affected < 0 ? '—' : fmtNum(r.rows_affected)) },
    { key: 'io', header: 'Out / In', num: true, sortValue: (r) => (r.bytes_out || 0) + (r.bytes_in || 0), render: (r) => (
      <span className="opa-mono"><span style={{ color: 'var(--tier-app)' }}>↑{fmtBytes(r.bytes_out)}</span> <span className="opa-muted">/</span> <span style={{ color: 'var(--tier-db)' }}>↓{fmtBytes(r.bytes_in)}</span></span>
    ) },
  ]

  const redisCols = [
    { key: 'command', header: 'Command', render: (r) => <span className="opa-mono cell-strong" style={{ color: 'var(--tier-redis)' }}>{r.command || '—'}</span> },
    { key: 'key', header: 'Key', render: (r) => <span className="opa-mono opa-muted" title={r.key}>{r.key || '—'}</span> },
    { key: 'hit', header: 'Hit', render: (r) => (r.hit == null ? '—' : <StatusPill tone={r.hit ? 'ok' : 'warn'}>{r.hit ? 'HIT' : 'MISS'}</StatusPill>) },
    { key: 'duration_ms', header: 'Duration', num: true, render: (r) => <span style={{ color: `var(--${latencyStatus(r.duration_ms)})` }}>{fmtMs(r.duration_ms)}</span> },
    { key: 'io', header: 'Out / In', num: true, sortValue: (r) => (r.bytes_out || 0) + (r.bytes_in || 0), render: (r) => (
      <span className="opa-mono"><span style={{ color: 'var(--tier-app)' }}>↑{fmtBytes(r.bytes_out)}</span> <span className="opa-muted">/</span> <span style={{ color: 'var(--tier-db)' }}>↓{fmtBytes(r.bytes_in)}</span></span>
    ) },
  ]

  const httpCols = [
    { key: 'method', header: 'Method', render: (r) => <Badge>{r.method || '—'}</Badge> },
    { key: 'url', header: 'URL', render: (r) => <span className="opa-mono td-sql" title={r.url}>{r.url || r.uri || '—'}</span>, sortValue: (r) => r.url || r.uri },
    { key: 'status_code', header: 'Status', num: true, render: (r) => <span style={{ color: statusColor(r.status_code) }}>{r.status_code ?? '—'}</span> },
    { key: 'duration_ms', header: 'Duration', num: true, render: (r) => <span style={{ color: `var(--${latencyStatus(r.duration_ms)})` }}>{fmtMs(r.duration_ms)}</span> },
    { key: 'io', header: 'Req / Resp', num: true, sortValue: (r) => (r.request_size || 0) + (r.response_size || 0), render: (r) => (
      <span className="opa-mono"><span style={{ color: 'var(--tier-app)' }}>↑{fmtBytes(r.request_size ?? r.bytes_sent)}</span> <span className="opa-muted">/</span> <span style={{ color: 'var(--tier-http)' }}>↓{fmtBytes(r.response_size ?? r.bytes_received)}</span></span>
    ) },
  ]

  const loading = trace.loading
  const empty = !loading && !trace.error && rows.length === 0

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <button className="td-drawer-close" style={{ float: 'left', marginRight: 10 }} onClick={() => navigate(-1)} title="Back">
            <FiChevronLeft size={15} />
          </button>
          <h1 className="opa-page-title">Trace</h1>
          <div className="opa-page-sub">Distributed trace forensics</div>
        </div>
      </div>

      <EntityHeader
        title={traceId}
        subtitle={root?.name ? `${root.name} · ${rows.length} span${rows.length === 1 ? '' : 's'}` : `${rows.length} spans`}
        badges={
          <>
            <StatusPill tone={anyError ? 'error' : statusPillTone(root?.status)}>{anyError ? 'ERROR' : String(root?.status || 'ok').toUpperCase()}</StatusPill>
            {(multiService ? services : [root?.service].filter(Boolean)).map((svc) => (
              <span key={svc} className="opa-badge" title={multiService ? 'service in this distributed trace' : 'service'}>
                <span className="opa-dot" style={{ background: multiService ? serviceColor[svc] : 'var(--tier-app)', width: 7, height: 7 }} />{svc}
              </span>
            ))}
            {multiService && <Badge title="distributed trace spanning multiple services">{services.length} services</Badge>}
            {root?.language && <LanguageBadge language={root.language} version={root.language_version} />}
          </>
        }
        meta={
          <div className="opa-row" style={{ gap: 'var(--sp-5, 22px)' }}>
            <div className="td-metastat"><span className="k">Duration</span><span className="v" style={{ color: `var(--${latencyStatus(totalMs)})` }}>{fmtMs(totalMs)}</span></div>
            <div className="td-metastat"><span className="k">CPU</span><span className="v">{fmtMs(totalCpu)}</span></div>
            <div className="td-metastat"><span className="k">Egress</span><span className="v">{fmtBytes(net.bytes_out)}</span></div>
            <div className="td-metastat"><span className="k">Ingress</span><span className="v">{fmtBytes(net.bytes_in)}</span></div>
          </div>
        }
      />

      {/* Waterfall */}
      <Panel title="Trace waterfall" icon={<FiGitBranch />} loading={loading} error={trace.error} empty={empty}
        actions={<span className="opa-muted" style={{ fontSize: 'var(--fs-12)' }}>click a span for detail</span>}>
        <div className="tw-wrap">
          <div className="tw-axis">
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <div key={f} className="tw-axis-tick" style={{ left: `calc(240px + 10px + (100% - 240px - 10px - 74px - 10px) * ${f})` }}>
                {fmtMs(totalMs * f)}
              </div>
            ))}
          </div>
          {rows.map((s) => {
            const offset = totalMs > 0 ? ((s.start_ts - traceStart) / totalMs) * 100 : 0
            const width = Math.max(0.8, ((s.duration_ms || 0) / totalMs) * 100)
            const tier = spanTier(s)
            const col = tierColor(tier)
            const isSel = selected && selected.span_id === s.span_id
            return (
              <div key={s.span_id} className={`tw-row ${isSel ? 'is-selected' : ''}`} onClick={() => setSelected(s)}>
                <div className="tw-label" style={{ paddingLeft: (s._depth || 0) * 14 }}>
                  {multiService && <span className="tw-tierdot" style={{ background: serviceColor[s.service] || 'var(--neutral)' }} title={s.service} />}
                  <span className="tw-tierdot" style={{ background: col }} />
                  <span className="tw-label-name" title={`${s.name} · ${s.service || ''}`}>{s.name}</span>
                  {isServiceEntry(s) && (
                    <span className="opa-badge" style={{ marginLeft: 6, padding: '0 6px' }} title={`enters ${s.service}`}>
                      <span className="opa-dot" style={{ background: serviceColor[s.service], width: 6, height: 6 }} />{s.service}
                    </span>
                  )}
                </div>
                <div className="tw-track">
                  <div className="tw-bar" style={{ left: `${Math.min(99, Math.max(0, offset))}%`, width: `${width}%`, background: multiService ? (serviceColor[s.service] || col) : col }}
                    title={`${s.name}${s.service ? ' · ' + s.service : ''}: ${fmtMs(s.duration_ms)} @ +${fmtMs(s.start_ts - traceStart)}`} />
                </div>
                <div className="tw-dur" style={{ color: `var(--${latencyStatus(s.duration_ms)})` }}>{fmtMs(s.duration_ms)}</div>
              </div>
            )
          })}
        </div>
      </Panel>

      {/* Breakdown + Network I/O */}
      <div className="opa-grid cols-2">
        <Panel title="Response-time breakdown" icon={<FiClock />} loading={loading} error={trace.error} empty={empty}>
          {stackedBar(
            TIERS.map((t) => ({ key: t, value: breakdown[t], color: tierColor(t), label: TIER_LABEL[t], display: fmtMs(breakdown[t]) })),
            breakdownTotal,
          )}
          <div className="tb-legend">
            {TIERS.map((t) => (
              <div key={t} className="tb-legend-item">
                <span className="tb-swatch" style={{ background: tierColor(t) }} />
                {TIER_LABEL[t]}
                <span className="tb-legend-val">{fmtMs(breakdown[t])}</span>
                <span className="opa-muted">({Math.round((breakdown[t] / breakdownTotal) * 100)}%)</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Network I/O by tier" icon={<FiActivity />} loading={loading} error={trace.error} empty={empty}
          actions={<span className="opa-muted" style={{ fontSize: 'var(--fs-12)' }}>bytes moved on the wire</span>}>
          <div className="dt-row">
            <div className="dt-dir"><FiArrowUp size={13} style={{ color: 'var(--tier-http)' }} /> Egress</div>
            {stackedBar(dtParts(net.out_by_type), netTotal)}
            <div className="dt-total">{fmtBytes(net.bytes_out)}</div>
          </div>
          <div className="dt-row">
            <div className="dt-dir"><FiArrowDown size={13} style={{ color: 'var(--tier-db)' }} /> Ingress</div>
            {stackedBar(dtParts(net.in_by_type), netTotal)}
            <div className="dt-total">{fmtBytes(net.bytes_in)}</div>
          </div>
          <div className="tb-legend">
            {['db', 'http', 'redis'].map((t) => (
              <div key={t} className="tb-legend-item">
                <span className="tb-swatch" style={{ background: tierColor(t) }} />
                {TIER_LABEL[t]}
                <span className="tb-legend-val">↑{fmtBytes(net.out_by_type[t] || 0)} ↓{fmtBytes(net.in_by_type[t] || 0)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Operation tables */}
      <Panel title="SQL queries" icon={<FiDatabase />} flush loading={loading} error={trace.error}
        empty={!loading && allSql.length === 0} emptyText="No SQL in this trace"
        actions={<Badge>{fmtNum(allSql.length)} queries</Badge>}>
        <DataTable columns={sqlCols} rows={allSql} rowKey={(r, i) => i}
          initialSort={{ key: 'duration_ms', dir: 'desc' }} maxHeight={340} />
      </Panel>

      <div className="opa-grid cols-2">
        <Panel title="Redis" icon={<FiServer />} flush loading={loading} error={trace.error}
          empty={!loading && allRedis.length === 0} emptyText="No Redis ops"
          actions={<Badge>{fmtNum(allRedis.length)} ops</Badge>}>
          <DataTable columns={redisCols} rows={allRedis} rowKey={(r, i) => i}
            initialSort={{ key: 'duration_ms', dir: 'desc' }} maxHeight={340} />
        </Panel>
        <Panel title="HTTP calls" icon={<FiGlobe />} flush loading={loading} error={trace.error}
          empty={!loading && allHttp.length === 0} emptyText="No outbound HTTP"
          actions={<Badge>{fmtNum(allHttp.length)} calls</Badge>}>
          <DataTable columns={httpCols} rows={allHttp} rowKey={(r, i) => i}
            initialSort={{ key: 'duration_ms', dir: 'desc' }} maxHeight={340} />
        </Panel>
      </div>

      {/* Logs */}
      <Panel title="Correlated logs" icon={<FiFileText />} flush loading={logsQ.loading} error={logsQ.error}
        empty={!logsQ.loading && logs.length === 0} emptyText="No logs for this trace"
        actions={<Badge>{fmtNum(logsQ.data?.count ?? logs.length)} entries</Badge>}>
        <DataTable
          columns={[
            { key: 'level', header: 'Level', width: 84, render: (r) => <StatusPill tone={toneForLevel(r.level)}>{String(r.level || '—').toUpperCase()}</StatusPill> },
            { key: 'message', header: 'Message', render: (r) => <span className="opa-mono" style={{ fontSize: 'var(--fs-12)' }}>{r.message || '—'}</span> },
            { key: 'service', header: 'Service', render: (r) => <span className="opa-muted">{r.service || '—'}</span> },
            { key: 'timestamp', header: 'When', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.timestamp)}</span>, sortValue: (r) => Date.parse(r.timestamp) || 0 },
          ]}
          rows={logs} rowKey={(r, i) => r.id || i}
          initialSort={{ key: 'timestamp', dir: 'desc' }} maxHeight={340}
        />
      </Panel>

      {/* Span drawer */}
      {selected && <SpanDrawer span={selected} traceStart={traceStart} onClose={() => setSelected(null)} />}
    </div>
  )
}

function statusPillTone(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'error') return 'error'
  if (s === 'warn' || s === 'warning') return 'warn'
  if (s === 'ok' || s === 'success') return 'ok'
  return 'neutral'
}

function SpanDrawer({ span, traceStart, onClose }) {
  const sql = span.sql || []
  const redis = span.redis || []
  const http = span.http || []
  const net = span.net || {}
  const tier = spanTier(span)

  return (
    <>
      <div className="td-drawer-overlay" onClick={onClose} />
      <div className="td-drawer" role="dialog" aria-label="Span detail">
        <div className="td-drawer-head">
          <div style={{ minWidth: 0 }}>
            <div className="opa-row" style={{ gap: 8 }}>
              <span className="tw-tierdot" style={{ background: tierColor(tier) }} />
              <span className="opa-mono cell-strong" style={{ fontSize: 'var(--fs-15)' }}>{span.name}</span>
            </div>
            <div className="opa-row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <StatusPill tone={statusPillTone(span.status)}>{String(span.status || 'ok').toUpperCase()}</StatusPill>
              {span.service && <Badge>{span.service}</Badge>}
              <span className="opa-mono opa-muted" style={{ fontSize: 'var(--fs-11)' }}>{span.span_id}</span>
            </div>
          </div>
          <button className="td-drawer-close" onClick={onClose} title="Close"><FiX size={15} /></button>
        </div>

        <div className="td-drawer-body">
          <div className="opa-grid cols-3" style={{ gap: 12 }}>
            <div className="td-metastat"><span className="k">Duration</span><span className="v" style={{ color: `var(--${latencyStatus(span.duration_ms)})` }}>{fmtMs(span.duration_ms)}</span></div>
            <div className="td-metastat"><span className="k">CPU</span><span className="v">{fmtMs(span.cpu_ms)}</span></div>
            <div className="td-metastat"><span className="k">Start</span><span className="v">+{fmtMs((span.start_ts || 0) - traceStart)}</span></div>
          </div>

          {net && (net.bytes_in != null || net.bytes_out != null) && (
            <div>
              <div className="td-drawer-sub">Network</div>
              <div className="opa-row" style={{ gap: 20 }}>
                <span className="opa-mono"><FiArrowUp size={12} /> {fmtBytes(net.bytes_out)}</span>
                <span className="opa-mono"><FiArrowDown size={12} /> {fmtBytes(net.bytes_in)}</span>
              </div>
            </div>
          )}

          {sql.length > 0 && (
            <div>
              <div className="td-drawer-sub">SQL ({sql.length})</div>
              {sql.map((q, i) => (
                <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
                  <div className="opa-mono" style={{ fontSize: 'var(--fs-12)', color: 'var(--text-primary)', wordBreak: 'break-word' }}>{q.query}</div>
                  <div className="opa-row opa-muted" style={{ gap: 14, marginTop: 4, fontSize: 'var(--fs-11)' }}>
                    <span>{q.query_type || q.type}</span>
                    <span style={{ color: `var(--${latencyStatus(q.duration_ms)})` }}>{fmtMs(q.duration_ms)}</span>
                    <span>{q.rows_affected != null && q.rows_affected >= 0 ? `${fmtNum(q.rows_affected)} rows` : ''}</span>
                    <span>↑{fmtBytes(q.bytes_out)} ↓{fmtBytes(q.bytes_in)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {redis.length > 0 && (
            <div>
              <div className="td-drawer-sub">Redis ({redis.length})</div>
              {redis.map((r, i) => (
                <div key={i} className="opa-row" style={{ justifyContent: 'space-between', gap: 10, marginBottom: 6, fontSize: 'var(--fs-12)' }}>
                  <span className="opa-mono"><span style={{ color: 'var(--tier-redis)' }}>{r.command}</span> <span className="opa-muted">{r.key}</span></span>
                  <span className="opa-row" style={{ gap: 10 }}>
                    {r.hit != null && <StatusPill tone={r.hit ? 'ok' : 'warn'}>{r.hit ? 'HIT' : 'MISS'}</StatusPill>}
                    <span className="opa-mono" style={{ color: `var(--${latencyStatus(r.duration_ms)})` }}>{fmtMs(r.duration_ms)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {http.length > 0 && (
            <div>
              <div className="td-drawer-sub">HTTP ({http.length})</div>
              {http.map((h, i) => (
                <div key={i} style={{ marginBottom: 8, fontSize: 'var(--fs-12)' }}>
                  <div className="opa-mono" style={{ wordBreak: 'break-all' }}>
                    <Badge>{h.method}</Badge> <span style={{ color: statusColor(h.status_code) }}>{h.status_code}</span> {h.url || h.uri}
                  </div>
                  <div className="opa-row opa-muted" style={{ gap: 14, marginTop: 3, fontSize: 'var(--fs-11)' }}>
                    <span style={{ color: `var(--${latencyStatus(h.duration_ms)})` }}>{fmtMs(h.duration_ms)}</span>
                    <span>↑{fmtBytes(h.request_size ?? h.bytes_sent)} ↓{fmtBytes(h.response_size ?? h.bytes_received)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {sql.length === 0 && redis.length === 0 && http.length === 0 && (
            <div className="opa-muted" style={{ fontSize: 'var(--fs-12)' }}>No operations recorded on this span.</div>
          )}
        </div>
      </div>
    </>
  )
}
