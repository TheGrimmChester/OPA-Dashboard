import React, { useState, useMemo } from 'react'
import './TraceNetworkView.css'

// Phase definitions: order matters for the stacked bar (left -> right).
// Colors follow the dashboard convention: DNS=purple, Connect=blue, Wait=orange, Download=green.
const PHASES = [
  { key: 'dns', label: 'DNS', color: 'var(--color-primary-purple)' },
  { key: 'connect', label: 'Connect', color: 'var(--color-primary-blue)' },
  { key: 'wait', label: 'Wait/TTFB', color: 'var(--color-primary-orange)' },
  { key: 'download', label: 'Download', color: 'var(--color-primary-green)' },
]

const clamp0 = (n) => (Number.isFinite(n) && n > 0 ? n : 0)

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Human-readable byte formatting (B / KB / MB).
function formatBytes(bytes) {
  const b = num(bytes)
  if (b <= 0) return '0 B'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}

function formatMs(ms) {
  return `${num(ms).toFixed(2)} ms`
}

function truncateUrl(url, max = 60) {
  if (!url) return ''
  if (url.length <= max) return url
  return `${url.slice(0, max - 1)}…`
}

// Derive a normalized model from a raw request item.
function normalize(item, index) {
  const r = (item && item.request) || {}
  const url = r.url || r.uri || ''
  const method = (r.method || 'GET').toUpperCase()
  const status = num(r.status_code)
  const total = num(r.duration_ms)

  const dnsAbs = num(r.dns_time_ms)
  const connectAbs = num(r.connect_time_ms)
  const networkAbs = num(r.network_time_ms)

  // Detect whether we have any of the cumulative timing fields.
  const hasPhaseData =
    r.dns_time_ms != null ||
    r.connect_time_ms != null ||
    r.network_time_ms != null

  const dns = clamp0(dnsAbs)
  const connect = clamp0(connectAbs - dnsAbs)
  const wait = clamp0(networkAbs - connectAbs)
  const download = clamp0(total - networkAbs)

  const bytesReceived = num(r.curl_bytes_received) || num(r.bytes_received) || num(r.response_size)
  const bytesSent = num(r.bytes_sent)

  return {
    id: index,
    spanName: item && item.spanName,
    url,
    method,
    status,
    total,
    dns,
    connect,
    wait,
    download,
    hasPhaseData,
    bytesReceived,
    bytesSent,
  }
}

function statusClass(status) {
  if (status >= 200 && status < 300) return 'success'
  if (status >= 300 && status < 400) return 'warning'
  if (status >= 400) return 'error'
  return 'muted'
}

const SORT_COLUMNS = [
  { key: 'method', label: 'Method', numeric: false },
  { key: 'url', label: 'URL', numeric: false },
  { key: 'status', label: 'Status', numeric: true },
  { key: 'dns', label: 'DNS', numeric: true },
  { key: 'connect', label: 'Connect', numeric: true },
  { key: 'wait', label: 'Wait', numeric: true },
  { key: 'download', label: 'Download', numeric: true },
  { key: 'total', label: 'Total', numeric: true },
  { key: 'bytesReceived', label: 'Bytes', numeric: true },
]

