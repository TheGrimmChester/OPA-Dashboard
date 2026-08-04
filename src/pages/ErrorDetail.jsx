import React from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  FiAlertTriangle, FiHash, FiClock, FiActivity, FiList, FiCode, FiChevronLeft, FiGitBranch,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import {
  Panel, KpiTile, TimeSeriesChart, EntityHeader, StatusPill, EmptyState, EntityChip,
} from '../components/ui'
import { fmtNum, fmtAgo } from '../theme/format'
import { logsHref, serviceHref, traceHref, tracesHref } from '../utils/entityLinks'

export default function ErrorDetail() {
  const { errorId } = useParams()
  const id = decodeURIComponent(errorId || '')
  // Error detail endpoint is NOT time-ranged.
  const q = useApi(`/api/errors/${encodeURIComponent(id)}`, {}, { noRange: true })

  const e = q.data || {}
  const message = e.error_message || id
  const service = e.service || ''
  const count = e.count ?? 0
  const stack = e.stack_trace || []
  const related = e.related_traces || []
  const trends = (e.trends || []).map((t) => ({
    time: (t?.time || '').slice(5, 16),
    count: t?.count ?? 0,
  }))

  const hasStack = stack.length > 0
  const hasTrends = trends.length > 0
  const hasRelated = related.length > 0

  return (
    <div className="oui-stack">
      <EntityHeader
        title={id || '—'}
        subtitle={message}
        badges={
          <>
            <StatusPill tone="error">error</StatusPill>
            {service
              ? <EntityChip to={serviceHref(service)} title={`Service ${service}`} mono={false}>{service}</EntityChip>
              : null}
          </>
        }
        meta={
          <span className="oui-text-muted" style={{ fontSize: 'var(--text-xs)' }}>
            {fmtNum(count)} occurrence{count === 1 ? '' : 's'}
          </span>
        }
        actions={
          <div className="oui-row" style={{ gap: 8 }}>
            <Link className="opa-btn ghost" to={tracesHref({ service: service || undefined, status: 'error' })}>
              Error traces
            </Link>
            {service && (
              <Link className="opa-btn ghost" to={logsHref({ service, level: 'ERROR' })}>Logs</Link>
            )}
            <Link to="/errors" className="oui-row" style={{ gap: 'var(--space-1)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              <FiChevronLeft size={13} /> Errors
            </Link>
          </div>
        }
      />

      {/* KPIs */}
      <div className="opa-grid cols-3">
        <KpiTile
          label="Occurrences"
          icon={<FiHash size={12} />}
          value={fmtNum(count)}
          unit="events"
          status={count > 0 ? 'error' : 'neutral'}
        />
        <KpiTile
          label="First seen"
          icon={<FiClock size={12} />}
          value={fmtAgo(e.first_seen)}
          status="neutral"
          footer={<span className="oui-text-muted oui-mono" style={{ fontSize: 'var(--text-2xs)' }}>{e.first_seen || '—'}</span>}
        />
        <KpiTile
          label="Last seen"
          icon={<FiAlertTriangle size={12} />}
          value={fmtAgo(e.last_seen)}
          status={count > 0 ? 'warn' : 'neutral'}
          footer={<span className="oui-text-muted oui-mono" style={{ fontSize: 'var(--text-2xs)' }}>{e.last_seen || '—'}</span>}
        />
      </div>

      {/* Occurrence trend */}
      <Panel title="Occurrence trend" icon={<FiActivity />} loading={q.loading} error={q.error}>
        {hasTrends ? (
          <TimeSeriesChart
            data={trends}
            series={[{ key: 'count', name: 'Occurrences', color: 'var(--critical-text)', type: 'bar' }]}
            valueFmt={(v) => fmtNum(v)}
            yFmt={(v) => fmtNum(v)}
            height={220}
          />
        ) : (
          <EmptyState icon={<FiActivity />} title="No occurrence trend" hint="No time-bucketed counts recorded for this error." />
        )}
      </Panel>

      {/* Stack trace */}
      <Panel title="Stack trace" icon={<FiCode />}
        loading={q.loading} error={q.error}
        actions={hasStack ? <span className="oui-text-muted" style={{ fontSize: 'var(--text-xs)' }}>{stack.length} frame{stack.length === 1 ? '' : 's'}</span> : null}>
        {hasStack ? (
          <pre className="oui-mono" style={{
            margin: 0, padding: 'var(--space-3)', overflow: 'auto',
            fontSize: 'var(--text-xs)', lineHeight: 1.6, color: 'var(--text-secondary)',
            background: 'var(--surface-2)', borderRadius: 6, maxHeight: 460,
            whiteSpace: 'pre', tabSize: 2,
          }}>
            {stack.map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <span className="oui-text-muted oui-num" style={{ minWidth: 30, textAlign: 'right', userSelect: 'none', opacity: 0.6 }}>{i}</span>
                <span style={{ color: 'var(--text-primary)' }}>{String(line)}</span>
              </div>
            ))}
          </pre>
        ) : (
          <EmptyState icon={<FiCode />} title="No stack trace captured" hint="This error was recorded without a stack trace." />
        )}
      </Panel>

      {/* Related traces */}
      <Panel title="Related traces" icon={<FiGitBranch />} flush
        loading={q.loading} error={q.error}
        actions={hasRelated ? <span className="oui-text-muted" style={{ fontSize: 'var(--text-xs)' }}>{related.length} trace{related.length === 1 ? '' : 's'}</span> : null}>
        {hasRelated ? (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {related.map((t, i) => {
              const tid = t?.trace_id || ''
              return (
                <li key={tid || i} style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  padding: 'var(--space-2) var(--space-3)', borderBottom: '1px solid var(--border-subtle)',
                }}>
                  <FiList size={13} className="oui-text-muted" />
                  {tid ? (
                    <EntityChip to={traceHref(tid)} title={tid}>{tid}</EntityChip>
                  ) : (
                    <span className="oui-text-muted oui-mono">—</span>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState icon={<FiGitBranch />} title="No related traces" hint="No traces are linked to this error." />
        )}
      </Panel>
    </div>
  )
}
