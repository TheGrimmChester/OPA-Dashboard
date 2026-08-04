import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FiPlay, FiPause, FiDownload, FiExternalLink, FiFilm, FiActivity, FiZap, FiRadio, FiList,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Badge, StatusPill, EmptyState } from './ui'
import { fmtMs } from '../theme/format'
import { spanIdsStartedBy } from '../utils/traceReplay'
import './TraceReplayPanel.css'

const MODE_ICON = {
  waterfall: FiFilm,
  rum_session: FiActivity,
  perf_lab: FiZap,
  synthetics: FiRadio,
  har_export: FiDownload,
  step_list: FiList,
}

const API = import.meta.env.VITE_API_URL || ''

/**
 * Trace replay modes panel — waterfall scrubber + linked RUM / Perf Lab /
 * synthetics / HAR when the Agent capability catalog says data exists.
 */
export default function TraceReplayPanel({
  traceId,
  rows = [],
  totalMs = 1,
  traceStart = 0,
  activeMode,
  onModeChange,
  onPlayheadChange,
  onHighlightIds,
}) {
  const replay = useApi(
    `/api/traces/${encodeURIComponent(traceId || '')}/replay`,
    {},
    { skip: !traceId, noRange: true },
  )
  const modes = replay.data?.modes || []
  const [playing, setPlaying] = useState(false)
  const [playhead, setPlayhead] = useState(0)
  const timer = useRef(null)

  const waterfallMode = modes.find((m) => m.id === 'waterfall')
  const stepMode = modes.find((m) => m.id === 'step_list')
  const steps = stepMode?.meta?.steps || []

  useEffect(() => {
    setPlayhead(0)
    setPlaying(false)
  }, [traceId])

  useEffect(() => {
    if (!playing || totalMs <= 0) {
      if (timer.current) clearInterval(timer.current)
      return undefined
    }
    timer.current = setInterval(() => {
      setPlayhead((p) => {
        const next = p + Math.max(5, totalMs / 80)
        if (next >= totalMs) {
          setPlaying(false)
          return totalMs
        }
        return next
      })
    }, 80)
    return () => clearInterval(timer.current)
  }, [playing, totalMs])

  const startedIds = useMemo(
    () => spanIdsStartedBy(rows, playhead, traceStart),
    [rows, playhead, traceStart],
  )

  useEffect(() => {
    onPlayheadChange?.(playhead)
    onHighlightIds?.(activeMode === 'waterfall' ? startedIds : null)
  }, [playhead, startedIds, activeMode, onPlayheadChange, onHighlightIds])

  const download = async (path, filename) => {
    const url = `${API}${path}`
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) throw new Error(`download failed (${res.status})`)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="trp" data-testid="trace-replay-panel">
      <div className="trp-head">
        <strong>Trace replay</strong>
        <span className="oui-text-muted" style={{ fontSize: 11 }}>
          {replay.data?.honesty || 'Modes appear when correlated data exists'}
        </span>
      </div>

      {replay.loading && <div className="oui-text-muted">Loading replay modes…</div>}
      {replay.error && <div style={{ color: 'var(--critical-text)' }}>{String(replay.error)}</div>}

      {!replay.loading && modes.length > 0 && (
        <div className="trp-modes" role="list">
          {modes.map((m) => {
            const Icon = MODE_ICON[m.id] || FiFilm
            const selected = activeMode === m.id
            return (
              <button
                key={m.id}
                type="button"
                role="listitem"
                className={`trp-mode ${m.available ? '' : 'is-disabled'} ${selected ? 'is-selected' : ''}`}
                disabled={!m.available}
                title={m.available ? (m.honesty || m.label) : (m.reason || 'Unavailable')}
                onClick={() => {
                  if (!m.available) return
                  onModeChange?.(selected ? null : m.id)
                }}
              >
                <Icon size={14} />
                <span className="trp-mode-label">{m.label}</span>
                {m.available
                  ? <StatusPill tone="ok">ready</StatusPill>
                  : <StatusPill tone="neutral">n/a</StatusPill>}
              </button>
            )
          })}
        </div>
      )}

      {modes.filter((m) => !m.available).length > 0 && activeMode == null && (
        <div className="trp-empty-hint oui-text-muted">
          Unavailable modes stay listed with reasons — e.g. no RUM session, load run, or HTTP spans.
        </div>
      )}

      {activeMode === 'waterfall' && (waterfallMode?.available !== false) && (
        <div className="trp-waterfall" data-testid="trace-replay-waterfall">
          <div className="trp-scrub">
            <button
              type="button"
              className="opa-btn ghost"
              onClick={() => setPlaying((p) => !p)}
              title={playing ? 'Pause' : 'Play'}
              aria-label={playing ? 'Pause waterfall replay' : 'Play waterfall replay'}
            >
              {playing ? <FiPause /> : <FiPlay />}
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(1, totalMs)}
              step={Math.max(1, totalMs / 200)}
              value={playhead}
              onChange={(e) => { setPlaying(false); setPlayhead(Number(e.target.value)) }}
              aria-label="Waterfall playhead"
              style={{ flex: 1 }}
            />
            <span className="oui-mono oui-text-muted" style={{ fontSize: 11, minWidth: 88 }}>
              {fmtMs(playhead)} / {fmtMs(totalMs)}
            </span>
            <Badge>{startedIds.length} spans</Badge>
          </div>
          <p className="oui-text-muted" style={{ fontSize: 11, margin: '6px 0 0' }}>
            Waterfall playback highlights spans that have started by the playhead. This is not a browser session recording.
          </p>
        </div>
      )}

      {activeMode === 'rum_session' && (
        <div className="trp-linkout">
          {modes.find((m) => m.id === 'rum_session')?.available ? (
            <>
              <p className="oui-text-muted" style={{ fontSize: 12 }}>
                Open the masked RUM event-log player for session{' '}
                <code className="oui-mono">{modes.find((m) => m.id === 'rum_session')?.meta?.session_id}</code>.
                {modes.find((m) => m.id === 'rum_session')?.meta?.chunk_count === 0 && (
                  <> No replay chunks stored yet — session timeline may still be useful.</>
                )}
              </p>
              <Link className="opa-btn ghost" to={modes.find((m) => m.id === 'rum_session').href}>
                <FiExternalLink size={12} /> Open RUM session replay
              </Link>
            </>
          ) : (
            <EmptyState
              title="No RUM session on this trace"
              hint="Needs ajax.trace_id correlation from opa-rum-js or tags.session_id on spans."
            />
          )}
        </div>
      )}

      {activeMode === 'perf_lab' && (
        <div className="trp-linkout">
          {modes.find((m) => m.id === 'perf_lab')?.available ? (
            <>
              <p className="oui-text-muted" style={{ fontSize: 12 }}>
                Linked load run <code className="oui-mono">{modes.find((m) => m.id === 'perf_lab')?.meta?.load_run_id}</code>
              </p>
              <Link className="opa-btn ghost" to={modes.find((m) => m.id === 'perf_lab').href}>
                <FiExternalLink size={12} /> Open Perf Lab results
              </Link>
            </>
          ) : (
            <EmptyState title="No Perf Lab run" hint="Span tags must carry load_run_id from a Perf Lab dispatch." />
          )}
        </div>
      )}

      {activeMode === 'synthetics' && (
        <div className="trp-linkout">
          {modes.find((m) => m.id === 'synthetics')?.available ? (
            <>
              <p className="oui-text-muted" style={{ fontSize: 12 }}>
                Synthetic check{' '}
                <code className="oui-mono">
                  {modes.find((m) => m.id === 'synthetics')?.meta?.check_name
                    || modes.find((m) => m.id === 'synthetics')?.meta?.check_id}
                </code>
              </p>
              <Link className="opa-btn ghost" to={modes.find((m) => m.id === 'synthetics').href}>
                <FiExternalLink size={12} /> Open synthetics
              </Link>
            </>
          ) : (
            <EmptyState title="No synthetic check" hint="No synthetic_results.trace_id match for this trace." />
          )}
        </div>
      )}

      {(activeMode === 'har_export' || activeMode === 'step_list') && (
        <div className="trp-linkout">
          {steps.length === 0 && !modes.find((m) => m.id === activeMode)?.available ? (
            <EmptyState title="No HTTP steps" hint="This trace has no span.http client calls to export." />
          ) : (
            <>
              <div className="trp-actions">
                {modes.find((m) => m.id === 'har_export')?.available && (
                  <button
                    type="button"
                    className="opa-btn ghost"
                    onClick={() => download(
                      `/api/traces/${encodeURIComponent(traceId)}/replay/har`,
                      `opa-trace-${traceId}.har`,
                    ).catch((e) => console.error(e))}
                  >
                    <FiDownload size={12} /> Download HAR
                  </button>
                )}
                {modes.find((m) => m.id === 'step_list')?.available && (
                  <button
                    type="button"
                    className="opa-btn ghost"
                    onClick={() => download(
                      `/api/traces/${encodeURIComponent(traceId)}/replay/steps`,
                      `opa-trace-${traceId}-steps.json`,
                    ).catch((e) => console.error(e))}
                  >
                    <FiDownload size={12} /> Download steps JSON
                  </button>
                )}
              </div>
              {steps.length > 0 && (
                <div className="trp-steps" data-testid="trace-replay-steps">
                  {steps.map((s, i) => (
                    <div key={`${s.span_id}-${i}`} className="trp-step oui-mono">
                      <span className="oui-text-muted">{i + 1}.</span>
                      <Badge>{s.method || 'GET'}</Badge>
                      <span className="trp-step-url" title={s.url}>{s.url || '—'}</span>
                      <span className="oui-text-muted">{s.status_code || '—'}</span>
                      <span>{fmtMs(s.duration_ms)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
