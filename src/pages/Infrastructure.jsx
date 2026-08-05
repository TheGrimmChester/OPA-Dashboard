import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { Panel, DataTable, HealthDot, EmptyState } from '../components/ui'
import { fmtAgo, fmtNum } from '../theme/format'

// Infrastructure — the host inventory, and the navigation spine for the whole
// metrics pillar: pick a host, then see its metrics.
//
// The most valuable column here is the one that says a host has STOPPED reporting.
// A host that goes silent looks exactly like a healthy host on every chart — the
// line simply ends — so an explicit reporting state is the only way that failure is
// visible. The backend computes it rather than leaving the UI to infer it from a
// timestamp, so the threshold is defined in one place.

export default function Infrastructure() {
  const navigate = useNavigate()
  // Host identity is not a time series; the inventory should not churn with the
  // global range picker.
  const { data, loading, error } = useApi('/api/infra/hosts', {}, { noRange: true })

  const hosts = data?.hosts || []
  const silent = hosts.filter((h) => !h.reporting)
  const reporting = hosts.length - silent.length

  return (
    <div className="oui-grid" style={{ gap: 16 }}>
      <Panel
        title="Hosts"
        actions={
          <span className="oui-text-muted">
            {reporting} reporting{silent.length > 0 ? ` · ${silent.length} silent` : ''}
          </span>
        }
        loading={loading}
        error={error ? String(error) : null}
        empty={!loading && !error && hosts.length === 0}
        emptyText="No hosts reporting metrics yet."
      >
        {!loading && !error && hosts.length === 0 && (
          <EmptyState
            title="No hosts yet"
            hint="Run opa-collector on a host with OPA_AGENT_ADDR pointing at this agent."
          />
        )}

        {hosts.length > 0 && (
          <DataTable
          loading={loading}
          error={error ? String(error) : null}
            columns={[
              {
                key: 'reporting',
                header: '',
                width: 28,
                render: (r) => (
                  <HealthDot
                    tone={r.reporting ? 'ok' : 'error'}
                    title={r.reporting ? 'Reporting' : 'Not reporting — no samples in the last 5 minutes'}
                  />
                ),
                sortable: true,
                sortValue: (r) => (r.reporting ? 1 : 0),
              },
              { key: 'host', header: 'Host', mono: true, sortable: true },
              {
                key: 'metric_count',
                header: 'Metrics',
                num: true,
                sortable: true,
                render: (r) => fmtNum(r.metric_count),
              },
              {
                key: 'series_count',
                header: 'Series',
                num: true,
                sortable: true,
                render: (r) => fmtNum(r.series_count),
              },
              {
                key: 'last_seen',
                header: 'Last seen',
                sortable: true,
                render: (r) => fmtAgo(r.last_seen),
              },
            ]}
            rows={hosts}
            rowKey={(r) => r.host}
            initialSort={{ key: 'host', dir: 'asc' }}
            // Drill straight into that host's metrics with the filter pre-applied,
            // which is the only thing anyone wants from a host row.
            onRowClick={(r) => navigate(`/metrics?metric=system.cpu.time&label=host:${encodeURIComponent(r.host)}&group_by=state`)}
          />
        )}
      </Panel>
    </div>
  )
}
