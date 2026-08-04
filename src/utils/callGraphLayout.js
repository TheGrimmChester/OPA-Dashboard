// Ego-graph geometry for the call graph view. Pure: no DOM, no React, no
// formatting — every label string arrives through a callback, so this module is
// unit-testable in Node and the component keeps all typography and colour
// decisions.
//
// Why an ego graph rather than a drawing of the whole call graph: a real PHP
// request aggregates to thousands of symbols and tens of thousands of call
// sites. Any full-graph layout that fits the ~340px of usable canvas a 440px
// panel offers has to zoom out far past the point where a symbol name is
// readable. So we draw ONE symbol's immediate neighbourhood at scale 1 and make
// refocusing the primary interaction.
//
// The whole thing is arithmetic over a bounded number of boxes (<= MAX_BOXES),
// so it is O(1) after the model regardless of trace size, and it is
// deterministic: every ordering terminates in the model's content rank, there
// is no physics, no randomness and no iteration count.

import { neighbours } from './callGraphModel'

export const EGO = {
  BOX_H: 38,           // 2 text lines (name + value) + a cost bar
  FOCUS_H: 54,         // 3 text lines
  MIN_BOX_W: 132,      // below this a PHP symbol is unreadable however we truncate
  MAX_BOX_W: 320,      // a fully-qualified Symfony symbol fits in ~45 mono chars
  COL_GAP: 8,
  ROW_GAP: 6,
  BAND_GAP_MIN: 22,    // must clear one LABEL_PITCH row of edge labels
  BAND_GAP_MAX: 52,    // stop a tall panel stretching 3 bands into isolation
  PAD_X: 8,
  LABEL_H: 16,         // room above the top band for its band label
  MAX_PER_ROW: 4,
  // One sub-row per band, deliberately. With two, every edge leaving the FIRST
  // sub-row has to cross the SECOND sub-row's boxes to reach the next band, and
  // since boxes paint over edges the arrow appears to originate from the wrong
  // function — measured at 3 of 9 edges ~38% occluded at TraceDetail's real
  // size. Drawing fewer neighbours and disclosing the rest as "+K more" (which
  // the band label already does, and which refocus/the picker can reach) is
  // honest; a diagram that misattributes a call is not.
  MAX_SUB: 1,          // sub-rows per band
  MAX_DEPTH: 2,
  // Horizontal strip at the left of every band gap that belongs to the band
  // label ("Callers · 6"). Edge-label chips are packed only against other
  // chips, so without reserving this they land text-on-text over the band
  // label at narrow widths (measured: 8.7 x 8.5px overlap at 300px wide).
  BAND_LABEL_W: 94,
  MAX_BOXES: 49,
  // Mono advance is 0.6em, so 11px -> 6.6 and the 12px focus name -> 7.2.
  // Rounded up: over-estimating truncates one char early, under-estimating
  // pushes the name past the box edge (measured: it did).
  CHAR_W: 6.7,
  FOCUS_CHAR_W: 7.3,
  // Both were calibrated for a 10px UI font; the CSS now uses --text-2xs (the
  // smallest token, 11px) because 10px was below the type scale. Scaled by
  // 11/10 and rounded up, since over-estimating only truncates a char early
  // while under-estimating pushes text past the box edge.
  FLAG_CHAR_W: 6.2,    // 11px UI font
  LABEL_CHAR_W: 6.2,   // edge labels, 11px UI font
  TEXT_X: 11,          // left text inset (3px type stripe + padding)
  MIN_LABEL_CHARS: 6,
  SCAN: 64,            // per-seed neighbour scan; matches callGraphModel.SCAN_CAP
}

const EMPTY_BAND = { placed: [], total: 0 }
const LABEL_PITCH = 17 // one 10px edge label plus breathing room

/**
 * Distribute the endpoints of every edge that shares a box across that box's
 * edge, in the order of their opposite endpoint. Mutates `raw[i][coord]`.
 */
function spreadEndpoints(raw, coord, boxKey, otherX) {
  const groups = new Map()
  for (let i = 0; i < raw.length; i++) {
    const box = raw[i][boxKey]
    let list = groups.get(box)
    if (!list) { list = []; groups.set(box, list) }
    list.push(raw[i])
  }
  for (const [box, list] of groups) {
    if (list.length < 2) continue
    // Content rank via the model's edge id keeps ties deterministic.
    list.sort((a, b) => (otherX(a) - otherX(b)) || (a.n.edge - b.n.edge))
    const inset = Math.min(16, box.w / 4)
    const span = box.w - 2 * inset
    for (let i = 0; i < list.length; i++) {
      list[i][coord] = box.x + inset + (span * (i + 0.5)) / list.length
    }
  }
}

