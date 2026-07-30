import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiPlay, FiPause, FiEyeOff, FiExternalLink } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Badge, StatusPill } from '../components/ui'
import { fmtAgo } from '../theme/format'

/**
 * Wave 28 — SessionReplayPlayer
 * Renders a masked DOM event log (MutationObserver / click / input), NOT rrweb pixels.
 */
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
  const masked = timeline.data?.masked !== false
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    setIdx(0)
    setPlaying(false)
  }, [sessionId])

  useEffect(() => {
    if (!playing || events.length === 0) {
      if (timer.current) clearInterval(timer.current)
      return undefined
    }
    timer.current = setInterval(() => {
      setIdx((i) => {
        if (i >= events.length - 1) {
          setPlaying(false)
          return i
        }
        return i + 1
      })
    }, 400)
    return () => clearInterval(timer.current)
  }, [playing, events.length])

  const current = events[idx] || null
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
    // Simple HTML/text reconstruction from masked event log (honesty: not pixel-perfect).
    const lines = []
    for (let i = 0; i <= idx && i < events.length; i++) {
      const e = events[i]
      if (e.type === 'snapshot') {
        lines.push(`# ${e.title || 'page'} ${e.url || ''}`)
      } else if (e.type === 'click') {
        lines.push(`click → ${e.target || '?'}`)
      } else if (e.type === 'input') {
        lines.push(`input ${e.target || '?'} = ${e.value || '****'}`)
      } else if (e.type === 'mutation') {
        lines.push(`dom ${e.mutation || 'change'} ${e.target || ''} +${e.added || 0}/-${e.removed || 0}`)
      } else {
        lines.push(`${e.type || 'event'} ${e.target || ''}`)
      }
    }
    return lines.slice(-40).join('\n')
  }, [events, idx])

  if (!sessionId) return null

  const chunkCount = (chunks.data?.chunks || []).length || timeline.data?.chunk_count || 0

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

      {timeline.loading && <div className="opa-muted">Loading replay timeline…</div>}
      {timeline.error && <div style={{ color: 'var(--error)' }}>{String(timeline.error)}</div>}
      {!timeline.loading && events.length === 0 && (
        <div className="opa-muted">No replay chunks for this session. Enable <code>data-replay=&quot;true&quot;</code> on opa-rum-js.</div>
      )}

      {events.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <button type="button" className="opa-btn ghost" onClick={() => setPlaying((p) => !p)} title={playing ? 'Pause' : 'Play'}>
              {playing ? <FiPause /> : <FiPlay />}
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(0, events.length - 1)}
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
            {events.map((e, i) => (
              <div
                key={i}
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
                <StatusPill tone={e.type === 'click' ? 'ok' : e.type === 'input' ? 'warn' : 'neutral'}>{e.type}</StatusPill>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.target || e.url || e.mutation || e.title || '—'}
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
