import React, { useCallback, useMemo, useState } from 'react'
import {
  FiAlertTriangle, FiCornerDownRight, FiCornerLeftUp, FiCrosshair, FiInfo, FiSearch, FiX,
} from 'react-icons/fi'
import { EmptyState, SegmentedControl } from './ui'
import { fmtNum, fmtPct } from '../theme/format'
import { DIFF_LABELS, METRICS, neighbours, shortestEntryPath } from '../utils/callGraphModel'
import { TYPE_ORDER, typeFill, typeLabel } from '../utils/opTypes'
import { EGO, layoutEgo } from '../utils/callGraphLayout'
import useProfileModel from './profile/useProfileModel'
import { METRIC_LABELS } from './profile/ProfileToolbar'
import { fmtMetric, middleEllipsis } from './profile/HotSpots'

// A hot symbol's callers are typically siblings in one namespace with the SAME
// method name (App\Handler\MessageHandlerN::process), and a box label only has
// ~16-24 characters. Middle-ellipsising those keeps the shared head and the
// shared tail and throws away the one discriminating part, so several different
// boxes render an identical label — which defeats the whole point of the view.
// Drop the namespace instead (it is shared, therefore uninformative here) and
// truncate from the LEFT so Class::method always survives intact.
function boxLabel(key, max) {
  let s = key == null ? '' : String(key)
  const cut = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'))
  // Only strip a qualifier that sits on the CLASS side of the separator.
  if (cut >= 0 && cut < s.length - 1) {
    const method = s.indexOf('::')
    if (method < 0 || cut < method) s = s.slice(cut + 1)
  }
  if (s.length <= max) return s
  if (max <= 1) return '…'
  return `…${s.slice(s.length - (max - 1))}`
}
import './CallGraph.css'

/* ============================================================================
   Call graph — an EGO view, not a drawing of the whole graph.

   A real PHP request aggregates to thousands of symbols and tens of thousands
   of call sites; no layout of that fits the ~340px of usable canvas a 440px
   panel gives you without zooming labels into illegibility. So this draws ONE
   symbol with its callers above and its callees below, at scale 1, and makes
   refocusing the primary interaction. Geometry lives in utils/callGraphLayout
   (pure, unit-tested); this file owns typography, colour and interaction.

   The model comes from useProfileModel -> callGraphModel, which rebuilds the
   tree from parent_id. That is the whole point: the previous version read only
   node.children, which mergeCallStacks never emits, so every node became a
   childless root and the drawing degenerated into a star.
   ========================================================================== */

const DEPTHS = [{ value: 1, label: '1 hop' }, { value: 2, label: '2 hops' }]

const PICKER_MODES = [
  { value: 'all', label: 'All' },
  { value: 'in', label: 'Callers' },
  { value: 'out', label: 'Callees' },
]

// symDiff codes are DIFF_CODES order: no-change, improvement, degradation, new.
// Tones match ProfileComparison's legend (ok / error / neutral) so the compare
// view's legend describes something that is actually drawn.
const DIFF_TONE = ['var(--neutral)', 'var(--ok)', 'var(--error)', 'var(--info)']

const PICKER_ROWS = 200
const CRUMB_CHARS = 22
const NARROW = 480     // below this the control bar and the legend wrap
const SUB_CHAR_W = 6.1 // 10px mono advance; keeps a value line inside its box

// Chrome the SVG has to share the panel height with. Estimated from the width
// rather than measured: measuring would make the drawing depend on layout
// timing, and the view is meant to be reproducible from its inputs alone. The
// estimate is deliberately generous — over-reserving costs a little canvas,
// under-reserving pushes the drawing out of the panel.
const CHROME_NOTICE = 42
const CHROME_PAD = 10
const MIN_CANVAS = 200 // layoutEgo's tightest depth-1 drawing is 190px

// typeFill's neutral is a surface colour — invisible on a panel-coloured box.
function tone(op) {
  return op >= 0 ? typeFill(TYPE_ORDER[op]) : 'var(--neutral)'
}

// Namespace-stripped tail: the informative part of a PHP symbol in a breadcrumb.
function shortKey(key) {
  const s = String(key || '')
  const cut = s.lastIndexOf('\\')
  return cut === -1 ? s : s.slice(cut + 1)
}

