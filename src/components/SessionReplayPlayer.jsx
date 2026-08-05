import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiPlay, FiPause, FiEyeOff, FiExternalLink, FiRefreshCw } from 'react-icons/fi'
import {
  Badge, Banner, Button, EmptyState, Grid, Segmented, Skeleton,
} from '@open-family/ui'
import { useApi } from '../hooks/useApi'
import { fmtAgo } from '../theme/format'

/**
 * Experience replay — SessionReplayPlayer
 * Renders a masked DOM event log (MutationObserver / click / input / nav / longtask / resource), NOT rrweb pixels.
 */
const MARKER_TONE = {
  click: 'good',
  input: 'warning',
  navigation: 'good',
  longtask: 'critical',
  resource: 'neutral',
  mutation: 'neutral',
  snapshot: 'neutral',
  ajax: 'good',
}

// Local spacing/typography, expressed in tokens. This component has no
// stylesheet of its own, so the few layout rules it needs live here rather than
// as raw pixel literals inline.
const S = {
  root: { padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--border-default)' },
  head: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    marginBottom: 'var(--space-3)', flexWrap: 'wrap',
  },
  filters: { marginBottom: 'var(--space-3)' },
  scrub: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    marginBottom: 'var(--space-3)',
  },
  clock: { minWidth: 72, fontSize: 'var(--text-xs)' },
  paneLabel: { fontSize: 'var(--text-xs)', marginBottom: 'var(--space-1)' },
  pre: {
    margin: 0, fontSize: 'var(--text-2xs)', whiteSpace: 'pre-wrap',
    maxHeight: 160, overflow: 'auto',
  },
  preInset: {
    margin: 0, fontSize: 'var(--text-2xs)', whiteSpace: 'pre-wrap',
    maxHeight: 160, overflow: 'auto',
    background: 'var(--surface-2)', padding: 'var(--space-2)',
    borderRadius: 'var(--radius-sm)',
  },
  list: { marginTop: 'var(--space-3)', maxHeight: 180, overflow: 'auto', overscrollBehavior: 'contain' },
  row: {
    display: 'flex', gap: 'var(--space-2)', alignItems: 'center',
    padding: '2px 0', cursor: 'pointer', fontSize: 'var(--text-2xs)',
  },
  rowOffset: { width: 64, flex: '0 0 auto' },
  rowLabel: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
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
  // One strip, one choice — which is what a Segmented is for. The counts stay on
  // the items so the strip is still the legend it used to be.
  const filterItems = [
    { value: 'all', label: `All ${events.length}` },
    ...legendTypes
      .filter((t) => byType[t])
      .map((t) => ({ value: t, label: `${t} ${byType[t]}` })),
  ]

  const pickEvent = (i) => { setPlaying(false); setIdx(i) }

  return (
    <div className="replay-player" style={S.root}>
      <div style={S.head}>
        <strong>Session replay</strong>
        <Badge>{events.length} events</Badge>
        <Badge>{chunkCount} chunks</Badge>
        {masked && (
          <Badge tone="warning" icon={<FiEyeOff />}>privacy: masked DOM event log</Badge>
        )}
        <span className="oui-text-muted oui-text-sm">
          {timeline.data?.honesty || 'masked DOM event log — not rrweb'}
        </span>
      </div>

      {filterItems.length > 1 && (
        <div style={S.filters}>
          <Segmented
            aria-label="Event type"
            items={filterItems}
            value={filter}
            onChange={setFilter}
          />
        </div>
      )}

      {/* Loading, failed and genuinely empty are three different messages. */}
      {timeline.loading && (
        <div aria-busy="true">
          <Skeleton height={34} />
        </div>
      )}
      {timeline.error && (
        <Banner
          tone="critical"
          title="Replay timeline could not be loaded"
          actions={(
            <Button size="sm" variant="ghost" icon={<FiRefreshCw />} onClick={timeline.reload}>
              Retry
            </Button>
          )}
        >
          {String(timeline.error)}
        </Banner>
      )}
      {!timeline.loading && !timeline.error && events.length === 0 && (
        <EmptyState
          inline
          title="No replay stored for this session"
          description={'opa-rum-js only ships replay chunks when data-replay="true" is set on the snippet. Nothing was recorded for this session.'}
        />
      )}

      {filtered.length > 0 && (
        <>
          <div style={S.scrub}>
            <Button
              variant="ghost"
              size="sm"
              icon={playing ? <FiPause /> : <FiPlay />}
              onClick={() => setPlaying((p) => !p)}
              title={playing ? 'Pause' : 'Play'}
              aria-label={playing ? 'Pause the replay' : 'Play the replay'}
            />
            <input
              type="range"
              min={0}
              max={Math.max(0, filtered.length - 1)}
              value={idx}
              onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)) }}
              style={{ flex: 1 }}
              aria-label="Replay scrubber"
            />
            <span className="oui-mono oui-num oui-text-muted" style={S.clock}>
              +{scrubMs}ms / {span}ms
            </span>
          </div>

          <Grid columns={2}>
            <div>
              <div className="oui-text-muted" style={S.paneLabel}>Current event</div>
              <pre className="oui-mono" style={S.pre}>
                {JSON.stringify(current, null, 2)}
              </pre>
              {nearestAjax?.trace_id && (
                <div style={{ marginTop: 'var(--space-2)' }}>
                  <Button
                    size="sm"
                    icon={<FiExternalLink />}
                    onClick={() => navigate(`/traces/${encodeURIComponent(nearestAjax.trace_id)}`)}
                  >
                    Open trace at scrub time
                  </Button>
                </div>
              )}
            </div>
            <div>
              <div className="oui-text-muted" style={S.paneLabel}>Text reconstruction (masked)</div>
              <pre className="oui-mono" style={S.preInset}>
                {reconstruction || '—'}
              </pre>
            </div>
          </Grid>

          <div style={S.list}>
            {filtered.map((e, i) => (
              <div
                key={`${e.t}-${e.type}-${i}`}
                role="button"
                tabIndex={0}
                onClick={() => pickEvent(i)}
                // The previous handler was an empty function, so a keyboard user
                // could focus a row and never select it.
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault()
                    pickEvent(i)
                  }
                }}
                aria-pressed={i === idx}
                style={{ ...S.row, background: i === idx ? 'var(--surface-2)' : undefined }}
                className="oui-mono"
              >
                <span className="oui-text-muted oui-num" style={S.rowOffset}>+{(e.t || 0) - t0}ms</span>
                <Badge tone={MARKER_TONE[e.type] || 'neutral'}>{e.type}</Badge>
                <span style={S.rowLabel}>{markerLabel(e)}</span>
                <span className="oui-text-muted">{e.t ? fmtAgo(new Date(e.t).toISOString()) : ''}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