export default function TraceNetworkView({ requests }) {
  const [sortKey, setSortKey] = useState('total')
  const [sortDir, setSortDir] = useState('desc')

  const rows = useMemo(() => {
    const list = Array.isArray(requests) ? requests : []
    return list
      .filter((it) => it && it.type === 'http')
      .map((it, i) => normalize(it, i))
  }, [requests])

  const maxTotal = useMemo(
    () => rows.reduce((m, r) => Math.max(m, r.total), 0) || 1,
    [rows]
  )

  const sortedRows = useMemo(() => {
    const col = SORT_COLUMNS.find((c) => c.key === sortKey)
    const numeric = col ? col.numeric : true
    const copy = [...rows]
    copy.sort((a, b) => {
      let av = a[sortKey]
      let bv = b[sortKey]
      if (numeric) {
        av = num(av)
        bv = num(bv)
        return sortDir === 'asc' ? av - bv : bv - av
      }
      av = String(av || '').toLowerCase()
      bv = String(bv || '').toLowerCase()
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return copy
  }, [rows, sortKey, sortDir])

  const handleSort = (key) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      // Numeric columns default to descending, text columns to ascending.
      const col = SORT_COLUMNS.find((c) => c.key === key)
      setSortDir(col && !col.numeric ? 'asc' : 'desc')
    }
  }

  if (rows.length === 0) {
    return (
      <div className="TraceNetworkView">
        <div className="tnv-empty">No HTTP requests recorded for this trace.</div>
      </div>
    )
  }

  return (
    <div className="TraceNetworkView">
      <div className="tnv-legend">
        {PHASES.map((p) => (
          <span className="tnv-legend-item" key={p.key}>
            <span className="tnv-legend-swatch" style={{ background: p.color }} />
            {p.label}
          </span>
        ))}
      </div>

      {/* Section 1: Timing waterfall */}
      <section className="tnv-section">
        <h3 className="tnv-section-title">Timing Waterfall</h3>
        <div className="tnv-waterfall">
          {rows.map((r) => {
            const scale = 100 / maxTotal // percentage of full row per ms
            return (
              <div className="tnv-wf-row" key={r.id}>
                <div className="tnv-wf-meta">
                  <span className={`tnv-method tnv-method-${r.method.toLowerCase()}`}>
                    {r.method}
                  </span>
                  <span className="tnv-url" title={r.url}>
                    {truncateUrl(r.url)}
                  </span>
                  <span className={`tnv-badge tnv-status-${statusClass(r.status)}`}>
                    {r.status || '—'}
                  </span>
                  <span className="tnv-wf-total">{formatMs(r.total)}</span>
                </div>

                <div className="tnv-wf-track">
                  {r.hasPhaseData ? (
                    PHASES.map((p) => {
                      const val = r[p.key]
                      if (val <= 0) return null
                      return (
                        <div
                          key={p.key}
                          className="tnv-wf-seg"
                          style={{ width: `${val * scale}%`, background: p.color }}
                          title={`${p.label}: ${formatMs(val)}`}
                        />
                      )
                    })
                  ) : (
                    <div
                      className="tnv-wf-seg tnv-wf-seg-total"
                      style={{ width: `${r.total * scale}%` }}
                      title={`Total: ${formatMs(r.total)}`}
                    />
                  )}
                </div>

                <div className="tnv-wf-bytes">
                  <span className="tnv-bytes-badge" title="Bytes sent">
                    ↑ {formatBytes(r.bytesSent)}
                  </span>
                  <span className="tnv-bytes-badge" title="Bytes received">
                    ↓ {formatBytes(r.bytesReceived)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Section 2: Sortable table */}
      <section className="tnv-section">
        <h3 className="tnv-section-title">Request Details</h3>
        <div className="tnv-table-wrap">
          <table className="tnv-table">
            <thead>
              <tr>
                {SORT_COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className={`${c.numeric ? 'tnv-th-num' : ''} ${
                      sortKey === c.key ? 'tnv-th-active' : ''
                    }`}
                    onClick={() => handleSort(c.key)}
                  >
                    <span className="tnv-th-inner">
                      {c.label}
                      <span className="tnv-sort-arrow">
                        {sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className={`tnv-method tnv-method-${r.method.toLowerCase()}`}>
                      {r.method}
                    </span>
                  </td>
                  <td className="tnv-td-url" title={r.url}>
                    {truncateUrl(r.url, 50)}
                  </td>
                  <td className="tnv-th-num">
                    <span className={`tnv-badge tnv-status-${statusClass(r.status)}`}>
                      {r.status || '—'}
                    </span>
                  </td>
                  <td className="tnv-th-num">{r.hasPhaseData ? formatMs(r.dns) : '—'}</td>
                  <td className="tnv-th-num">{r.hasPhaseData ? formatMs(r.connect) : '—'}</td>
                  <td className="tnv-th-num">{r.hasPhaseData ? formatMs(r.wait) : '—'}</td>
                  <td className="tnv-th-num">{r.hasPhaseData ? formatMs(r.download) : '—'}</td>
                  <td className="tnv-th-num tnv-td-total">{formatMs(r.total)}</td>
                  <td className="tnv-th-num">{formatBytes(r.bytesReceived)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
