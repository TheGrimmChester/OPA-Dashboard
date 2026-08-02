import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { FiChevronRight } from 'react-icons/fi'
import { fmtMs, tierColor, latencyStatus } from '../theme/format'
import {
  WATERFALL_ROW_H,
  buildWaterfallDisplayRows,
} from '../utils/waterfallRows'

function spanTier(span) {
  const n = String(span?.name || '').toLowerCase()
  if (n.includes('pdo') || n.includes('sql') || n.includes('select') || n.includes('mysql') ||
      n.includes('query') || n.includes('insert') || n.includes('update') || n.includes('delete')) return 'db'
  if (n.includes('redis') || n.includes('cache')) return 'redis'
  if (n.includes('curl') || n.includes('http') || n.includes('guzzle') || n.includes('fetch')) return 'http'
  return 'app'
}

/**
 * Virtualized trace waterfall with optional collapse of self-recursive noise.
 */
export default function TraceWaterfall({
  rows,
  totalMs,
  traceStart,
  selectedSpanId,
  onSelect,
  multiService,
  serviceColor,
  isServiceEntry,
  viewportHeight,
  collapseNoise,
  onToggleCollapse,
  truncatedMeta,
  /** Span ids started by waterfall replay playhead (progressive highlight). */
  highlightIds,
  /** Absolute playhead offset in ms from traceStart for the scrubber line. */
  playheadMs,
}) {
  const [expandedGroupIds, setExpandedGroupIds] = useState(() => new Set())
  const parentRef = useRef(null)

  const { displayRows, totalSpans, visibleSpans, collapsedCount } = useMemo(
    () => buildWaterfallDisplayRows(rows, { collapseNoise, expandedGroupIds }),
    [rows, collapseNoise, expandedGroupIds],
  )

  const virtualizer = useVirtualizer({
    count: displayRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => WATERFALL_ROW_H,
    overscan: 12,
  })

  // Scroll the selected span into view when ?span= changes.
  useEffect(() => {
    if (!selectedSpanId || !displayRows.length) return
    const idx = displayRows.findIndex((r) => {
      if (r.kind === 'span') return r.span?.span_id === selectedSpanId
      if (r.kind === 'group') return (r.members || []).some((m) => m.span_id === selectedSpanId)
      return false
    })
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'center' })
    // virtualizer identity changes often; index lookup is enough
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSpanId, displayRows])

  const toggleGroup = useCallback((groupId) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }, [])

  const maxH = Math.max(300, Math.min(680, viewportHeight || 480))
  const highlightSet = useMemo(() => {
    if (!highlightIds || !highlightIds.length) return null
    return new Set(highlightIds)
  }, [highlightIds])
  const playheadPct = playheadMs != null && totalMs > 0
    ? Math.min(100, Math.max(0, (Number(playheadMs) / totalMs) * 100))
    : null

  return (
    <div className="tw-wrap">
      {(truncatedMeta?.spans_truncated || truncatedMeta?.expansion_truncated) && (
        <div className="tw-banner" role="status">
          Trace payload truncated for display
          {truncatedMeta.span_count_total != null && truncatedMeta.span_count != null && (
            <> — showing {truncatedMeta.span_count.toLocaleString()} of {truncatedMeta.span_count_total.toLocaleString()} spans</>
          )}
          . Profile may still reflect the full call stack when present.
        </div>
      )}
      <div className="tw-toolbar">
        <label className="tw-collapse-toggle">
          <input
            type="checkbox"
            checked={!!collapseNoise}
            onChange={(e) => onToggleCollapse?.(e.target.checked)}
          />
          Collapse noise
        </label>
        <span className="opa-muted tw-count" title="Rows currently rendered in the waterfall">
          Showing {visibleSpans.toLocaleString()}
          {collapsedCount > 0 ? ` (${collapsedCount.toLocaleString()} hidden in groups)` : ''}
          {' '}of {totalSpans.toLocaleString()} spans
        </span>
      </div>
      <div className="tw-axis">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <div key={f} className="tw-axis-tick" style={{ left: `calc(240px + 10px + (100% - 240px - 10px - 74px - 10px) * ${f})` }}>
            {fmtMs(totalMs * f)}
          </div>
        ))}
      </div>
      <div
        ref={parentRef}
        className="tw-scroller"
        style={{ maxHeight: maxH, height: Math.min(maxH, Math.max(WATERFALL_ROW_H, displayRows.length * WATERFALL_ROW_H)) }}
        data-testid="trace-waterfall-scroller"
      >
        <div className="tw-virt" style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
          {playheadPct != null && (
            <div
              className="tw-playhead"
              style={{ left: `calc(240px + 10px + (100% - 240px - 10px - 74px - 10px) * ${playheadPct / 100})` }}
              aria-hidden
            />
          )}
          {virtualizer.getVirtualItems().map((vRow) => {
            const item = displayRows[vRow.index]
            if (!item) return null
            if (item.kind === 'group') {
              const offset = totalMs > 0 ? ((item.start_ts - traceStart) / totalMs) * 100 : 0
              const width = Math.max(0.8, ((item.duration_ms || 0) / totalMs) * 100)
              const col = tierColor(spanTier(item))
              return (
                <div
                  key={item.key}
                  className="tw-row tw-row-group"
                  role="button"
                  tabIndex={0}
                  aria-expanded={false}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${vRow.size}px`,
                    transform: `translateY(${vRow.start}px)`,
                  }}
                  onClick={() => toggleGroup(item.groupId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleGroup(item.groupId)
                    }
                  }}
                >
                  <div className="tw-label" style={{ paddingLeft: (item._depth || 0) * 14 }}>
                    <FiChevronRight size={12} className="tw-group-chevron" />
                    <span className="tw-tierdot" style={{ background: col }} />
                    <span className="tw-label-name" title={`${item.name} × ${item.count}`}>
                      {item.name}
                      <span className="tw-group-count"> × {item.count.toLocaleString()}</span>
                    </span>
                  </div>
                  <div className="tw-track">
                    <div
                      className="tw-bar tw-bar-group"
                      style={{
                        left: `${Math.min(99, Math.max(0, offset))}%`,
                        width: `${width}%`,
                        background: multiService ? (serviceColor[item.service] || col) : col,
                      }}
                      title={`${item.name} × ${item.count}: ${fmtMs(item.duration_ms)}`}
                    />
                  </div>
                  <div className="tw-dur" style={{ color: `var(--${latencyStatus(item.duration_ms)})` }}>{fmtMs(item.duration_ms)}</div>
                </div>
              )
            }

            const s = item.span
            const offset = totalMs > 0 ? ((s.start_ts - traceStart) / totalMs) * 100 : 0
            const width = Math.max(0.8, ((s.duration_ms || 0) / totalMs) * 100)
            const tier = spanTier(s)
            const col = tierColor(tier)
            const isSel = selectedSpanId && s.span_id === selectedSpanId
            const isHi = highlightSet ? highlightSet.has(s.span_id) : false
            const isDim = highlightSet ? !isHi : false
            return (
              <div
                key={item.key}
                className={`tw-row ${isSel ? 'is-selected' : ''} ${isHi ? 'is-replay-active' : ''} ${isDim ? 'is-replay-dim' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={!!isSel}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${vRow.size}px`,
                  transform: `translateY(${vRow.start}px)`,
                }}
                onClick={() => onSelect?.(s)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect?.(s)
                  }
                }}
              >
                <div className="tw-label" style={{ paddingLeft: (s._depth || 0) * 14 }}>
                  {multiService && <span className="tw-tierdot" style={{ background: serviceColor[s.service] || 'var(--neutral)' }} title={s.service} />}
                  <span className="tw-tierdot" style={{ background: col }} />
                  <span className="tw-label-name" title={`${s.name} · ${s.service || ''}`}>{s.name}</span>
                  {isServiceEntry?.(s) && (
                    <span className="opa-badge" style={{ marginLeft: 6, padding: '0 6px' }} title={`enters ${s.service}`}>
                      <span className="opa-dot" style={{ background: serviceColor[s.service], width: 6, height: 6 }} />{s.service}
                    </span>
                  )}
                </div>
                <div className="tw-track">
                  <div
                    className="tw-bar"
                    style={{
                      left: `${Math.min(99, Math.max(0, offset))}%`,
                      width: `${width}%`,
                      background: multiService ? (serviceColor[s.service] || col) : col,
                    }}
                    title={`${s.name}${s.service ? ` · ${s.service}` : ''}: ${fmtMs(s.duration_ms)} @ +${fmtMs(s.start_ts - traceStart)}`}
                  />
                </div>
                <div className="tw-dur" style={{ color: `var(--${latencyStatus(s.duration_ms)})` }}>{fmtMs(s.duration_ms)}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