// SVG text cannot be ellipsised by CSS, so value lines are cut to what fits.
function fitSub(text, boxW) {
  const max = Math.max(4, Math.floor((boxW - EGO.TEXT_X - 8) / SUB_CHAR_W))
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

function EgoNode({ n, label, lines, fill, diff, share, title, onSelect }) {
  const inner = n.w - EGO.TEXT_X - 8
  // A negligible-but-present cost keeps 1px, so "tiny" never reads as "absent".
  const barW = share > 0 ? Math.max(1, Math.round(inner * Math.min(1, share) * 10) / 10) : 0
  const nameY = n.isFocus ? 16 : 15
  return (
    <g
      className={`opa-cg-node${n.isFocus ? ' is-focus' : ''}`}
      transform={`translate(${n.x} ${n.y})`}
      role="button"
      tabIndex={0}
      aria-label={title}
      onClick={() => onSelect(n.sym)}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(n.sym) }
      }}
    >
      <title>{title}</title>
      <rect className="opa-cg-box" width={n.w} height={n.h} rx="5" />
      <rect className="opa-cg-type" width="3" height={n.h} rx="1.5" style={{ fill }} />
      {diff >= 0 && (
        <rect className="opa-cg-diffmark" x={n.w - 3} width="3" height={n.h} rx="1.5" style={{ fill: DIFF_TONE[diff] }} />
      )}
      <text className="opa-cg-name" x={EGO.TEXT_X} y={nameY}>{label}</text>
      {n.flag !== '' && (
        <text className="opa-cg-flag" x={n.w - 8} y={nameY} textAnchor="end">{n.flag}</text>
      )}
      {lines.map((t, i) => (
        <text key={i} className="opa-cg-sub" x={EGO.TEXT_X} y={(n.isFocus ? 31 : 28) + i * 13}>{t}</text>
      ))}
      <rect className="opa-cg-barbg" x={EGO.TEXT_X} y={n.h - 6} width={inner} height="2.5" rx="1.25" />
      {barW > 0 && (
        <rect className="opa-cg-bar" x={EGO.TEXT_X} y={n.h - 6} width={barW} height="2.5" rx="1.25" style={{ fill }} />
      )}
    </g>
  )
}

