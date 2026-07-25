import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiAlertTriangle, FiLayers, FiRepeat, FiServer, FiFilter } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, InlineBar, Badge, StatusPill } from '../components/ui'
import { fmtNum, fmtAgo } from '../theme/format'

// API timestamps come as "2026-07-25 08:10:29.000" — normalize so Date.parse is reliable.
const parseTs = (ts) => {
  if (!ts) return null
  const t = Date.parse(typeof ts === 'string' ? ts.replace(' ', 'T') : ts)
  return isNaN(t) ? null : t
}
const ago = (ts) => fmtAgo(parseTs(ts))

export default function ErrorsInbox() {
  const navigate = useNavigate()
  const q = useApi('/api/errors', { limit: 500 })
  const [service, setService] = useState('all')

  const errors = q.data?.errors || []

  const services = useMemo(
    () => Array.from(new Set(errors.map((e) => e?.service).filter(Boolean))).sort(),
    [errors],
  )

  const rows = useMemo(
    () => (service === 'all' ? errors : errors.filter((e) => e?.service === service)),
    [errors, service],
  )

  const totalGroups = rows.length
  const totalOccurrences = rows.reduce((sum, e) => sum + (e?.count || 0), 0)
  const affectedServices = new Set(rows.map((e) => e?.service).filter(Boolean)).size
  const maxCount = Math.max(1, ...rows.map((e) => e?.count || 0))

  const columns = [
    {
      key: 'error',
      header: 'Error',
      sortValue: (r) => r?.error_message || '',
      render: (r) => (
        <div className="opa-row" style={{ minWidth: 0, gap: 8 }}>
          <Badge title={r?.error_type}>{r?.error_type || 'Error'}</Badge>
          <span
            className="cell-strong opa-mono"
            title={r?.error_message}
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {r?.error_message || '—'}
          </span>
        </div>
      ),
    },
    {
      key: 'service',
      header: 'Service',
      sortValue: (r) => r?.service || '',
      render: (r) => <span className="opa-mono opa-muted">{r?.service || '—'}</span>,
    },
    {
      key: 'count',
      header: 'Occurrences',
      num: true,
      sortValue: (r) => r?.count || 0,
      render: (r) => (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <InlineBar value={r?.count || 0} max={maxCount} label={fmtNum(r?.count || 0)} color="var(--error)" width={100} />
        </div>
      ),
    },
    {
      key: 'first_seen',
      header: 'First seen',
      num: true,
      sortValue: (r) => parseTs(r?.first_seen) || 0,
      render: (r) => <span className="opa-muted opa-tnum">{ago(r?.first_seen)}</span>,
    },
    {
      key: 'last_seen',
      header: 'Last seen',
      num: true,
      sortValue: (r) => parseTs(r?.last_seen) || 0,
      render: (r) => <span className="opa-tnum">{ago(r?.last_seen)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: () => 0,
      render: () => <StatusPill tone="error">error</StatusPill>,
    },
  ]

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Errors</h1>
          <div className="opa-page-sub">
            {totalGroups} error group{totalGroups === 1 ? '' : 's'} across {affectedServices} service{affectedServices === 1 ? '' : 's'}
          </div>
        </div>
        <div className="opa-row">
          <label className="opa-row" style={{ gap: 6, fontSize: 'var(--fs-12)' }}>
            <FiFilter size={12} className="opa-muted" />
            <select
              className="opa-select"
              value={service}
              onChange={(e) => setService(e.target.value)}
            >
              <option value="all">All services</option>
              {services.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="opa-grid cols-3">
        <KpiTile label="Error groups" icon={<FiLayers size={12} />} value={fmtNum(totalGroups)} unit="unique" status="neutral" />
        <KpiTile label="Occurrences" icon={<FiRepeat size={12} />} value={fmtNum(totalOccurrences)} unit="events" status={totalOccurrences > 0 ? 'error' : 'ok'} />
        <KpiTile label="Affected services" icon={<FiServer size={12} />} value={fmtNum(affectedServices)} status={affectedServices > 0 ? 'warn' : 'ok'} />
      </div>

      <Panel
        title="Error inbox"
        icon={<FiAlertTriangle />}
        flush
        loading={q.loading}
        error={q.error}
        empty={!q.loading && rows.length === 0}
        emptyText="No errors in this range"
        actions={<span className="opa-muted" style={{ fontSize: 'var(--fs-12)' }}>click a row to analyze</span>}
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r?.error_id}
          initialSort={{ key: 'count', dir: 'desc' }}
          onRowClick={(r) => r?.error_id && navigate(`/errors/${encodeURIComponent(r.error_id)}`)}
        />
      </Panel>
    </div>
  )
}