function r1(v) {
  return Math.round(v * 10) / 10
}

function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}

// Curve parameter at a given y. The control points are y1+k and y2-k with
// k < (y2-y1)/2, so y(t) is strictly increasing and bisection converges; 16
// halvings is sub-pixel on any canvas we draw.
function tAtY(y0, y1, y2, y3, target) {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 16; i++) {
    const m = (lo + hi) / 2
    if (cubic(y0, y1, y2, y3, m) < target) lo = m
    else hi = m
  }
  return (lo + hi) / 2
}

/**
 * Box grid for a given canvas width. Boxes are all the same size on purpose:
 * a uniform grid keeps names comparable and makes non-overlap structural, and
 * cost is encoded by the in-box bar and the edge thickness instead.
 *
 * `perRow` is the CAPACITY (how many boxes a band may hold per row); `boxW` is
 * the width at that capacity. Once the real occupancy is known, layoutEgo
 * re-widens the boxes with boxWidthFor(width, actualOccupancy) — a lone caller
 * has no reason to be truncated to a quarter of the canvas.
 */
export function boxGeometry(width) {
  const inner = Math.max(EGO.MIN_LABEL_CHARS * EGO.CHAR_W, width - 2 * EGO.PAD_X)
  const perRow = Math.max(1, Math.min(
    EGO.MAX_PER_ROW,
    Math.floor((inner + EGO.COL_GAP) / (EGO.MIN_BOX_W + EGO.COL_GAP)),
  ))
  return { perRow, boxW: boxWidthFor(width, perRow) }
}

export function boxWidthFor(width, perRow) {
  const inner = Math.max(EGO.MIN_LABEL_CHARS * EGO.CHAR_W, width - 2 * EGO.PAD_X)
  const n = Math.max(1, perRow)
  return Math.min(EGO.MAX_BOX_W, Math.floor((inner - (n - 1) * EGO.COL_GAP) / n))
}

/**
 * How many characters of a symbol name fit in one box, given the flag text
 * ("↻3", "entry") that shares the name line. The component feeds this to
 * HotSpots' middleEllipsis so the graph truncates exactly like the table.
 */
export function labelCharBudget(boxW, flag = '', isFocus = false) {
  const flagW = flag ? flag.length * EGO.FLAG_CHAR_W + 8 : 0
  const avail = boxW - EGO.TEXT_X - 8 - flagW
  return Math.max(EGO.MIN_LABEL_CHARS, Math.floor(avail / (isFocus ? EGO.FOCUS_CHAR_W : EGO.CHAR_W)))
}

// Balanced row split: 5 boxes over 4 columns reads better as 3+2 than 4+1.
export function splitRows(count, perRow, maxRows) {
  if (count <= 0) return []
  const rows = Math.max(1, Math.min(maxRows, Math.ceil(count / perRow)))
  const base = Math.floor(count / rows)
  const extra = count % rows
  const out = new Array(rows)
  for (let r = 0; r < rows; r++) out[r] = base + (r < extra ? 1 : 0)
  return out
}

/**
 * One expansion step: the neighbours of `seeds` in `dir`, deduplicated against
 * everything already drawn, ranked by the cost that flows through the call site
 * and cut to `limit`. Slices come out of rankSymbols pre-sorted by weight, so
 * this never sorts more than SCAN per seed.
 */
function expand(graph, ranked, seeds, dir, taken, limit) {
  if (limit <= 0 || seeds.length === 0) return EMPTY_BAND
  const found = []
  const seen = new Set()
  for (let i = 0; i < seeds.length; i++) {
    const from = seeds[i]
    const list = neighbours(graph, ranked, from, dir, EGO.SCAN)
    for (let k = 0; k < list.length; k++) {
      const sym = list[k].sym
      if (taken.has(sym) || seen.has(sym)) continue
      seen.add(sym)
      found.push({ e: list[k].e, sym, fromSym: from })
    }
  }
  found.sort((a, b) => (ranked.eRank[b.e] - ranked.eRank[a.e]) || (graph.keyRank[a.sym] - graph.keyRank[b.sym]))
  const placed = found.length > limit ? found.slice(0, limit) : found
  for (let i = 0; i < placed.length; i++) taken.add(placed[i].sym)
  return { placed, total: found.length }
}

