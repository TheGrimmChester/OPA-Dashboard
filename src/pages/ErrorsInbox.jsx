import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiAlertTriangle, FiLayers, FiRepeat, FiServer, FiFilter, FiCheck, FiSlash, FiRotateCcw } from 'react-icons/fi'
import axios from 'axios'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, InlineBar, Badge, StatusPill, SegmentedControl } from '../components/ui'
import { fmtNum, fmtAgo } from '../theme/format'
import { PageHeader } from '@open-family/ui'

const API = import.meta.env.VITE_API_URL || ''

// API timestamps come as "2026-07-25 08:10:29.000" — normalize so Date.parse is reliable.
const parseTs = (ts) => {
  if (!ts) return null
  const t = Date.parse(typeof ts === 'string' ? ts.replace(' ', 'T') : ts)
  return isNaN(t) ? null : t
}
const ago = (ts) => fmtAgo(parseTs(ts))

// Real group status → pill tone. unresolved = actionable (error), resolved = ok, ignored = muted.
const STATUS_TONE = { unresolved: 'error', resolved: 'ok', ignored: 'neutral' }

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unresolved', label: 'Unresolved' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'ignored', label: 'Ignored' },
]

export default function ErrorsInbox() {
  const navigate = useNavigate()
  // Default to the actionable inbox. 'all' means "no server filter" → status undefined.
  const [statusFilter, setStatusFilter] = useState('unresolved')
  const q = useApi('/api/errors', { limit: 500, status: statusFilter === 'all' ? undefined : statusFilter })
  const [service, setService] = useState('all')
  const [busyId, setBusyId] = useState(null)
  const [mutErr, setMutErr] = useState('')

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

  // Persist a new group status, then refresh the list so filtered-out rows drop away.
  const changeStatus = async (groupId, status, e) => {
    e?.stopPropagation()
    if (!groupId) return
    setBusyId(groupId); setMutErr('')
    try {
      await axios.post(`${API}/api/errors/groups/${encodeURIComponent(groupId)}/status`, { status })
      q.reload()
    } catch (err) {
      setMutErr(err.response?.data?.error || err.response?.data || err.message || 'Failed to update status')
    } finally {
      setBusyId(null)
    }
  }

  const columns = [
    {
      key: 'error',
      header: 'Error',
      sortValue: (r) => r?.error_message || '',
      render: (r) => (
        <div className="oui-row" style={{ minWidth: 0, gap: 8 }}>
          <Badge title={r?.error_type}>{r?.error_type || 'Error'}</Badge>
          <span
            className="oui-cell-primary oui-mono"
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
      render: (r) => (r?.service
        ? <button type="button" className="oui-btn is-ghost oui-mono" style={{ padding: '0 4px' }}
            onClick={(e) => { e.stopPropagation(); navigate(`/services/${encodeURIComponent(r.service)}`) }}>
            {r.service}
          </button>
        : <span className="oui-mono oui-text-muted">—</span>),
    },
    {
      key: 'count',
      header: 'Occurrences',
      num: true,
      sortValue: (r) => r?.count || 0,
      render: (r) => (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <InlineBar value={r?.count || 0} max={maxCount} label={fmtNum(r?.count || 0)} color="var(--critical-text)" width={100} />
        </div>
      ),
    },
    {
      key: 'first_seen',
      header: 'First seen',
      num: true,
      sortValue: (r) => parseTs(r?.first_seen) || 0,
      render: (r) => <span className="oui-text-muted oui-num">{ago(r?.first_seen)}</span>,
    },
    {
      key: 'last_seen',
      header: 'Last seen',
      num: true,
      sortValue: (r) => parseTs(r?.last_seen) || 0,
      render: (r) => <span className="oui-num">{ago(r?.last_seen)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (r) => r?.status || '',
      render: (r) => <StatusPill tone={STATUS_TONE[r?.status] || 'neutral'}>{r?.status || 'unknown'}</StatusPill>,
    },
    {
      key: 'actions',
      header: '',
      sortable: false,
      render: (r) => {
        const gid = r?.group_id ?? r?.error_id
        const busy = busyId === gid
        const btnStyle = { padding: '2px 8px', fontSize: 'var(--text-2xs)' }
        return (
          <div className="oui-row" style={{ gap: 6, justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
            {r?.status !== 'resolved' && (
              <button className="oui-btn is-ghost" style={btnStyle} disabled={busy} title="Mark resolved"
                onClick={(e) => changeStatus(gid, 'resolved', e)}><FiCheck size={12} /> Resolve</button>
            )}
            {r?.status !== 'ignored' && (
              <button className="oui-btn is-ghost" style={btnStyle} disabled={busy} title="Ignore this group"
                onClick={(e) => changeStatus(gid, 'ignored', e)}><FiSlash size={12} /> Ignore</button>
            )}
            {r?.status !== 'unresolved' && (
              <button className="oui-btn is-ghost" style={btnStyle} disabled={busy} title="Reopen"
                onClick={(e) => changeStatus(gid, 'unresolved', e)}><FiRotateCcw size={12} /> Reopen</button>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="oui-stack">
      <PageHeader
        title="Errors"
        description={<>{totalGroups} error group{totalGroups === 1 ? '' : 's'} across {affectedServices} service{affectedServices === 1 ? '' : 's'}</>}
        actions={<><div className="oui-row" style={{ gap: 'var(--space-3)' }}>
          <SegmentedControl options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
          <label className="oui-row" style={{ gap: 6, fontSize: 'var(--text-xs)' }}>
            <FiFilter size={12} className="oui-text-muted" />
            <select
              className="oui-select"
              value={service}
              onChange={(e) => setService(e.target.value)}
            >
              <option value="all">All services</option>
              {services.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div></>}
      />

      <div className="oui-grid is-3">
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
        actions={mutErr
          ? <span style={{ color: 'var(--critical-text)', fontSize: 'var(--text-xs)' }}>{String(mutErr)}</span>
          : <span className="oui-text-muted" style={{ fontSize: 'var(--text-xs)' }}>click a row to analyze</span>}
      >
        <DataTable
          loading={q.loading}
          error={q.error}
          onRetry={q.reload}
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
