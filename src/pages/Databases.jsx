import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiDatabase, FiHardDrive, FiLayers, FiZap, FiActivity, FiTarget, FiServer, FiAlertTriangle } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import {
  Panel, KpiTile, DataTable, InlineBar, Badge, StatusPill,
} from '../components/ui'
import { fmtMs, fmtNum, fmtPct, fmtAgo, latencyStatus } from '../theme/format'

const TABS = [
  { value: 'instances', label: 'Instances', icon: <FiServer size={13} /> },
  { value: 'sql', label: 'App SQL', icon: <FiDatabase size={13} /> },
  { value: 'statements', label: 'DB statements', icon: <FiZap size={13} /> },
  { value: 'redis', label: 'Redis / Cache', icon: <FiHardDrive size={13} /> },
]

function Tabs({ tabs = [], value, onChange }) {
  return (
    <div className="opa-tabs">
      {tabs.map((t) => (
        <button key={t.value} className={`opa-tab ${value === t.value ? 'active' : ''}`} onClick={() => onChange(t.value)}>
          {t.icon}{t.label}
        </button>
      ))}
    </div>
  )
}

function hitRate(r) {
  const hit = r.hit_count || 0
  const miss = r.miss_count || 0
  const tot = hit + miss
  return tot > 0 ? (hit / tot) * 100 : null
}

function metricNum(m, key) {
  if (!m || m[key] == null) return null
  const n = Number(m[key])
  return Number.isFinite(n) ? n : null
}

