import React, { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  FiAlertCircle, FiDatabase, FiHardDrive, FiRefreshCw,
} from 'react-icons/fi'
import {
  PageHeader, Tabs, Stack, Grid, Card, Table, StatRow, StatTile, Badge,
  Button, EmptyState, Meter, DefinitionList,
} from '@open-family/ui'
import { useApi } from '../hooks/useApi'
import { useTableSort } from '../hooks/useTableSort'
import {
  fmtMs, fmtNum, fmtPct, fmtBytes, statusColor, errorRateStatus,
} from '../theme/format'

const TABS = [
  { value: 'health', label: 'Health' },
  { value: 'storage', label: 'Storage' },
  { value: 'ingest', label: 'Ingest' },
  { value: 'audit', label: 'Audit' },
]

/** Map a status string onto a Badge tone, so the colour never travels alone. */
function toneFor(status) {
  const colour = statusColor(status)
  if (colour === 'var(--good-text)') return 'good'
  if (colour === 'var(--warn-text)') return 'warning'
  if (colour === 'var(--critical-text)') return 'critical'
  return 'neutral'
}

/** Build the standard three table states from a `useApi` result. */
function tableState(request, rows) {
  if (request.loading && !request.data) return 'loading'
  if (request.error) return 'error'
  return rows.length ? 'ready' : 'empty'
}

function LoadFailed({ what, request }) {
  return (
    <EmptyState
      inline
      icon={<FiAlertCircle />}
      title={`${what} failed to load`}
      description={String(request.error || 'The request did not complete.')}
      actions={<Button icon={<FiRefreshCw />} onClick={request.reload}>Retry</Button>}
    />
  )
}

/**
 * Platform status.
 *
 * The Storage tab is the former `/stats` page. It had no nav entry and no link
 * into it from anywhere, so the only way to reach a page of real storage numbers
 * was to type the URL. It is a view of this page, which is where a user looking
 * for platform health would go.
 */
