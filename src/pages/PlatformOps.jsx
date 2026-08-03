import React from 'react'
import { FiServer, FiActivity, FiShield } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, StatusPill, EmptyState } from '../components/ui'
import { fmtNum } from '../theme/format'

/** HA / scale / PlatformOps: platform topology, version, audit trail. */
export default function PlatformOps() {
  const version = useApi('/api/version', {}, { noRange: true })
  const topology = useApi('/api/topology', {}, { noRange: true })
  const ops = useApi('/api/ops/status', {}, { noRange: true })
  const audit = useApi('/api/audit', { limit: 40 }, { noRange: true })

  const t = topology.data || {}
  const o = ops.data || {}
  const v = version.data || {}

  const auditRows = audit.data?.events || []
  const cols = [
    { key: 'created_at', header: 'When', render: (r) => <span className="opa-muted opa-mono">{String(r.created_at || '').slice(0, 19)}</span> },
    { key: 'action', header: 'Action', render: (r) => <span className="opa-mono">{r.action}</span> },
    { key: 'actor', header: 'Actor', render: (r) => r.actor || '—' },
    { key: 'detail', header: 'Detail', render: (r) => <span className="opa-mono" style={{ fontSize: 11 }}>{String(r.detail || '').slice(0, 80)}</span> },
  ]

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">System</h1>
          <div className="opa-page-sub">Platform topology · version · audit</div>
        </div>
        <StatusPill tone={t.drain ? 'warn' : 'ok'}>{t.mode || '…'}{t.drain ? ' · draining' : ''}</StatusPill>
      </div>

      <div className="opa-grid cols-4">
        <KpiTile label="Version" icon={<FiServer size={12} />} value={v.version || '—'} status="neutral"
          footer={<span className="opa-muted" style={{ fontSize: 11 }}>uptime {fmtNum(v.uptime_s || 0)}s</span>} />
        <KpiTile label="Replicas" icon={<FiActivity size={12} />} value={fmtNum(t.replica_count || 1)} status="neutral"
          footer={<span className="opa-muted" style={{ fontSize: 11 }}>shards {t.shard_count || 1} · idx {t.shard_index ?? 0}</span>} />
        <KpiTile label="Leader" icon={<FiShield size={12} />} value={t.is_leader ? 'yes' : 'no'} status={t.is_leader ? 'ok' : 'neutral'}
          footer={<span className="opa-muted" style={{ fontSize: 11 }}>election {t.leader_election ? 'on' : 'off'}</span>} />
        <KpiTile label="Ingest accepted" icon={<FiActivity size={12} />} value={fmtNum(o.ingest_accepted || 0)} status="neutral"
          footer={<span className="opa-muted" style={{ fontSize: 11 }}>shed {fmtNum(o.ingest_shed || 0)} · lag {fmtNum(o.ingest_lag_s || 0)}s</span>} />
      </div>

      <div className="opa-grid cols-2">
        <Panel title="Topology" icon={<FiServer />} loading={topology.loading} error={topology.error}>
          <pre className="opa-mono" style={{ fontSize: 12, margin: 0, whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(t, null, 2)}
          </pre>
        </Panel>
        <Panel title="Runtime" icon={<FiActivity />} loading={ops.loading} error={ops.error}>
          <pre className="opa-mono" style={{ fontSize: 12, margin: 0, whiteSpace: 'pre-wrap' }}>
            {JSON.stringify({
              goroutines: o.goroutines,
              heap_alloc_bytes: o.heap_alloc_bytes,
              load_shed: o.load_shed,
              admission: o.admission,
              tls_ingest_auth: t.ingest_auth_required,
            }, null, 2)}
          </pre>
        </Panel>
      </div>

      <Panel title="Audit log" icon={<FiShield />} flush loading={audit.loading} error={audit.error}
        empty={!audit.loading && auditRows.length === 0}
        emptyText="No privileged ops recorded yet">
        {auditRows.length === 0 && !audit.loading ? (
          <EmptyState title="No audit events" hint="Admin actions (drain, key CRUD, …) land here." />
        ) : (
          <DataTable columns={cols} rows={auditRows} rowKey={(r) => r.audit_id || r.created_at} maxHeight={360} />
        )}
      </Panel>
    </div>
  )
}
