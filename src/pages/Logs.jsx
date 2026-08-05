import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  FiFileText, FiBarChart2, FiSearch, FiX, FiChevronLeft, FiChevronRight,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import {
  Panel, DataTable, StatusPill, SegmentedControl, TimeSeriesChart, EntityChip,
} from '../components/ui'
import { fmtNum, fmtAgo } from '../theme/format'
import { serviceHref, traceHref } from '../utils/entityLinks'
import './Logs.css'
import { PageHeader } from '@open-family/ui'

const LIMIT = 100

// Log level → design-system tone. Unknown levels stay neutral.
function levelTone(level) {
  const l = String(level || '').toUpperCase()
  if (l === 'ERROR' || l === 'CRITICAL' || l === 'FATAL') return 'error'
  if (l === 'WARN' || l === 'WARNING') return 'warn'
  if (l === 'INFO' || l === 'NOTICE') return 'ok'
  return 'neutral'
}

// The ms-epoch timestamps the API returns, as a readable clock time.
function clockOf(ms) {
  const n = Number(ms)
  if (!n) return '—'
  const d = new Date(n)
  return d.toLocaleTimeString([], { hour12: false })
}

export default function Logs() {
  const navigate = useNavigate()
  // Filters live in the URL so a log view is shareable, exactly like the
  // Trace Explorer.
  const [searchParams, setSearchParams] = useSearchParams()
  const service = searchParams.get('service') || ''
  const level = searchParams.get('level') || ''
  const q = searchParams.get('q') || ''
  const [offset, setOffset] = useState(0)
  const [expanded, setExpanded] = useState(null)

  const setParam = (key, val) => {
    const p = new URLSearchParams(searchParams)
    if (val) p.set(key, val)
    else p.delete(key)
    setSearchParams(p, { replace: true })
    setOffset(0)
  }
  const clearFilters = () => { setSearchParams(new URLSearchParams(), { replace: true }); setOffset(0) }
  const hasFilters = !!(service || level || q)

  // Draft for the search box: committed to the URL on Enter/blur so typing
  // doesn't refetch on every keystroke.
  const [draft, setDraft] = useState(q)
  useEffect(() => { setDraft(q) }, [q])
  const commitSearch = () => {
    const v = draft.trim()
    if (v !== q) setParam('q', v)
  }

  const meta = useApi('/api/services/metadata', {}, { noRange: true })
  const logsQ = useApi('/api/logs', {
    service: service || undefined,
    level: level || undefined,
    q: q || undefined,
    limit: LIMIT,
    offset,
  })

  const services = meta.data?.services || []
  const rows = logsQ.data?.logs || []
  const facets = logsQ.data?.facets || {}
  const levelFacets = facets.levels || []
  const serviceFacets = facets.services || []

  // Volume over time: total bars with the error share stacked on top, so a
  // spike of errors is visible against normal traffic.
  const histogram = useMemo(() => (logsQ.data?.histogram || []).map((b) => ({
    time: String(b.time || '').slice(5, 16),
    other: Math.max(0, Number(b.count || 0) - Number(b.error_count || 0)),
    errors: Number(b.error_count || 0),
  })), [logsQ.data])
  const hasVolume = histogram.some((b) => b.other > 0 || b.errors > 0)

  const columns = [
    {
      key: 'timestamp', header: 'Time', width: 150,
      render: (r) => (
        <span className="logs-time">
          <span className="oui-mono">{clockOf(r.timestamp)}</span>{' '}
          <span className="oui-text-muted">{fmtAgo(new Date(Number(r.timestamp)).toISOString())}</span>
        </span>
      ),
      sortValue: (r) => Number(r.timestamp) || 0,
    },
    {
      key: 'level', header: 'Level', width: 92, align: 'center',
      render: (r) => <StatusPill tone={levelTone(r.level)}>{r.level || '—'}</StatusPill>,
      sortValue: (r) => r.level,
    },
    {
      key: 'service', header: 'Service', width: 150,
      render: (r) => (r.service
        ? <EntityChip to={serviceHref(r.service)} title={`Service ${r.service}`}>{r.service}</EntityChip>
        : <span className="oui-text-muted">—</span>),
      sortValue: (r) => r.service,
    },
    {
      key: 'message', header: 'Message',
      render: (r) => <span className="logs-msg">{r.message || '—'}</span>,
      sortValue: (r) => r.message,
    },
    {
      key: 'trace_id', header: 'Trace', width: 118,
      render: (r) => (r.trace_id
        ? <EntityChip to={traceHref(r.trace_id)} title={`Open trace ${r.trace_id}`}>{String(r.trace_id).slice(0, 12)}</EntityChip>
        : <span className="oui-text-muted">—</span>),
      sortValue: (r) => r.trace_id || '',
    },
  ]

  const pageStart = rows.length === 0 ? 0 : offset + 1
  const pageEnd = offset + rows.length
  const hasPrev = offset > 0
  const hasNext = !!logsQ.data?.has_more || rows.length === LIMIT

  return (
    <div className="oui-stack">
      <PageHeader
        title="Logs"
        description={<>Application logs{rows.length ? ` · ${fmtNum(rows.length)} shown` : ''}
            {' '}· correlated to traces</>}
        actions={<><div className="oui-row">
          <select className="oui-select" value={service} onChange={(e) => setParam('service', e.target.value)} aria-label="Service filter">
            <option value="">All services</option>
            {services.map((s) => <option key={s.service} value={s.service}>{s.service}</option>)}
          </select>
          <SegmentedControl
            value={level || 'all'}
            onChange={(v) => setParam('level', v === 'all' ? '' : v)}
            options={[
              { value: 'all', label: 'All' },
              { value: 'INFO', label: 'Info' },
              { value: 'WARN', label: 'Warn' },
              { value: 'ERROR', label: 'Error' },
            ]}
          />
        </div></>}
      />

      {/* Full-text search over the message body. */}
      <div className="oui-row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
        <div className="logs-search">
          <FiSearch size={13} className="logs-search-icon" />
          <input
            className="oui-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitSearch() }}
            onBlur={commitSearch}
            spellCheck={false}
            placeholder="Search log messages…"
            aria-label="Search log messages"
          />
        </div>
        {hasFilters && (
          <button className="oui-btn is-ghost" onClick={clearFilters} title="Clear all filters">
            <FiX size={13} /> Clear
          </button>
        )}
      </div>

      {/* Volume over time */}
      <Panel
        title="Log volume" icon={<FiBarChart2 />}
        loading={logsQ.loading} error={logsQ.error}
        empty={!logsQ.loading && !hasVolume}
        emptyText="No logs in range"
      >
        <TimeSeriesChart
          data={histogram} xKey="time" height={170} stacked
          valueFmt={(v) => fmtNum(v)} yFmt={(v) => fmtNum(v)}
          series={[
            { key: 'other', name: 'Logs', color: 'var(--accent)', type: 'bar' },
            { key: 'errors', name: 'Errors', color: 'var(--critical-text)', type: 'bar' },
          ]}
        />
      </Panel>

      {/* Facets — click a value to filter by it */}
      {(levelFacets.length > 0 || serviceFacets.length > 0) && (
        <div className="logs-facets">
          {levelFacets.map((f) => (
            <button
              key={`l-${f.value}`}
              className={`logs-chip${level === f.value ? ' active' : ''}`}
              onClick={() => setParam('level', level === f.value ? '' : f.value)}
            >
              <StatusPill tone={levelTone(f.value)}>{f.value || '—'}</StatusPill>
              <span className="oui-num">{fmtNum(f.count)}</span>
            </button>
          ))}
          {serviceFacets.map((f) => (
            <button
              key={`s-${f.value}`}
              className={`logs-chip${service === f.value ? ' active' : ''}`}
              onClick={() => setParam('service', service === f.value ? '' : f.value)}
            >
              <span className="oui-mono">{f.value || '—'}</span>
              <span className="oui-num">{fmtNum(f.count)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Log lines */}
      <Panel
        title="Log entries" icon={<FiFileText />} flush
        loading={logsQ.loading} error={logsQ.error}
        empty={!logsQ.loading && rows.length === 0}
        emptyText="No logs match these filters"
        actions={(
          <div className="oui-row" style={{ fontSize: 'var(--text-xs)' }}>
            <span className="oui-text-muted oui-num">
              {rows.length ? `${pageStart}–${pageEnd}` : '0 logs'}
            </span>
            <button className="oui-btn is-secondary" disabled={!hasPrev}
              onClick={() => setOffset((o) => Math.max(0, o - LIMIT))} title="Previous page">
              <FiChevronLeft size={13} />
            </button>
            <button className="oui-btn is-secondary" disabled={!hasNext}
              onClick={() => setOffset((o) => o + LIMIT)} title="Next page">
              <FiChevronRight size={13} />
            </button>
          </div>
        )}
      >
        <DataTable
          loading={logsQ.loading}
          error={logsQ.error}
          onRetry={logsQ.reload}
          columns={columns}
          rows={rows}
          rowKey={(r, i) => r.id || i}
          initialSort={{ key: 'timestamp', dir: 'desc' }}
          onRowClick={(r, i) => setExpanded(expanded === (r.id || i) ? null : (r.id || i))}
          maxHeight="52vh"
          emptyText="No logs match these filters"
        />
      </Panel>

      {/* Expanded entry: the full message plus structured fields. */}
      {expanded != null && (() => {
        const row = rows.find((r, i) => (r.id || i) === expanded)
        if (!row) return null
        return (
          <Panel
            title="Log entry" icon={<FiFileText />}
            actions={(
              <div className="oui-row" style={{ gap: 'var(--space-2)' }}>
                {row.trace_id && (
                  <button className="oui-btn is-secondary" onClick={() => navigate(`/traces/${encodeURIComponent(row.trace_id)}`)}>
                    Open trace
                  </button>
                )}
                <button className="oui-btn is-ghost" onClick={() => setExpanded(null)}>Close</button>
              </div>
            )}
          >
            <div className="logs-detail">
              <div className="logs-detail-head">
                <StatusPill tone={levelTone(row.level)}>{row.level || '—'}</StatusPill>
                {row.service
                  ? <EntityChip to={serviceHref(row.service)}>{row.service}</EntityChip>
                  : <span className="oui-mono">—</span>}
                <span className="oui-text-muted">{clockOf(row.timestamp)}</span>
                {row.trace_id && (
                  <EntityChip to={traceHref(row.trace_id)} title={row.trace_id}>
                    {String(row.trace_id).slice(0, 16)}
                  </EntityChip>
                )}
              </div>
              <pre className="logs-pre">{row.message || ''}</pre>
              {row.fields && Object.keys(row.fields).length > 0 && (
                <>
                  <div className="logs-detail-label">Fields</div>
                  <pre className="logs-pre">{JSON.stringify(row.fields, null, 2)}</pre>
                </>
              )}
            </div>
          </Panel>
        )
      })()}
    </div>
  )
}