export default function Databases() {
  const [tab, setTab] = useState('instances')
  const navigate = useNavigate()

  const sql = useApi('/api/sql/queries', { limit: 200, sort: 'execution_count', order: 'desc' })
  const redis = useApi('/api/redis/operations', { limit: 200 })
  const instances = useApi('/api/db/instances', {}, { noRange: true })
  const statements = useApi('/api/db/statements', {}, { noRange: true })
  const matchRate = useApi('/api/db/fingerprint-match', {}, { noRange: true })
  const unused = useApi('/api/db/unused-indexes', {}, { noRange: true })

  const queries = sql.data?.queries || []
  const sqlTotal = sql.data?.total ?? queries.length
  const ops = redis.data?.operations || []
  const inst = instances.data?.instances || []
  const stmts = statements.data?.statements || []
  const unusedIdx = unused.data?.indexes || []

  const sqlExecs = queries.reduce((a, q) => a + (q.execution_count || 0), 0)
  const maxSqlExec = Math.max(1, ...queries.map((q) => q.execution_count || 0))
  const slowestP95 = queries.reduce((m, q) => Math.max(m, q.p95_duration || 0), 0)
  const redisExecs = ops.reduce((a, o) => a + (o.execution_count || 0), 0)
  const maxRedisExec = Math.max(1, ...ops.map((o) => o.execution_count || 0))
  const totHits = ops.reduce((a, o) => a + (o.hit_count || 0), 0)
  const totMiss = ops.reduce((a, o) => a + (o.miss_count || 0), 0)
  const overallHit = (totHits + totMiss) > 0 ? (totHits / (totHits + totMiss)) * 100 : null
  const hitStatus = (pct) => (pct == null ? 'neutral' : pct >= 90 ? 'ok' : pct >= 70 ? 'warn' : 'error')
  const maxStmtTime = Math.max(1, ...stmts.map((s) => Number(s.total_time_ms) || 0))

  const sqlColumns = [
    { key: 'fingerprint', header: 'Query', render: (r) => (
      <span className="cell-strong opa-mono" title={r.fingerprint} style={{ display: 'block', maxWidth: 460, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--tier-db)' }}>{r.fingerprint || '—'}</span>
    ), sortValue: (r) => r.fingerprint || '' },
    { key: 'execution_count', header: 'Calls', num: true, render: (r) => (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><InlineBar value={r.execution_count || 0} max={maxSqlExec} label={fmtNum(r.execution_count || 0)} color="var(--tier-db)" width={100} /></div>
    ), sortValue: (r) => r.execution_count || 0 },
    { key: 'avg_duration', header: 'Avg', num: true, render: (r) => <span style={{ color: `var(--${latencyStatus(r.avg_duration)})` }}>{fmtMs(r.avg_duration)}</span> },
    { key: 'p95_duration', header: 'p95', num: true, render: (r) => <span style={{ color: `var(--${latencyStatus(r.p95_duration)})` }}>{fmtMs(r.p95_duration)}</span> },
    { key: 'p99_duration', header: 'p99', num: true, render: (r) => <span style={{ color: `var(--${latencyStatus(r.p99_duration)})` }}>{fmtMs(r.p99_duration)}</span> },
    { key: 'max_duration', header: 'Max', num: true, render: (r) => fmtMs(r.max_duration) },
    { key: 'last_created_at', header: 'Last seen', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.last_created_at)}</span>, sortValue: (r) => Date.parse(r.last_created_at) || 0 },
  ]

  const redisColumns = [
    { key: 'command', header: 'Command', render: (r) => <Badge>{String(r.command || '—').toUpperCase()}</Badge>, sortValue: (r) => r.command || '' },
    { key: 'key', header: 'Key', render: (r) => (
      <span className="opa-mono" title={r.key} style={{ display: 'block', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--tier-redis)' }}>{r.key || '—'}</span>
    ), sortValue: (r) => r.key || '' },
    { key: 'execution_count', header: 'Calls', num: true, render: (r) => (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><InlineBar value={r.execution_count || 0} max={maxRedisExec} label={fmtNum(r.execution_count || 0)} color="var(--tier-redis)" width={100} /></div>
    ), sortValue: (r) => r.execution_count || 0 },
    { key: 'hit_rate', header: 'Hit %', num: true, render: (r) => {
      const pct = hitRate(r)
      return pct == null ? <span className="opa-muted">—</span> : <span style={{ color: `var(--${hitStatus(pct)})` }}>{fmtPct(pct)}</span>
    }, sortValue: (r) => hitRate(r) ?? -1 },
    { key: 'avg_duration', header: 'Avg', num: true, render: (r) => fmtMs(r.avg_duration) },
    {
      key: 'server', header: 'Server', render: (r) => {
        const server = [r.host, r.port].filter(Boolean).join(':')
        return <span className="opa-mono opa-muted" title={server}>{server || '—'}</span>
      }, sortValue: (r) => [r.host, r.port].filter(Boolean).join(':'),
    },
    { key: 'last_created_at', header: 'Last seen', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.last_created_at)}</span>, sortValue: (r) => Date.parse(r.last_created_at) || 0 },
  ]

  const instanceColumns = [
    { key: 'id', header: 'Instance', render: (r) => <span className="cell-strong opa-mono">{r.id}</span> },
    { key: 'engine', header: 'Engine', render: (r) => <Badge>{r.engine || '—'}</Badge> },
    { key: 'sat', header: 'Conn sat %', num: true, render: (r) => {
      const v = metricNum(r.metrics, 'connection_saturation_pct')
      if (v == null) return <span className="opa-muted">—</span>
      const tone = v >= 80 ? 'error' : v >= 60 ? 'warn' : 'ok'
      return <StatusPill tone={tone}>{fmtPct(v)}</StatusPill>
    }, sortValue: (r) => metricNum(r.metrics, 'connection_saturation_pct') ?? -1 },
    { key: 'hit', header: 'Buffer/cache hit', num: true, render: (r) => {
      const v = metricNum(r.metrics, 'buffer_hit_ratio_pct') ?? metricNum(r.metrics, 'cache_hit_ratio_pct')
      return v == null ? <span className="opa-muted">—</span> : fmtPct(v)
    } },
    { key: 'locks', header: 'Lock waits', num: true, render: (r) => fmtNum(metricNum(r.metrics, 'lock_waits') || 0) },
    { key: 'lag', header: 'Repl lag', num: true, render: (r) => {
      const v = metricNum(r.metrics, 'replication_lag_seconds')
      return v == null ? <span className="opa-muted">—</span> : `${fmtNum(v)}s`
    } },
    { key: 'scraped_at', header: 'Scraped', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.scraped_at)}</span> },
  ]

  const stmtColumns = [
    { key: 'query_preview', header: 'Statement', render: (r) => (
      <span className="opa-mono" title={r.query_preview} style={{ display: 'block', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.query_preview || r.opa_fingerprint || '—'}</span>
    ) },
    { key: 'instance_id', header: 'Instance', render: (r) => <span className="opa-mono opa-muted">{r.instance_id}</span> },
    { key: 'calls', header: 'Calls', num: true, render: (r) => fmtNum(r.calls) },
    { key: 'total_time_ms', header: 'Total time', num: true, render: (r) => (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <InlineBar value={Number(r.total_time_ms) || 0} max={maxStmtTime} label={fmtMs(r.total_time_ms)} color="var(--tier-db)" width={100} />
      </div>
    ), sortValue: (r) => Number(r.total_time_ms) || 0 },
    { key: 'avg_time_ms', header: 'Avg', num: true, render: (r) => fmtMs(r.avg_time_ms) },
    { key: 'full_scan', header: 'Scan', render: (r) => (Number(r.full_scan) ? <StatusPill tone="warn">full</StatusPill> : <span className="opa-muted">—</span>) },
    { key: 'matched', header: 'App join', render: (r) => (r.opa_fingerprint ? <Badge>fp</Badge> : <span className="opa-muted">—</span>) },
  ]

  const unusedColumns = [
    { key: 'instance_id', header: 'Instance', render: (r) => <span className="opa-mono">{r.instance_id}</span> },
    { key: 'schema_name', header: 'Schema', render: (r) => r.schema_name },
    { key: 'table_name', header: 'Table', render: (r) => <span className="opa-mono">{r.table_name}</span> },
    { key: 'index_name', header: 'Index', render: (r) => <span className="opa-mono">{r.index_name}</span> },
  ]

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Databases</h1>
          <div className="opa-page-sub">Instance health · statement digests joined to app fingerprints · cache</div>
        </div>
        <div className="opa-row">
          <Tabs tabs={TABS} value={tab} onChange={setTab} />
        </div>
      </div>

      {tab === 'instances' && (
        <>
          <div className="opa-grid cols-3">
            <KpiTile label="Instances" icon={<FiServer size={12} />} value={fmtNum(inst.length)} status="neutral" />
            <KpiTile label="Fingerprint match" icon={<FiTarget size={12} />} value={fmtPct(matchRate.data?.match_rate_pct || 0)} status="neutral"
              footer={<span className="opa-muted" style={{ fontSize: 11 }}>{fmtNum(matchRate.data?.matched || 0)} / {fmtNum(matchRate.data?.total || 0)}</span>} />
            <KpiTile label="Unused indexes" icon={<FiAlertTriangle size={12} />} value={fmtNum(unusedIdx.length)} status={unusedIdx.length ? 'warn' : 'neutral'} />
          </div>
          <Panel title="Instance health" icon={<FiServer />} flush loading={instances.loading} error={instances.error}
            empty={!instances.loading && inst.length === 0}
            emptyText="No DB monitors configured — set OPA_DB_MONITOR_CONFIG (see docs/wave17-db-monitoring.md)">
            <DataTable columns={instanceColumns} rows={inst} rowKey={(r) => r.id} maxHeight={420} />
          </Panel>
          {unusedIdx.length > 0 && (
            <Panel title="Unused indexes" icon={<FiAlertTriangle />} flush>
              <DataTable columns={unusedColumns} rows={unusedIdx} rowKey={(r, i) => `${r.instance_id}:${r.index_name}:${i}`} maxHeight={280} />
            </Panel>
          )}
        </>
      )}

      {tab === 'statements' && (
        <>
          <div className="opa-grid cols-3">
            <KpiTile label="Top statements" icon={<FiZap size={12} />} value={fmtNum(stmts.length)} status="neutral" />
            <KpiTile label="Fingerprint match" icon={<FiTarget size={12} />} value={fmtPct(matchRate.data?.match_rate_pct || 0)} status="neutral" />
            <KpiTile label="Full scans" icon={<FiAlertTriangle size={12} />} value={fmtNum(stmts.filter((s) => Number(s.full_scan)).length)} status="warn" />
          </div>
          <Panel title="Statements by total time (DB-side)" icon={<FiDatabase />} flush
            loading={statements.loading} error={statements.error}
            empty={!statements.loading && stmts.length === 0}
            emptyText="No statement digests yet — enable statements:true on a MySQL/Postgres target"
            actions={<span className="opa-muted" style={{ fontSize: 12 }}>click a row to open traces with the OPA fingerprint</span>}>
            <DataTable
              columns={stmtColumns}
              rows={stmts}
              rowKey={(r, i) => `${r.native_digest}:${i}`}
              initialSort={{ key: 'total_time_ms', dir: 'desc' }}
              maxHeight={620}
              onRowClick={(r) => {
                const fp = r.opa_fingerprint || r.native_digest
                if (fp) navigate(`/sql/${encodeURIComponent(fp)}`)
              }}
            />
          </Panel>
        </>
      )}

      {tab === 'sql' && (
        <>
          <div className="opa-grid cols-3">
            <KpiTile label="Unique queries" icon={<FiLayers size={12} />} value={fmtNum(sqlTotal)} unit="fingerprints" status="neutral" />
            <KpiTile label="Total executions" icon={<FiActivity size={12} />} value={fmtNum(sqlExecs)} unit="calls" status="neutral" />
            <KpiTile label="Slowest p95" icon={<FiZap size={12} />} value={fmtMs(slowestP95)} status={latencyStatus(slowestP95)} />
          </div>
          <Panel title="Queries by fingerprint (app-side)" icon={<FiDatabase />} flush
            loading={sql.loading} error={sql.error} empty={!sql.loading && queries.length === 0}
            emptyText="No SQL queries captured yet"
            actions={<span className="opa-muted" style={{ fontSize: 'var(--fs-12)' }}>{fmtNum(queries.length)} shown · sortable</span>}>
            <DataTable
              onRowClick={(r) => r?.fingerprint && navigate(`/sql/${encodeURIComponent(r.fingerprint)}`)}
              columns={sqlColumns} rows={queries}
              rowKey={(r) => r.fingerprint}
              initialSort={{ key: 'execution_count', dir: 'desc' }}
              maxHeight={620}
            />
          </Panel>
        </>
      )}

      {tab === 'redis' && (
        <>
          <div className="opa-grid cols-3">
            <KpiTile label="Operations" icon={<FiLayers size={12} />} value={fmtNum(ops.length)} unit="commands" status="neutral" />
            <KpiTile label="Total executions" icon={<FiActivity size={12} />} value={fmtNum(redisExecs)} unit="calls" status="neutral" />
            <KpiTile label="Overall hit rate" icon={<FiTarget size={12} />} value={overallHit == null ? '—' : fmtPct(overallHit)} status={hitStatus(overallHit)}
              footer={<span className="opa-muted" style={{ fontSize: 'var(--fs-11)' }}>{fmtNum(totHits)} hits · {fmtNum(totMiss)} miss</span>} />
          </div>
          <Panel title="Cache operations" icon={<FiHardDrive />} flush
            loading={redis.loading} error={redis.error} empty={!redis.loading && ops.length === 0}
            emptyText="No Redis operations captured yet"
            actions={<span className="opa-muted" style={{ fontSize: 'var(--fs-12)' }}>{fmtNum(ops.length)} shown · sortable</span>}>
            <DataTable
              onRowClick={(r) => {
                if (!r?.command) return
                const filter = r.key
                  ? `redis.command:"${r.command}" AND redis.key:"${r.key}"`
                  : `redis.command:"${r.command}"`
                navigate('/traces?' + new URLSearchParams({ filter }).toString())
              }}
              columns={redisColumns} rows={ops}
              rowKey={(r, i) => `${r.command}:${r.key}:${i}`}
              initialSort={{ key: 'execution_count', dir: 'desc' }}
              maxHeight={620}
            />
          </Panel>
        </>
      )}
    </div>
  )
}
