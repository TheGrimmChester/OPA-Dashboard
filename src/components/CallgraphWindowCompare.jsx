import React, { useMemo, useState } from 'react'
import { FiGitBranch, FiAlertTriangle } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { useTimeRange } from '../contexts/TimeRangeContext'
import { Panel, DataTable, StatusPill, EmptyState, ErrorState, KpiTile } from './ui'
import { fmtNum } from '../theme/format'
import { defaultSplit, fmtSignedMs } from '../utils/callgraphCompare'
import './CallgraphWindowCompare.css'

const CLASS_TONE = {
  'more-calls': 'warn',
  'slower-per-call': 'error',
  new: 'ok',
  removed: 'neutral',
  moved: 'warn',
  unchanged: 'neutral',
}

/**
 * Wave 7B-5: population call-graph diff driven by /api/callgraph/compare.
 * Splits the global time range in half (baseline vs candidate) unless explicit
 * windows are passed.
 */
export default function CallgraphWindowCompare({ service, transaction }) {
  const { from, to } = useTimeRange()
  const windows = useMemo(() => defaultSplit(from, to), [from, to])
  const [svc, setSvc] = useState(service || '')
  const [txn, setTxn] = useState(transaction || '')

  const ready = Boolean(svc.trim() && txn.trim())
  const params = useMemo(() => ({
    service: svc.trim(),
    transaction: txn.trim(),
    from_a: windows.fromA,
    to_a: windows.toA,
    from_b: windows.fromB,
    to_b: windows.toB,
    quantile: 'p95',
    limit: 200,
  }), [svc, txn, windows])

  const { data, loading, error } = useApi(
    '/api/callgraph/compare',
    params,
    { noRange: true, skip: !ready },
  )

  const nodes = Array.isArray(data?.nodes) ? data.nodes : []
  const counts = data?.counts_by_class || {}
  const maxAbs = useMemo(
    () => Math.max(1, ...nodes.map((n) => Math.abs(n.delta?.self_ms || 0))),
    [nodes],
  )
  const stale = ready && loading && Boolean(data)

  const columns = [
    {
      key: 'classification',
      header: 'Why',
      sortable: true,
      render: (r) => <StatusPill tone={CLASS_TONE[r.classification] || 'neutral'}>{r.classification}</StatusPill>,
    },
    {
      key: 'function',
      header: 'Path',
      sortable: true,
      render: (r) => (
        <div>
          <div className="cell-strong">{r.class ? `${r.class}::${r.function}` : r.function}</div>
          <div className="opa-muted cg-diff-meta">{r.call_site || r.path_hash}</div>
        </div>
      ),
    },
    {
      key: 'delta_self',
      header: 'Δ self',
      num: true,
      sortable: true,
      render: (r) => {
        const d = r.delta?.self_ms ?? 0
        return (
          <span className={`opa-mono ${d > 0 ? 'cg-diff-worse' : d < 0 ? 'cg-diff-better' : ''}`}>
            {fmtSignedMs(d)}
          </span>
        )
      },
    },
    {
      key: 'delta_count',
      header: 'Δ count',
      num: true,
      sortable: true,
      render: (r) => {
        const d = r.delta?.samples ?? 0
        return <span className="opa-mono">{d > 0 ? '+' : ''}{fmtNum(d)}</span>
      },
    },
    {
      key: 'bar',
      header: 'Δ self',
      sortable: false,
      render: (r) => {
        const d = r.delta?.self_ms ?? 0
        const pct = Math.min(100, (Math.abs(d) / maxAbs) * 100)
        return (
          <div className="cg-diff-bar-track">
            <div
              className={`cg-diff-bar ${d >= 0 ? 'worse' : 'better'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )
      },
    },
  ]

  const rows = nodes.map((n) => ({
    ...n,
    delta_self: n.delta?.self_ms ?? 0,
    delta_count: n.delta?.samples ?? 0,
  }))

  return (
    <div className={`cg-diff${stale ? ' cg-diff-stale' : ''}`}>
      <Panel title="Call-graph windows" icon={<FiGitBranch />} actions={
        <span className="opa-muted" style={{ fontSize: 'var(--fs-11)' }}>
          baseline {windows.fromA?.slice(0, 19)} → {windows.toA?.slice(0, 19)} · candidate {windows.fromB?.slice(0, 19)} → {windows.toB?.slice(0, 19)}
          {stale ? ' · updating…' : ''}
        </span>
      }>
        <div className="opa-row" style={{ gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <input className="opa-input" placeholder="service" value={svc} onChange={(e) => setSvc(e.target.value)} style={{ minWidth: 160 }} />
          <input className="opa-input" placeholder="transaction (span name)" value={txn} onChange={(e) => setTxn(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
        </div>
      </Panel>

      {!ready && (
        <EmptyState
          title="Pick a service and transaction"
          hint="Compare splits the global time range into two halves and diffs path_hash populations."
        />
      )}
      {ready && error && <ErrorState message={typeof error === 'string' ? error : 'Compare failed'} />}
      {ready && loading && !data && <EmptyState title="Loading compare…" />}

      {data && (
        <>
          {!data.comparable && (
            <div className="cg-diff-banner">
              <FiAlertTriangle />
              Incomparable: {data.incomparable_reason || 'truncated or rate-limited scope'} — deltas may mislead.
            </div>
          )}
          <div className="cg-diff-kpis">
            {['more-calls', 'slower-per-call', 'new', 'removed', 'moved', 'unchanged'].map((k) => (
              <KpiTile key={k} label={k} value={fmtNum(counts[k] || 0)} />
            ))}
          </div>
          <Panel title="Top regressions" icon={<FiGitBranch />}>
            {rows.length === 0
              ? <EmptyState title="No paths in either window" />
              : <DataTable columns={columns} rows={rows} rowKey={(r) => `${r.path_hash}|${r.call_site}`} initialSort={{ key: 'delta_self', dir: 'desc' }} />}
          </Panel>
        </>
      )}
    </div>
  )
}
