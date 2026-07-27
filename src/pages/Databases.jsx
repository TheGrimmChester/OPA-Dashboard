import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiDatabase, FiHardDrive, FiLayers, FiZap, FiClock, FiActivity, FiTarget } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import {
  Panel, KpiTile, DataTable, InlineBar, Badge,
} from '../components/ui'
import { fmtMs, fmtNum, fmtPct, fmtAgo, latencyStatus } from '../theme/format'

const TABS = [
  { value: 'sql', label: 'SQL', icon: <FiDatabase size={13} /> },
  { value: 'redis', label: 'Redis / Cache', icon: <FiHardDrive size={13} /> },
]

// Reuse the underline-tab primitive without importing it separately.
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

export default function Databases() {
  const [tab, setTab] = useState('sql')
  const navigate = useNavigate()

  const sql = useApi('/api/sql/queries', { limit: 200, sort: 'execution_count', order: 'desc' })
  const redis = useApi('/api/redis/operations', { limit: 200 })

  const queries = sql.data?.queries || []
  const sqlTotal = sql.data?.total ?? queries.length
  const ops = redis.data?.operations || []

  // ---- SQL aggregates ----
  const sqlExecs = queries.reduce((a, q) => a + (q.execution_count || 0), 0)
  const maxSqlExec = Math.max(1, ...queries.map((q) => q.execution_count || 0))
  const slowestP95 = queries.reduce((m, q) => Math.max(m, q.p95_duration || 0), 0)

  // ---- Redis aggregates ----
  const redisExecs = ops.reduce((a, o) => a + (o.execution_count || 0), 0)
  const maxRedisExec = Math.max(1, ...ops.map((o) => o.execution_count || 0))
  const totHits = ops.reduce((a, o) => a + (o.hit_count || 0), 0)
  const totMiss = ops.reduce((a, o) => a + (o.miss_count || 0), 0)
  const overallHit = (totHits + totMiss) > 0 ? (totHits / (totHits + totMiss)) * 100 : null
  const hitStatus = (pct) => (pct == null ? 'neutral' : pct >= 90 ? 'ok' : pct >= 70 ? 'warn' : 'error')

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
    { key: 'hit_rate', header: 'Hit rate', num: true, sortValue: (r) => hitRate(r) ?? -1, render: (r) => {
      const pct = hitRate(r)
      if (pct == null) return <span className="opa-muted">—</span>
      const st = hitStatus(pct)
      return (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
          <InlineBar value={pct} max={100} color={`var(--${st})`} width={70} />
          <span className="opa-tnum" style={{ color: `var(--${st})`, minWidth: 44, textAlign: 'right' }}>{fmtPct(pct)}</span>
        </div>
      )
    } },
    { key: 'avg_duration', header: 'Avg', num: true, render: (r) => <span style={{ color: `var(--${latencyStatus(r.avg_duration)})` }}>{fmtMs(r.avg_duration)}</span> },
    { key: 'p95_duration', header: 'p95', num: true, render: (r) => <span style={{ color: `var(--${latencyStatus(r.p95_duration)})` }}>{fmtMs(r.p95_duration)}</span> },
    { key: 'host', header: 'Host', render: (r) => <span className="opa-mono opa-muted">{r.host || '—'}</span>, sortValue: (r) => r.host || '' },
    { key: 'last_created_at', header: 'Last seen', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.last_created_at)}</span>, sortValue: (r) => Date.parse(r.last_created_at) || 0 },
  ]

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Databases</h1>
          <div className="opa-page-sub">SQL query cost &amp; cache performance</div>
        </div>
        <div className="opa-row">
          <Tabs tabs={TABS} value={tab} onChange={setTab} />
        </div>
      </div>

      {tab === 'sql' && (
        <>
          <div className="opa-grid cols-3">
            <KpiTile label="Unique queries" icon={<FiLayers size={12} />} value={fmtNum(sqlTotal)} unit="fingerprints" status="neutral" />
            <KpiTile label="Total executions" icon={<FiActivity size={12} />} value={fmtNum(sqlExecs)} unit="calls" status="neutral" />
            <KpiTile label="Slowest p95" icon={<FiZap size={12} />} value={fmtMs(slowestP95)} status={latencyStatus(slowestP95)} />
          </div>

          <Panel title="Queries by fingerprint" icon={<FiDatabase />} flush
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
