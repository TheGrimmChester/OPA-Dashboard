import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiPlay, FiPause, FiEyeOff, FiExternalLink } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Badge, StatusPill } from '../components/ui'
import { fmtAgo } from '../theme/format'

/**
 * Wave 28 — SessionReplayPlayer
 * Renders a masked DOM event log (MutationObserver / click / input / nav / longtask / resource), NOT rrweb pixels.
 */
const MARKER_TONE = {
  click: 'ok',
  input: 'warn',
  navigation: 'ok',
  longtask: 'error',
  resource: 'neutral',
  mutation: 'neutral',
  snapshot: 'neutral',
  ajax: 'ok',
}

function markerLabel(e) {
  if (!e) return '—'
  if (e.type === 'navigation') return e.url || e.title || 'navigate'
  if (e.type === 'longtask') return `${e.name || 'longtask'} ${e.duration_ms != null ? `${Math.round(e.duration_ms)}ms` : ''}`
  if (e.type === 'resource') {
    const sz = e.transfer_size != null ? ` ${e.transfer_size}B` : ''
    return `${e.name || e.url || 'resource'}${sz}`
  }
  if (e.type === 'ajax') return `${e.method || ''} ${e.url || e.target || ''} ${e.status || ''}`.trim()
  return e.target || e.url || e.mutation || e.title || e.name || '—'
}