function emptyLayout(width, height) {
  return {
    focus: -1,
    width,
    height,
    depth: 1,
    maxDepth: 1,
    depthClamped: false,
    perRow: 1,
    effPerRow: 1,
    boxW: 0,
    subCap: 1,
    nodes: [],
    edges: [],
    bands: [],
    drawn: 0,
  }
}

/**
 * Lay out the ego graph of `focus`.
 *
 * opts: { focus, width, height, depth, edgeLabel(e) -> string, flagText(sym) -> string }
 *
 * Returns positioned `nodes` (uniform boxes, band 0 at the top), `edges` (all
 * drawn top-to-bottom, so every arrow means "calls"), and `bands` describing
 * each row group so the caller can label it and report what it left out.
 * `height` is the CONTENT height, always <= the requested height.
 */
export function layoutEgo(graph, ranked, opts = {}) {
  const W = Math.max(120, Math.floor(opts.width) || 640)
  const H = Math.max(120, Math.floor(opts.height) || 320)
  if (!graph || !ranked || !graph.S) return emptyLayout(W, H)
  const focus = opts.focus
  if (focus == null || !(focus >= 0) || focus >= graph.S) return emptyLayout(W, H)

  const flagText = typeof opts.flagText === 'function' ? opts.flagText : null
  const edgeLabel = typeof opts.edgeLabel === 'function' ? opts.edgeLabel : null
  const { perRow } = boxGeometry(W)

  // --- vertical budget. `minFor` is the height of the tightest possible
  // drawing at that depth/sub-row count; the requested depth is dropped rather
  // than allowed to overflow the panel, and the extra sub-row is only taken
  // when it genuinely fits.
  const minFor = (d, sub) => EGO.LABEL_H + EGO.FOCUS_H
    + 2 * d * (sub * EGO.BOX_H + (sub - 1) * EGO.ROW_GAP + EGO.BAND_GAP_MIN)
  let maxDepth = 1
  while (maxDepth < EGO.MAX_DEPTH && minFor(maxDepth + 1, 1) <= H) maxDepth++
  let depth = Math.max(1, Math.min(EGO.MAX_DEPTH, Math.floor(opts.depth) || 1))
  const depthClamped = depth > maxDepth
  if (depthClamped) depth = maxDepth
  let subCap = 1
  while (subCap < EGO.MAX_SUB && minFor(depth, subCap + 1) <= H) subCap++

  // --- collect, hottest ring first so the box budget goes where it matters.
  const cap = subCap * perRow
  const taken = new Set([focus])
  let budget = EGO.MAX_BOXES - 1
  const l1in = expand(graph, ranked, [focus], 'in', taken, Math.min(cap, budget))
  budget -= l1in.placed.length
  const l1out = expand(graph, ranked, [focus], 'out', taken, Math.min(cap, budget))
  budget -= l1out.placed.length
  let l2in = EMPTY_BAND
  let l2out = EMPTY_BAND
  if (depth >= 2) {
    l2in = expand(graph, ranked, l1in.placed.map((p) => p.sym), 'in', taken, Math.min(cap, budget))
    budget -= l2in.placed.length
    l2out = expand(graph, ranked, l1out.placed.map((p) => p.sym), 'out', taken, Math.min(cap, budget))
  }
  // Level 1 knows the exact degree — `total` is the focus's real caller/callee
  // count, so "+K more" is literally how many are not drawn in that band. A
  // level-2 ring is only ever "at least this many", hence the `exact` flag.
  const spec = []
  if (depth >= 2) spec.push({ dir: 'in', level: 2, placed: l2in.placed, total: l2in.total })
  spec.push({ dir: 'in', level: 1, placed: l1in.placed, total: ranked.inDeg[focus] })
  spec.push({ dir: 'focus', level: 0, placed: [{ sym: focus, e: -1, fromSym: -1 }], total: 1 })
  spec.push({ dir: 'out', level: 1, placed: l1out.placed, total: ranked.outDeg[focus] })
  if (depth >= 2) spec.push({ dir: 'out', level: 2, placed: l2out.placed, total: l2out.total })

  // --- band heights, then spend the leftover height on the gaps (up to a cap,
  // so a 700px-tall panel does not stretch three bands into isolation).
  const rowsPer = spec.map((b) => (b.dir === 'focus' ? [1] : splitRows(b.placed.length, perRow, subCap)))
  // Boxes are widened to the busiest row that actually exists, not to the
  // theoretical capacity: with one caller and one callee every box gets the full
  // canvas width and no name has to be truncated at all.
  let effPerRow = 1
  for (let i = 0; i < rowsPer.length; i++) {
    for (let r = 0; r < rowsPer[i].length; r++) if (rowsPer[i][r] > effPerRow) effPerRow = rowsPer[i][r]
  }
  const boxW = boxWidthFor(W, effPerRow)
  const bandH = spec.map((b, i) => {
    const h = b.dir === 'focus' ? EGO.FOCUS_H : EGO.BOX_H
    // An empty band still reserves one row: the space carries the "no caller in
    // this trace" message, which is information, not absence of it.
    const nr = Math.max(1, rowsPer[i].length)
    return nr * h + (nr - 1) * EGO.ROW_GAP
  })
  const gaps = spec.length - 1
  const stack = bandH.reduce((a, b) => a + b, 0)
  const slack = Math.max(0, H - (EGO.LABEL_H + stack + gaps * EGO.BAND_GAP_MIN))
  const gap = EGO.BAND_GAP_MIN + (gaps > 0
    ? Math.min(Math.floor(slack / gaps), EGO.BAND_GAP_MAX - EGO.BAND_GAP_MIN)
    : 0)

  // --- place. Uniform box width + centred rows makes non-overlap structural.
  const nodes = []
  const bands = []
  const nodeOf = new Map()
  let y = EGO.LABEL_H
  for (let i = 0; i < spec.length; i++) {
    const b = spec[i]
    const h = b.dir === 'focus' ? EGO.FOCUS_H : EGO.BOX_H
    bands.push({
      dir: b.dir,
      level: b.level,
      top: y,
      height: bandH[i],
      placed: b.placed.length,
      total: b.total,
      // Only a non-empty level-1 ring has an exact degree AND something to
      // disclose, so only that one is worth wiring to the full list.
      exact: b.level === 1 && b.total > 0,
    })
    let p = 0
    let ry = y
    const rows = rowsPer[i]
    for (let r = 0; r < rows.length; r++) {
      const m = rows[r]
      const rowW = m * boxW + (m - 1) * EGO.COL_GAP
      let x = Math.round((W - rowW) / 2)
      for (let c = 0; c < m; c++, p++) {
        const item = b.placed[p]
        const isFocus = b.dir === 'focus'
        const flag = flagText ? (flagText(item.sym) || '') : ''
        nodeOf.set(item.sym, nodes.length)
        nodes.push({
          sym: item.sym,
          key: graph.symKey[item.sym],
          dir: b.dir,
          level: b.level,
          band: i,
          isFocus,
          x,
          y: ry,
          w: boxW,
          h,
          flag,
          labelChars: labelCharBudget(boxW, flag, isFocus),
          edge: item.e == null ? -1 : item.e,
          fromSym: item.fromSym == null ? -1 : item.fromSym,
        })
        x += boxW + EGO.COL_GAP
      }
      ry += h + EGO.ROW_GAP
    }
    y += bandH[i]
    if (i < spec.length - 1) y += gap
  }
  const contentH = y

  // --- edges. Every edge runs downward, so the arrowhead alone reads as
  // "calls" with no legend. Thickness is relative to the hottest edge IN VIEW,
  // which is the comparison the user is actually making.
  const raw = []
  let maxW = 0
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    if (n.isFocus) continue
    const oi = nodeOf.get(n.fromSym)
    if (oi === undefined) continue
    const src = n.dir === 'in' ? n : nodes[oi]
    const tgt = n.dir === 'in' ? nodes[oi] : n
    const y1 = src.y + src.h
    const y2 = tgt.y
    if (y2 <= y1) continue // defensive: bands are strictly ordered, so unreachable
    const w = Math.abs(ranked.eRank[n.edge]) || 0
    if (w > maxW) maxW = w
    raw.push({ n, src, tgt, x1: src.x + src.w / 2, y1, x2: tgt.x + tgt.w / 2, y2, w })
  }

  // Fan the endpoints across the box edge instead of stacking every arrow on one
  // point: seven callers converging on a single pixel is a blob, seven arrows
  // landing side by side reads as seven call sites. Sorted by the OTHER endpoint
  // so the fan never crosses itself.
  spreadEndpoints(raw, 'x1', 'src', (r) => r.x2)
  spreadEndpoints(raw, 'x2', 'tgt', (r) => r.x1)

  const edges = []
  const lanes = new Map() // gap index -> [row][placed label x-intervals]
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i]
    const k = Math.max(8, (r.y2 - r.y1) * 0.45)
    // sqrt, not linear: a 1:100 call-site ratio is common and a linear scale
    // renders the cheap end as a 1px hairline indistinguishable from nothing.
    const stroke = maxW > 0 ? 1 + 2.2 * Math.sqrt(r.w / maxW) : 1.2
    const edge = {
      e: r.n.edge,
      from: r.src.sym,
      to: r.tgt.sym,
      focusEdge: r.src.isFocus || r.tgt.isFocus,
      stroke: r1(stroke),
      path: `M${r1(r.x1)} ${r1(r.y1)}C${r1(r.x1)} ${r1(r.y1 + k)} ${r1(r.x2)} ${r1(r.y2 - k)} ${r1(r.x2)} ${r1(r.y2)}`,
      arrow: `M${r1(r.x2 - 3.6)} ${r1(r.y2 - 6)}L${r1(r.x2 + 3.6)} ${r1(r.y2 - 6)}L${r1(r.x2)} ${r1(r.y2)}Z`,
      label: null,
    }
    // Only the ring touching the focus is labelled; labelling ring 2 as well
    // turns the gaps into text soup at any realistic panel width.
    if (edgeLabel && edge.focusEdge) {
      const text = edgeLabel(r.n.edge)
      if (text) {
        const lw = text.length * EGO.LABEL_CHAR_W + 10
        if (lw <= W - 2 * EGO.PAD_X) {
          // Labels live on 1-2 fixed lines inside the band GAP, never at the
          // curve's own midpoint: a box in a band's first sub-row has its
          // midpoint inside the SECOND sub-row, which put labels on top of
          // boxes. x still comes from the curve, so a label stays over its edge.
          const lane = Math.min(r.src.band, r.tgt.band)
          const gapTop = bands[lane].top + bands[lane].height
          const gapH = bands[lane + 1].top - gapTop
          const rows = Math.max(1, Math.min(2, Math.floor((gapH - 4) / LABEL_PITCH)))
          const top = gapTop + (gapH - rows * LABEL_PITCH) / 2
          const t = tAtY(r.y1, r.y1 + k, r.y2 - k, r.y2, gapTop + gapH / 2)
          let lx = cubic(r.x1, r.x1, r.x2, r.x2, t) - lw / 2
          const laneLeft = EGO.PAD_X + EGO.BAND_LABEL_W
          // Only bias right when there is genuinely room, otherwise a narrow
          // panel would push every chip off the canvas.
          const minLx = laneLeft + lw <= W - EGO.PAD_X ? laneLeft : EGO.PAD_X
          if (lx < minLx) lx = minLx
          if (lx + lw > W - EGO.PAD_X) lx = W - EGO.PAD_X - lw
          let used = lanes.get(lane)
          if (!used) { used = []; lanes.set(lane, used) }
          for (let row = 0; row < rows; row++) {
            if (!used[row]) used[row] = []
            let clash = false
            for (let u = 0; u < used[row].length; u++) {
              if (lx < used[row][u][1] + 4 && used[row][u][0] - 4 < lx + lw) { clash = true; break }
            }
            if (clash) continue
            used[row].push([lx, lx + lw])
            edge.label = { text, x: r1(lx), y: r1(top + row * LABEL_PITCH + LABEL_PITCH / 2), w: r1(lw) }
            break
          }
        }
      }
    }
    edges.push(edge)
  }

  return {
    focus,
    width: W,
    height: contentH,
    depth,
    maxDepth,
    depthClamped,
    perRow,
    effPerRow,
    boxW,
    subCap,
    nodes,
    edges,
    bands,
    drawn: nodes.length,
  }
}

export default layoutEgo