export default function PlatformOps() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'health'

  const version = useApi('/api/version', {}, { noRange: true })
  const topology = useApi('/api/topology', {}, { noRange: true })
  const ops = useApi('/api/ops/status', {}, { noRange: true })
  const audit = useApi('/api/audit', { limit: 40 }, { noRange: true })
  const stats = useApi('/api/stats')
  const health = useApi('/api/health')

  const t = topology.data || {}
  const o = ops.data || {}
  const v = version.data || {}
  const agent = stats.data?.agent || {}
  const db = stats.data?.database || {}
  const traces = stats.data?.traces || {}

  const auditRows = audit.data?.events || []
  const tables = db.tables || []
  const byService = traces.by_service || []
  const maxSize = Math.max(1, ...tables.map((r) => r.size_bytes || 0))

  const rawStatus = health.data?.status ?? health.data?.health ?? (health.data ? 'healthy' : null)
  const healthLabel = health.loading ? 'checking…'
    : health.error ? 'unreachable'
      : (rawStatus ? String(rawStatus) : 'unknown')

  const auditColumns = useMemo(() => [
    {
      key: 'created_at',
      header: 'When',
      mono: true,
      render: (r) => <span className="oui-text-muted">{String(r.created_at || '').slice(0, 19)}</span>,
    },
    { key: 'action', header: 'Action', mono: true },
    { key: 'actor', header: 'Actor', render: (r) => r.actor || '—' },
    {
      key: 'detail',
      header: 'Detail',
      mono: true,
      render: (r) => String(r.detail || '').slice(0, 80),
    },
  ], [])

  const storageColumns = useMemo(() => [
    {
      key: 'name',
      header: 'Table',
      mono: true,
      sortValue: (r) => r.name,
      render: (r) => (
        <span className="oui-row">
          <FiDatabase size={14} aria-hidden="true" />
          <span className="oui-mono">{r.name}</span>
        </span>
      ),
    },
    { key: 'rows', header: 'Rows', numeric: true, render: (r) => fmtNum(r.rows) },
    {
      key: 'size_bytes',
      header: 'Size',
      numeric: true,
      sortValue: (r) => r.size_bytes || 0,
      render: (r) => r.size_readable || fmtBytes(r.size_bytes),
    },
    {
      key: 'share',
      header: 'Relative size',
      width: 180,
      sortable: false,
      render: (r) => (
        <Meter
          value={((r.size_bytes || 0) / maxSize) * 100}
          label={`${r.name} size relative to the largest table`}
        />
      ),
    },
  ], [maxSize])

  const serviceColumns = useMemo(() => [
    {
      key: 'service',
      header: 'Service',
      mono: true,
      sortValue: (r) => r.service,
      render: (r) => (
        <span className="oui-row">
          <Badge tone={toneFor(errorRateStatus(r.error_rate))}>{fmtPct(r.error_rate)}</Badge>
          <span className="oui-mono">{r.service}</span>
        </span>
      ),
    },
    { key: 'traces', header: 'Traces', numeric: true, render: (r) => fmtNum(r.traces) },
    { key: 'spans', header: 'Spans', numeric: true, render: (r) => fmtNum(r.spans) },
  ], [])

  const storage = useTableSort(tables, storageColumns, { key: 'size_bytes', dir: 'desc' })
  const services = useTableSort(byService, serviceColumns, { key: 'traces', dir: 'desc' })

  return (
    <Stack gap="sections">
      <PageHeader
        title="Platform status"
        description="Topology, storage, ingest throughput and the record of privileged operations."
        meta={[
          { label: 'Version', value: v.version || '—' },
          { label: 'Mode', value: `${t.mode || '—'}${t.drain ? ' · draining' : ''}` },
        ]}
        actions={
          <Badge tone={health.error ? 'critical' : toneFor(rawStatus)}>
            {`API ${healthLabel}`}
          </Badge>
        }
      />

      <Tabs
        aria-label="Platform status views"
        value={tab}
        onChange={(next) => setParams(next === 'health' ? {} : { tab: next }, { replace: true })}
        items={TABS}
      />

      {tab === 'health' ? (
        <Stack>
          <StatRow>
            <StatTile label="Version" value={v.version || '—'} foot={<span className="oui-text-muted">{`uptime ${fmtNum(v.uptime_s || 0)}s`}</span>} />
            <StatTile label="Replicas" value={fmtNum(t.replica_count || 1)} foot={<span className="oui-text-muted">{`${t.shard_count || 1} shards · index ${t.shard_index ?? 0}`}</span>} />
            <StatTile label="Leader" value={t.is_leader ? 'Yes' : 'No'} foot={<span className="oui-text-muted">{`election ${t.leader_election ? 'on' : 'off'}`}</span>} />
            <StatTile label="Goroutines" value={fmtNum(o.goroutines || 0)} foot={<span className="oui-text-muted">{`heap ${fmtBytes(o.heap_alloc_bytes)}`}</span>} />
          </StatRow>

          <Grid columns={2}>
            <Card title="Topology" description="How this deployment is sharded and replicated.">
              {topology.error ? <LoadFailed what="Topology" request={topology} /> : (
                <DefinitionList
                  items={[
                    { term: 'Mode', value: t.mode || '—' },
                    { term: 'Replicas', value: fmtNum(t.replica_count || 1) },
                    { term: 'Shards', value: fmtNum(t.shard_count || 1) },
                    { term: 'Shard index', value: String(t.shard_index ?? 0) },
                    { term: 'Leader', value: t.is_leader ? 'Yes' : 'No' },
                    { term: 'Leader election', value: t.leader_election ? 'On' : 'Off' },
                    { term: 'Draining', value: t.drain ? 'Yes' : 'No' },
                    { term: 'Ingest auth', value: t.ingest_auth_required ? 'Required' : 'Off' },
                  ]}
                />
              )}
            </Card>
            <Card title="Runtime" description="Process-level counters for this instance.">
              {ops.error ? <LoadFailed what="Runtime" request={ops} /> : (
                <DefinitionList
                  items={[
                    { term: 'Goroutines', value: fmtNum(o.goroutines || 0) },
                    { term: 'Heap allocated', value: fmtBytes(o.heap_alloc_bytes) },
                    { term: 'Load shedding', value: o.load_shed ? 'Active' : 'Off' },
                    { term: 'Admission control', value: o.admission ? String(o.admission) : 'Off' },
                  ]}
                />
              )}
            </Card>
          </Grid>
        </Stack>
      ) : null}

      {tab === 'storage' ? (
        <Stack>
          <StatRow>
            <StatTile label="Total on disk" value={db.total_size_readable || fmtBytes(db.total_size_bytes || 0)} />
            <StatTile label="Tables" value={fmtNum(tables.length)} />
            <StatTile label="Total traces" value={fmtNum(traces.total_traces || 0)} />
            <StatTile label="Total spans" value={fmtNum(traces.total_spans || 0)} />
          </StatRow>

          <Card
            flush
            title="Storage by table"
            description="Row counts and on-disk size for every table the agent writes."
            actions={
              <span className="oui-row oui-text-muted">
                <FiHardDrive size={14} aria-hidden="true" />
                <span>Total <strong className="oui-num">{db.total_size_readable || '0 B'}</strong></span>
              </span>
            }
          >
            <Table
              aria-label="Storage by table"
              state={tableState(stats, tables)}
              columns={storage.columns}
              rows={storage.rows}
              onSort={storage.onSort}
              getRowKey={(r) => r.name}
              emptyState={
                <EmptyState
                  inline
                  title="No tables reporting a size yet"
                  description="The agent reports storage once it has written its first batch."
                />
              }
              errorState={<LoadFailed what="Storage" request={stats} />}
            />
          </Card>
        </Stack>
      ) : null}

      {tab === 'ingest' ? (
        <Stack>
          <StatRow>
            <StatTile label="Accepted" value={fmtNum(o.ingest_accepted || 0)} />
            <StatTile
              label="Shed"
              value={fmtNum(o.ingest_shed || 0)}
              foot={(o.ingest_shed || 0) > 0
                ? <Badge tone="warning">Load shedding has triggered</Badge>
                : <span className="oui-text-muted">Nothing shed</span>}
            />
            <StatTile label="Lag" value={`${fmtNum(o.ingest_lag_s || 0)}s`} />
            <StatTile
              label="Queue"
              value={fmtNum(agent.queue_size || 0)}
              foot={(agent.queue_size || 0) > 1000
                ? <Badge tone="warning">Queue is backing up</Badge>
                : <span className="oui-text-muted">Within normal range</span>}
            />
          </StatRow>

          <Grid columns={2}>
            <Card title="Agent messages" description="What the agent received and what it could not keep.">
              {stats.error ? <LoadFailed what="Agent counters" request={stats} /> : (
                <DefinitionList
                  items={[
                    { term: 'Incoming', value: fmtNum(agent.incoming_total || 0) },
                    { term: 'Dropped', value: fmtNum(agent.dropped_total || 0) },
                    { term: 'Queue size', value: fmtNum(agent.queue_size || 0) },
                  ]}
                />
              )}
            </Card>
            <Card title="Trace latency" description="Distribution across everything ingested in the window.">
              {stats.error ? <LoadFailed what="Trace summary" request={stats} /> : (
                <DefinitionList
                  items={[
                    { term: 'Error rate', value: fmtPct(traces.error_rate || 0) },
                    { term: 'Average', value: fmtMs(traces.avg_duration_ms) },
                    { term: 'p50', value: fmtMs(traces.p50_duration_ms) },
                    { term: 'p95', value: fmtMs(traces.p95_duration_ms) },
                    { term: 'p99', value: fmtMs(traces.p99_duration_ms) },
                  ]}
                />
              )}
            </Card>
          </Grid>

          <Card flush title="Ingest by service" description="Which services account for the volume.">
            <Table
              aria-label="Ingest by service"
              state={tableState(stats, byService)}
              columns={services.columns}
              rows={services.rows}
              onSort={services.onSort}
              getRowKey={(r) => r.service}
              onRowClick={(r) => r.service && navigate(`/services/${encodeURIComponent(r.service)}`)}
              emptyState={
                <EmptyState
                  inline
                  title="No services have reported in this window"
                  description="The range, not the platform, may be empty. Widening it usually resolves this."
                />
              }
              errorState={<LoadFailed what="Ingest by service" request={stats} />}
            />
          </Card>
        </Stack>
      ) : null}

      {tab === 'audit' ? (
        <Card
          flush
          title="Audit log"
          description="Privileged operations — drains, key changes, role changes — most recent first."
        >
          <Table
            aria-label="Audit log"
            state={tableState(audit, auditRows)}
            columns={auditColumns}
            rows={auditRows}
            getRowKey={(r) => r.audit_id || r.created_at}
            emptyState={
              <EmptyState
                inline
                title="No audit events recorded"
                description="Privileged actions such as draining a node or rotating a key are recorded here as they happen."
              />
            }
            errorState={<LoadFailed what="Audit log" request={audit} />}
          />
        </Card>
      ) : null}
    </Stack>
  )
}
