/** Fixed waterfall row height — keep in sync with `.tw-row` in TraceDetail.css */
export const WATERFALL_ROW_H = 26

/** Collapse runs of the same name/depth/parent once they exceed this size. */
export const WATERFALL_MIN_GROUP = 20

/**
 * Flatten a span tree into rows with `_depth` / `_parentService`. Orphans from
 * `flat` that are not reachable via `root.children` are appended at depth 0.
 */
export function flattenTree(root, flat) {
  const out = []
  const seen = new Set()
  const walk = (node, depth, parentSvc) => {
    if (!node) return
    out.push({ ...node, _depth: depth, _parentService: parentSvc })
    if (node.span_id) seen.add(node.span_id)
    ;(node.children || []).forEach((c) => walk(c, depth + 1, node.service))
  }
  if (root) walk(root, 0, null)
  if (Array.isArray(flat)) {
    flat.forEach((s) => {
      if (!s || (s.span_id && seen.has(s.span_id))) return
      out.push({ ...s, _depth: 0, _parentService: null })
      if (s.span_id) seen.add(s.span_id)
    })
  }
  return out
}

function parentKey(span) {
  const p = span?.parent_id
  if (p == null || p === '') return ''
  return String(p)
}

/**
 * Build display rows for the waterfall. When `collapseNoise` is on, consecutive
 * same-name / same-depth / same-parent runs of length >= minGroupSize become a
 * single group row (expandable via `expandedGroupIds`).
 *
 * @returns {{ displayRows: object[], totalSpans: number, visibleSpans: number, collapsedCount: number }}
 */
export function buildWaterfallDisplayRows(rows, {
  collapseNoise = true,
  expandedGroupIds = new Set(),
  minGroupSize = WATERFALL_MIN_GROUP,
} = {}) {
  const totalSpans = Array.isArray(rows) ? rows.length : 0
  if (!totalSpans) {
    return { displayRows: [], totalSpans: 0, visibleSpans: 0, collapsedCount: 0 }
  }

  if (!collapseNoise) {
    return {
      displayRows: rows.map((span) => ({ kind: 'span', key: span.span_id || `s-${span.start_ts}`, span })),
      totalSpans,
      visibleSpans: totalSpans,
      collapsedCount: 0,
    }
  }

  const displayRows = []
  let visibleSpans = 0
  let collapsedCount = 0
  let i = 0
  while (i < rows.length) {
    const head = rows[i]
    const name = head?.name || ''
    const depth = head?._depth || 0
    const pk = parentKey(head)
    let j = i + 1
    while (
      j < rows.length
      && (rows[j]?.name || '') === name
      && (rows[j]?._depth || 0) === depth
      && parentKey(rows[j]) === pk
    ) {
      j += 1
    }
    const run = rows.slice(i, j)
    if (run.length >= minGroupSize) {
      const groupId = `grp:${pk}:${name}:${depth}:${i}`
      if (expandedGroupIds instanceof Set && expandedGroupIds.has(groupId)) {
        for (const span of run) {
          displayRows.push({ kind: 'span', key: span.span_id || `s-${span.start_ts}`, span })
          visibleSpans += 1
        }
      } else {
        const startTs = Math.min(...run.map((s) => s.start_ts || 0))
        const endTs = Math.max(...run.map((s) => s.end_ts || ((s.start_ts || 0) + Math.round((s.duration_ms || 0) * 1000))))
        const durationMs = Math.max(
          ...run.map((s) => s.duration_ms || 0),
          (endTs - startTs) / 1000,
        )
        displayRows.push({
          kind: 'group',
          key: groupId,
          groupId,
          name,
          count: run.length,
          _depth: depth,
          service: head.service,
          start_ts: startTs,
          end_ts: endTs,
          duration_ms: durationMs,
          span_id: run[0]?.span_id,
          members: run,
          span: run[0],
        })
        visibleSpans += 1
        collapsedCount += run.length - 1
      }
    } else {
      for (const span of run) {
        displayRows.push({ kind: 'span', key: span.span_id || `s-${span.start_ts}`, span })
        visibleSpans += 1
      }
    }
    i = j
  }

  return { displayRows, totalSpans, visibleSpans, collapsedCount }
}