function EgoGraph({ model, metric, onMetricChange, metricControlled, width, height }) {
  const { graph, ranked, totals } = model
  const W = Math.max(220, Math.floor(width) || 640)

  const keyIndex = useMemo(() => {
    const m = new Map()
    for (let s = 0; s < graph.S; s++) m.set(graph.symKey[s], s)
    return m
  }, [graph])

  const [focusKey, setFocusKey] = useState(null)
  const [history, setHistory] = useState([])
  // null = auto: request the deepest ring and let layoutEgo clamp it to what
  // the panel height actually fits. Defaulting to 1 wasted a tall panel — at
  // 800px the drawing used ~390px while the band label still said "+8 more".
  const [depthChoice, setDepthChoice] = useState(null)
  const depth = depthChoice == null ? EGO.MAX_DEPTH : depthChoice
  const [picker, setPicker] = useState(null) // null | 'all' | 'in' | 'out'
  const [query, setQuery] = useState('')

  // Focus is keyed by SYMBOL NAME, not index: a new trace or a different
  // grouping renumbers the symbols, and a stale index would silently point at
  // an unrelated function. An unknown key falls back to the hottest symbol, so
  // the view is useful the moment it mounts.
  const hottest = ranked.hotOrder.length > 0 ? ranked.hotOrder[0] : 0
  const focus = focusKey != null && keyIndex.has(focusKey) ? keyIndex.get(focusKey) : hottest
  const focusName = graph.symKey[focus]

  const noData = !totals.hasData[metric]
  const selfM = graph.selfM[metric]
  const inclM = graph.inclM[metric]
  const valueOf = useCallback(
    (sym) => (noData ? graph.callCount[sym] : Math.abs(selfM[sym])),
    [graph, selfM, noData],
  )

  const refocus = useCallback((sym) => {
    setPicker(null)
    setQuery('')
    if (!(sym >= 0) || sym >= graph.S) return
    const key = graph.symKey[sym]
    if (key === focusName) return
    setHistory((h) => (h.length >= 32 ? [...h.slice(1), focusKey] : [...h, focusKey]))
    setFocusKey(key)
  }, [graph, focusName, focusKey])

  const back = useCallback(() => {
    if (history.length === 0) return
    setFocusKey(history[history.length - 1])
    setHistory(history.slice(0, -1))
  }, [history])

  const flagText = useCallback((sym) => {
    const rec = graph.recursiveCalls[sym]
    // One flag only — two never fit next to a name at 132px.
    if (rec > 0) return `↻${fmtNum(rec)}`
    if (graph.symIsWrapper[sym] === 1) return 'entry'
    return ''
  }, [graph])

  const edgeLabel = useCallback((e) => {
    if (!(e >= 0)) return null
    const calls = fmtNum(graph.eCount[e])
    if (noData) return `${calls}×`
    return `${fmtMetric(metric, graph.eW[metric][e])} · ${calls}×`
  }, [graph, metric, noData])

  const entryPath = useMemo(() => shortestEntryPath(graph, ranked, focus), [graph, ranked, focus])
  const showCrumbs = entryPath.length > 1
  // One crumb per ~110px, so the breadcrumb never wraps and never steals the
  // canvas height the chrome estimate below has already committed.
  const crumbCap = Math.max(2, Math.min(9, Math.floor(W / 110)))

  const withData = useMemo(() => METRICS.filter((m) => totals.hasData[m]), [totals])
  const noticeCount = (noData ? 1 : 0) + (totals.truncated ? 1 : 0)
  const narrow = W < NARROW
  const chrome = (narrow ? 72 : 38) + (narrow ? 46 : 30) + CHROME_PAD
    + (showCrumbs ? (narrow ? 32 : 26) : 0) + noticeCount * CHROME_NOTICE
  const canvasH = Math.max(MIN_CANVAS, (Math.floor(height) || 520) - chrome)

  // -2 for the canvas' own 1px border: the SVG has to fit the CONTENT box, or
  // overflow:hidden shaves the last column of boxes.
  const layout = useMemo(
    () => layoutEgo(graph, ranked, { focus, width: W - 2, height: canvasH, depth, edgeLabel, flagText }),
    [graph, ranked, focus, W, canvasH, depth, edgeLabel, flagText],
  )

  // Cost bars compare against the hottest box IN VIEW — that is the comparison
  // the user is making. Against the trace total every neighbour would be a
  // hairline.
  const maxInView = useMemo(() => {
    let m = 0
    for (let i = 0; i < layout.nodes.length; i++) {
      const v = valueOf(layout.nodes[i].sym)
      if (v > m) m = v
    }
    return m
  }, [layout, valueOf])

  const typesInView = useMemo(() => {
    const seen = new Set()
    for (let i = 0; i < layout.nodes.length; i++) {
      const op = graph.symOpType[layout.nodes[i].sym]
      seen.add(op >= 0 ? TYPE_ORDER[op] : 'other')
    }
    return TYPE_ORDER.filter((t) => seen.has(t)).concat(seen.has('other') ? ['other'] : [])
  }, [layout, graph])

  const diffsInGraph = useMemo(() => {
    if (!graph.hasDiff) return []
    const seen = new Set()
    for (let s = 0; s < graph.S; s++) if (graph.symDiff[s] >= 0) seen.add(graph.symDiff[s])
    return DIFF_LABELS.map((label, code) => ({ label, code })).filter((d) => seen.has(d.code))
  }, [graph])

  const pickRows = useMemo(() => {
    if (!picker) return []
    const q = query.trim().toLowerCase()
    const rows = []
    if (picker === 'all') {
      const order = ranked.hotOrder
      for (let k = 0; k < order.length && rows.length < PICKER_ROWS; k++) {
        const s = order[k]
        const key = graph.symKey[s]
        if (q && key.toLowerCase().indexOf(q) < 0) continue
        rows.push({ sym: s, key, rank: k + 1, e: -1 })
      }
    } else {
      const list = neighbours(graph, ranked, focus, picker, PICKER_ROWS)
      for (let i = 0; i < list.length && rows.length < PICKER_ROWS; i++) {
        const s = list[i].sym
        const key = graph.symKey[s]
        if (q && key.toLowerCase().indexOf(q) < 0) continue
        rows.push({ sym: s, key, rank: ranked.rankOf[s] + 1, e: list[i].e })
      }
    }
    return rows
  }, [picker, query, graph, ranked, focus])

  const pickerTotal = picker === 'in' ? ranked.inDeg[focus]
    : picker === 'out' ? ranked.outDeg[focus] : graph.S

  const openPicker = useCallback((mode) => {
    setPicker(mode)
    setQuery('')
  }, [])

  const step = useCallback((dir) => {
    const list = neighbours(graph, ranked, focus, dir, 1)
    if (list.length > 0) refocus(list[0].sym)
  }, [graph, ranked, focus, refocus])

  // Scoped to this container, never window: ProfileComparison mounts two of
  // these side by side and a window listener made one keypress move both.
  const onKeyDown = useCallback((ev) => {
    if (ev.key === 'Escape') {
      if (picker) { setPicker(null); ev.stopPropagation() }
      return
    }
    const tag = ev.target && ev.target.tagName
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
    if (ev.key === 'ArrowUp') { ev.preventDefault(); step('in') }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); step('out') }
    else if (ev.key === 'ArrowLeft' || ev.key === 'Backspace') { ev.preventDefault(); back() }
  }, [picker, step, back])

  const crumbs = useMemo(() => {
    if (!showCrumbs) return []
    const p = entryPath
    if (p.length <= crumbCap) return p.map((s) => ({ sym: s }))
    // The entry point and the focus are the two that must survive; the middle
    // collapses into a "+N" the user can hover for the count.
    const head = crumbCap >= 5 ? 2 : 1
    const tail = crumbCap - head
    return [
      ...p.slice(0, head).map((s) => ({ sym: s })),
      { gap: p.length - head - tail },
      ...p.slice(p.length - tail).map((s) => ({ sym: s })),
    ]
  }, [entryPath, showCrumbs, crumbCap])

  function bandText(b) {
    const noun = b.dir === 'in' ? 'Callers' : 'Callees'
    if (b.level === 2) return `${noun} of ${noun.toLowerCase()} · ${fmtNum(b.placed)}`
    const more = b.total > b.placed ? ` · +${fmtNum(b.total - b.placed)} more` : ''
    return `${noun} · ${fmtNum(b.total)}${more}`
  }

  function nodeTitle(sym, n) {
    const parts = [graph.symKey[sym], typeLabel(TYPE_ORDER[graph.symOpType[sym]])]
    if (!noData) {
      parts.push(`self ${fmtMetric(metric, selfM[sym])}`)
      parts.push(`total ${fmtMetric(metric, inclM[sym])}`)
    }
    parts.push(`${fmtNum(graph.callCount[sym])} call${graph.callCount[sym] === 1 ? '' : 's'}`)
    parts.push(`${fmtNum(ranked.inDeg[sym])} callers / ${fmtNum(ranked.outDeg[sym])} callees`)
    if (graph.recursiveCalls[sym] > 0) parts.push(`${fmtNum(graph.recursiveCalls[sym])} recursive`)
    if (graph.symIsWrapper[sym] === 1) parts.push('synthetic entry point')
    if (graph.symDiff[sym] >= 0) parts.push(DIFF_LABELS[graph.symDiff[sym]].toLowerCase())
    parts.push(n.isFocus ? 'in focus — click to choose another' : 'click to refocus')
    return parts.join(' · ')
  }

  function nodeLines(sym, n) {
    const count = graph.callCount[sym]
    const calls = fmtNum(count)
    const callWord = `${calls} call${count === 1 ? '' : 's'}`
    if (!n.isFocus) {
      return [fitSub(noData ? callWord : `${fmtMetric(metric, selfM[sym])} · ${calls}×`, n.w)]
    }
    if (noData) {
      return [
        fitSub(`${callWord} · #${ranked.rankOf[sym] + 1}`, n.w),
        fitSub(`${fmtNum(ranked.inDeg[sym])} in · ${fmtNum(ranked.outDeg[sym])} out`, n.w),
      ]
    }
    // Share denominator is Σ|self| (totals.selfAbs), never |Σ self| — signed
    // metrics (memory, network) put the latter into the thousands of percent.
    const share = totals.selfAbs[metric] > 0 ? (Math.abs(selfM[sym]) / totals.selfAbs[metric]) * 100 : null
    return [
      fitSub(`Self ${fmtMetric(metric, selfM[sym])}${share == null ? '' : ` · ${fmtPct(share)}`}`, n.w),
      fitSub(`Total ${fmtMetric(metric, inclM[sym])} · ${calls}×`, n.w),
    ]
  }

  // The drawing is a TREE: each box records only the edge that placed it, so a
  // call between two boxes that are BOTH on screen is not drawn. Routing those
  // would mean horizontal lines across a band, straight through other boxes —
  // the same misattribution the single sub-row exists to prevent. So they are
  // counted and disclosed rather than quietly omitted.
  const undrawnEdges = useMemo(() => {
    const drawn = new Set()
    const shown = new Set()
    for (let i = 0; i < layout.nodes.length; i++) drawn.add(layout.nodes[i].sym)
    for (let i = 0; i < layout.edges.length; i++) shown.add(layout.edges[i].e)
    let extra = 0
    for (let e = 0; e < graph.E; e++) {
      if (shown.has(e)) continue
      if (drawn.has(graph.eFrom[e]) && drawn.has(graph.eTo[e])) extra++
    }
    return extra
  }, [layout, graph])

  return (
    <div className="opa-cg" style={{ width: W }} onKeyDown={onKeyDown}>
      <div className="opa-cg-toolbar">
        <button
          type="button"
          className="opa-cg-focusbtn"
          aria-expanded={picker === 'all'}
          title={`${focusName} — choose another function to focus`}
          onClick={() => openPicker('all')}
        >
          <FiCrosshair size={12} aria-hidden="true" />
          <span className="opa-cg-focusname">{middleEllipsis(focusName, 44)}</span>
          <span className="opa-muted opa-tnum">#{ranked.rankOf[focus] + 1}</span>
        </button>
        {/* Hidden when the page drives the metric from the shared toolbar, so
            the panel never shows two metric controls sitting side by side. */}
        {!metricControlled && (
          <label className="opa-prof-field opa-cg-metric">
            Cost
            <select className="opa-select" value={metric} onChange={(e) => onMetricChange(e.target.value)}>
              {METRICS.map((m) => <option key={m} value={m}>{METRIC_LABELS[m]}</option>)}
            </select>
          </label>
        )}
        <div
          className="opa-cg-depth"
          title={layout.maxDepth < 2
            ? 'Two hops needs a taller panel'
            : 'How many call hops to draw around the focus'}
        >
          <SegmentedControl options={DEPTHS} value={layout.depth} onChange={setDepthChoice} />
        </div>
        {history.length > 0 && (
          <button type="button" className="opa-btn ghost opa-cg-back" onClick={back}>Back</button>
        )}
      </div>

      {noData && (
        <div className="opa-prof-notice warn">
          <FiAlertTriangle aria-hidden="true" />
          <div>
            <strong>{METRIC_LABELS[metric]}</strong> was not recorded in this trace (every value is 0), so boxes and
            edges are sized by <strong>call count</strong> and values show “—”.
          </div>
          {withData.length > 0 && (
            <div className="opa-prof-notice-actions">
              {withData.map((m) => (
                <button key={m} type="button" className="opa-prof-mini" onClick={() => onMetricChange(m)}>
                  Size by {METRIC_LABELS[m]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {totals.truncated && (
        <div className="opa-prof-notice">
          <FiInfo aria-hidden="true" />
          <div>
            Ingest stopped at the first <strong>{fmtNum(totals.calls)}</strong> of {fmtNum(totals.scanned)} calls;
            this neighbourhood covers that prefix only.
          </div>
        </div>
      )}

      {showCrumbs && (
        <div className="opa-cg-crumbs">
          <span
            className="opa-cg-crumbs-l"
            title="One observed way execution reaches the focus. A symbol is an aggregate, so this is not the only path."
          >
            Entry path
          </span>
          {crumbs.map((c, i) => (
            <React.Fragment key={c.gap ? `gap${i}` : `s${c.sym}`}>
              {i > 0 && <span className="opa-prof-crumb-sep" aria-hidden="true">›</span>}
              {c.gap ? (
                <span className="opa-prof-crumb-sep" title={`${c.gap} more frames`}>+{c.gap}</span>
              ) : c.sym === focus ? (
                <span className="opa-prof-crumb is-focus" aria-current="true" title={graph.symKey[c.sym]}>
                  {middleEllipsis(shortKey(graph.symKey[c.sym]), narrow ? 15 : CRUMB_CHARS)}
                </span>
              ) : (
                <button type="button" className="opa-prof-crumb" title={graph.symKey[c.sym]} onClick={() => refocus(c.sym)}>
                  {middleEllipsis(shortKey(graph.symKey[c.sym]), narrow ? 15 : CRUMB_CHARS)}
                </button>
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      <div
        className="opa-cg-canvas"
        tabIndex={0}
        role="group"
        aria-label={`Call graph around ${focusName}. Arrow up focuses the hottest caller, arrow down the hottest callee.`}
      >
        <svg
          className="opa-cg-svg"
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
        >
          {layout.edges.map((e, i) => (
            <g key={`e${i}`} className={`opa-cg-edge${e.focusEdge ? ' is-focus' : ''}`}>
              <path className="opa-cg-line" d={e.path} style={{ strokeWidth: e.stroke }} />
              <path className="opa-cg-arrow" d={e.arrow} />
              {e.label && (
                <>
                  <rect className="opa-cg-elabelbg" x={e.label.x} y={e.label.y - 8} width={e.label.w} height="16" rx="3" />
                  <text className="opa-cg-elabel" x={e.label.x + e.label.w / 2} y={e.label.y + 3.5} textAnchor="middle">
                    {e.label.text}
                  </text>
                </>
              )}
            </g>
          ))}

          {layout.bands.map((b, i) => {
            if (b.dir === 'focus') return null
            const label = bandText(b)
            const ly = b.top - 5
            return (
              <React.Fragment key={`b${i}`}>
                {/* Only level 1 knows its exact degree, so only level 1 offers
                    the full list behind its label. */}
                {b.exact ? (
                  <g
                    className="opa-cg-bandbtn"
                    role="button"
                    tabIndex={0}
                    aria-label={`${label} — open the full list`}
                    onClick={() => openPicker(b.dir)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openPicker(b.dir) }
                    }}
                  >
                    <text className="opa-cg-band" x={EGO.PAD_X} y={ly}>{label}</text>
                  </g>
                ) : (
                  <text className="opa-cg-band" x={EGO.PAD_X} y={ly}>{label}</text>
                )}
                {b.placed === 0 && (
                  <text className="opa-cg-bandempty" x={layout.width / 2} y={b.top + 23} textAnchor="middle">
                    {b.dir === 'in'
                      ? 'No caller in this trace — this is an entry point.'
                      : 'No callee in this trace — leaf function.'}
                  </text>
                )}
              </React.Fragment>
            )
          })}

          {layout.nodes.map((n) => (
            <EgoNode
              key={`n${n.band}:${n.sym}`}
              n={n}
              label={boxLabel(n.key, n.labelChars)}
              lines={nodeLines(n.sym, n)}
              fill={tone(graph.symOpType[n.sym])}
              diff={graph.symDiff[n.sym]}
              share={maxInView > 0 ? valueOf(n.sym) / maxInView : 0}
              title={nodeTitle(n.sym, n)}
              onSelect={n.isFocus ? () => openPicker('all') : refocus}
            />
          ))}
        </svg>
      </div>

      <div className="opa-cg-legend">
        {typesInView.map((t) => (
          <span key={t} className="opa-cg-key">
            <i style={{ background: t === 'other' ? 'var(--neutral)' : typeFill(t) }} />
            {t === 'other' ? 'Other' : typeLabel(t)}
          </span>
        ))}
        {diffsInGraph.length > 0 && (
          <span className="opa-cg-keygroup" title="Right edge of each box — from the A/B comparison">
            {diffsInGraph.map((d) => (
              <span key={d.code} className="opa-cg-key">
                <i style={{ background: DIFF_TONE[d.code] }} />{d.label}
              </span>
            ))}
          </span>
        )}
        {undrawnEdges > 0 && (
          <span
            className="opa-cg-key opa-muted"
            title="Calls between two functions that are both drawn here. They are not shown because routing them across a band would run the line through other boxes."
          >
            +{fmtNum(undrawnEdges)} call{undrawnEdges === 1 ? '' : 's'} between shown functions not drawn
          </span>
        )}
        {/* The narrow variant drops the keyboard hint rather than wrap the
            legend onto a third line and eat the canvas it was sized against. */}
        <span className="opa-cg-hint" title="Click any box to refocus the graph on it. Arrow up / arrow down jump to the hottest caller / callee.">
          {fmtNum(layout.drawn)} of {fmtNum(graph.S)} functions
          {narrow ? '' : ' · click a box to refocus · ↑ ↓ hottest caller/callee'}
          {layout.maxDepth < 2 ? ' · 2 hops needs a taller panel' : ''}
        </span>
      </div>

      {picker && (
        <div className="opa-cg-picker" role="dialog" aria-label="Choose the focus function">
          <div className="opa-cg-picker-bar">
            <span className="opa-cg-picker-search">
              <FiSearch aria-hidden="true" />
              <input
                className="opa-input"
                type="search"
                value={query}
                placeholder="Filter functions..."
                aria-label="Filter functions"
                onChange={(e) => setQuery(e.target.value)}
              />
            </span>
            <SegmentedControl options={PICKER_MODES} value={picker} onChange={openPicker} />
            <button type="button" className="opa-cg-close" aria-label="Close the function list" onClick={() => setPicker(null)}>
              <FiX size={14} />
            </button>
          </div>
          <div className="opa-cg-picker-list">
            {pickRows.length === 0 ? (
              <div className="opa-cg-picker-empty">
                {picker === 'in' ? 'No caller in this trace — this is an entry point.'
                  : picker === 'out' ? 'No callee in this trace — leaf function.'
                    : `No function matches “${query}”`}
              </div>
            ) : pickRows.map((r) => (
              <button
                key={r.sym}
                type="button"
                className={`opa-cg-prow${r.sym === focus ? ' is-current' : ''}`}
                title={r.key}
                onClick={() => refocus(r.sym)}
              >
                <span className="opa-cg-prank">#{r.rank}</span>
                <span className="opa-prof-type" style={{ color: tone(graph.symOpType[r.sym]) }}>
                  {typeLabel(TYPE_ORDER[graph.symOpType[r.sym]])}
                </span>
                <span className="opa-cg-pname">{middleEllipsis(r.key, 52)}</span>
                <span className="opa-cg-pnum">
                  {r.e >= 0
                    ? (noData ? `${fmtNum(graph.eCount[r.e])}×` : fmtMetric(metric, graph.eW[metric][r.e]))
                    : (noData ? '—' : fmtMetric(metric, selfM[r.sym]))}
                </span>
                <span className="opa-cg-pnum opa-muted">{fmtNum(graph.callCount[r.sym])}</span>
              </button>
            ))}
          </div>
          <div className="opa-cg-picker-foot">
            {picker === 'all'
              ? <><FiCrosshair aria-hidden="true" />Ranked by {noData ? 'call count' : METRIC_LABELS[metric].toLowerCase()}</>
              : picker === 'in'
                ? <><FiCornerLeftUp aria-hidden="true" />Callers, by the cost that flows through the call site</>
                : <><FiCornerDownRight aria-hidden="true" />Callees, by the cost that flows through the call site</>}
            <span className="opa-muted">
              {pickRows.length < pickerTotal
                ? `${fmtNum(pickRows.length)} of ${fmtNum(pickerTotal)} shown`
                : `${fmtNum(pickRows.length)} shown`}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Ego call graph for one trace's call stack.
 *
 * Props are fixed at ({ callStack, width, height }) — four call sites depend on
 * them. The metric selector is local because nothing passes one in; TraceDetail
 * already owns a metric control, so passing it down would let this one go.
 */
// `metric`, `groupBy` and `minPct` are OPTIONAL: when the host page drives them
// from the shared ProfileToolbar the graph follows it (and hides its own metric
// control), otherwise it manages the metric itself and stays useful standalone.
export default function CallGraph({
  callStack,
  width = 960,
  height = 520,
  metric: metricProp,
  onMetricChange,
  groupBy = 'method',
  minPct = 0,
}) {
  const [ownMetric, setOwnMetric] = useState('duration')
  const controlled = metricProp !== undefined
  const metric = controlled ? metricProp : ownMetric
  const setMetric = controlled ? (onMetricChange || (() => {})) : setOwnMetric
  const model = useProfileModel(callStack, { metric, groupBy, minPct })
  const W = Math.max(220, Math.floor(width) || 640)

  if (!model.ready) {
    return (
      <div className="opa-cg is-blank" style={{ width: W }}>
        <EmptyState title="No call stack" hint="This trace carries no call stack to build a graph from." />
      </div>
    )
  }
  if (model.graph.S === 0) {
    return (
      <div className="opa-cg is-blank" style={{ width: W }}>
        <EmptyState title="No function survived aggregation" hint="Every call was filtered out before grouping." />
      </div>
    )
  }
  return (
    <EgoGraph
      model={model}
      metric={metric}
      onMetricChange={setMetric}
      metricControlled={controlled}
      width={width}
      height={height}
    />
  )
}