export default function SessionReplayPlayer({ sessionId, ajaxEvents, ajaxRows }) {
  const navigate = useNavigate()
  const ajaxList = ajaxEvents || ajaxRows || []
  const timeline = useApi(
    `/api/rum/replay-timeline/${encodeURIComponent(sessionId || '')}`,
    {},
    { skip: !sessionId, noRange: true },
  )
  const chunks = useApi(
    `/api/rum/replay/${encodeURIComponent(sessionId || '')}`,
    {},
    { skip: !sessionId, noRange: true },
  )

  const events = timeline.data?.events || []
  const byType = timeline.data?.by_type || {}
  const masked = timeline.data?.masked !== false
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [filter, setFilter] = useState('all')
  const timer = useRef(null)

  useEffect(() => {
    setIdx(0)
    setPlaying(false)
    setFilter('all')
  }, [sessionId])

  const filtered = useMemo(() => {
    if (filter === 'all') return events
    return events.filter((e) => e.type === filter)
  }, [events, filter])

  useEffect(() => {
    setIdx(0)
  }, [filter])

  useEffect(() => {
    if (!playing || filtered.length === 0) {
      if (timer.current) clearInterval(timer.current)
      return undefined
    }
    timer.current = setInterval(() => {
      setIdx((i) => {
        if (i >= filtered.length - 1) {
          setPlaying(false)
          return i
        }
        return i + 1
      })
    }, 400)
    return () => clearInterval(timer.current)
  }, [playing, filtered.length])

  const current = filtered[idx] || null
  const t0 = events[0]?.t || 0
  const t1 = events[events.length - 1]?.t || t0
  const span = Math.max(1, t1 - t0)
  const scrubMs = current?.t != null ? current.t - t0 : 0

  const nearestAjax = useMemo(() => {
    if (!ajaxList.length || current?.t == null) return null
    let best = null
    let bestDist = Infinity
    for (const a of ajaxList) {
      const at = Date.parse(a.occurred_at || a.at || '') || 0
      if (!at || !a.trace_id) continue
      const dist = Math.abs(at - current.t)
      if (dist < bestDist) {
        bestDist = dist
        best = a
      }
    }
    return bestDist < 5000 ? best : null
  }, [ajaxList, current])

  const reconstruction = useMemo(() => {
    const lines = []
    for (let i = 0; i <= idx && i < filtered.length; i++) {
      const e = filtered[i]
      if (e.type === 'snapshot') {
        lines.push(`# ${e.title || 'page'} ${e.url || ''}`)
      } else if (e.type === 'click') {
        lines.push(`click → ${e.target || '?'}`)
      } else if (e.type === 'input') {
        lines.push(`input ${e.target || '?'} = ${e.value || '****'}`)
      } else if (e.type === 'mutation') {
        lines.push(`dom ${e.mutation || 'change'} ${e.target || ''} +${e.added || 0}/-${e.removed || 0}`)
      } else if (e.type === 'navigation') {
        lines.push(`nav → ${e.url || e.title || '?'}`)
      } else if (e.type === 'longtask') {
        lines.push(`longtask ${Math.round(e.duration_ms || 0)}ms ${e.name || ''}`)
      } else if (e.type === 'resource') {
        lines.push(`resource ${e.name || e.url || '?'} ${e.duration_ms != null ? Math.round(e.duration_ms) + 'ms' : ''}`)
      } else {
        lines.push(`${e.type || 'event'} ${markerLabel(e)}`)
      }
    }
    return lines.slice(-40).join('\n')
  }, [filtered, idx])

  if (!sessionId) return null

  const chunkCount = (chunks.data?.chunks || []).length || timeline.data?.chunk_count || 0
  const legendTypes = timeline.data?.marker_types || Object.keys(byType)

  return (
    <div className="replay-player" style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <strong className="opa-mono">SessionReplayPlayer</strong>
        <Badge>{events.length} events</Badge>
        <Badge>{chunkCount} chunks</Badge>
        {masked && (
          <StatusPill tone="warn"><FiEyeOff size={10} /> privacy: masked DOM event log</StatusPill>
        )}
        <span className="opa-muted" style={{ fontSize: 11 }}>
          {timeline.data?.honesty || 'masked DOM event log — not rrweb'}
        </span>
      </div>

      {Object.keys(byType).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          <button type="button" className={`opa-btn ghost ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            all {events.length}
          </button>
          {legendTypes.map((t) => (
            byType[t] ? (
              <button
                key={t}
                type="button"
                className={`opa-btn ghost ${filter === t ? 'active' : ''}`}
                onClick={() => setFilter(t)}
                title={`${byType[t]} ${t} markers`}
              >
                <StatusPill tone={MARKER_TONE[t] || 'neutral'}>{t}</StatusPill>
                <span className="opa-mono" style={{ marginLeft: 4 }}>{byType[t]}</span>
              </button>
            ) : null
          ))}
        </div>
      )}

      {timeline.loading && <div className="opa-muted">Loading replay timeline…</div>}
      {timeline.error && <div style={{ color: 'var(--error)' }}>{String(timeline.error)}</div>}
      {!timeline.loading && events.length === 0 && (
        <div className="opa-muted">No replay chunks for this session. Enable <code>data-replay=&quot;true&quot;</code> on opa-rum-js.</div>
      )}

      {filtered.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <button type="button" className="opa-btn ghost" onClick={() => setPlaying((p) => !p)} title={playing ? 'Pause' : 'Play'}>
              {playing ? <FiPause /> : <FiPlay />}
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(0, filtered.length - 1)}
              value={idx}
              onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)) }}
              style={{ flex: 1 }}
              aria-label="Replay scrubber"
            />
            <span className="opa-mono opa-muted" style={{ fontSize: 11, minWidth: 72 }}>
              +{scrubMs}ms / {span}ms
            </span>
          </div>

          <div className="opa-grid cols-2" style={{ gap: 12 }}>
            <div>
              <div className="opa-muted" style={{ fontSize: 11, marginBottom: 4 }}>Current event</div>
              <pre className="opa-mono" style={{ fontSize: 11, margin: 0, whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>
                {JSON.stringify(current, null, 2)}
              </pre>
              {nearestAjax?.trace_id && (
                <button
                  type="button"
                  className="opa-btn ghost"
                  style={{ marginTop: 8 }}
                  onClick={() => navigate(`/traces/${encodeURIComponent(nearestAjax.trace_id)}`)}
                >
                  <FiExternalLink size={12} /> Open trace at scrub time
                </button>
              )}
            </div>
            <div>
              <div className="opa-muted" style={{ fontSize: 11, marginBottom: 4 }}>Text reconstruction (masked)</div>
              <pre className="opa-mono" style={{ fontSize: 11, margin: 0, whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto', background: 'var(--surface-2)', padding: 8 }}>
                {reconstruction || '—'}
              </pre>
            </div>
          </div>

          <div style={{ marginTop: 10, maxHeight: 180, overflow: 'auto' }}>
            {filtered.map((e, i) => (
              <div
                key={`${e.t}-${e.type}-${i}`}
                role="button"
                tabIndex={0}
                onClick={() => { setPlaying(false); setIdx(i) }}
                onKeyDown={() => {}}
                style={{
                  display: 'flex', gap: 8, padding: '2px 0', cursor: 'pointer',
                  background: i === idx ? 'var(--surface-2)' : undefined, fontSize: 11,
                }}
                className="opa-mono"
              >
                <span className="opa-muted" style={{ width: 64 }}>+{(e.t || 0) - t0}ms</span>
                <StatusPill tone={MARKER_TONE[e.type] || 'neutral'}>{e.type}</StatusPill>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {markerLabel(e)}
                </span>
                <span className="opa-muted">{e.t ? fmtAgo(new Date(e.t).toISOString()) : ''}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
