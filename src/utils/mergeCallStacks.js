// Merge every span's call stack so the profile views cover the whole
// distributed trace, not just the root span. A single stack is returned
// untouched (identical to the previous root-only behavior). When several
// spans carry stacks, each one is namespaced by its span_id (call_ids from
// different services can collide) and re-rooted under a per-span wrapper
// node; all wrappers nest below one synthetic trace root because FlameGraph
// draws every depth-0 root at the same origin (multiple roots would
// overlap). The flame / call-graph / stack-tree components rebuild the tree
// from parent_id, so a combined FLAT array is all they need.
export function mergeCallStacks(root, flatSpans) {
  const candidates = root ? [root, ...flatSpans] : flatSpans
  const seen = new Set()
  const withStacks = []
  candidates.forEach((s) => {
    if (!s || !Array.isArray(s.stack) || s.stack.length === 0) return
    const key = s.span_id || s
    if (seen.has(key)) return
    seen.add(key)
    withStacks.push(s)
  })
  if (withStacks.length === 0) return []
  if (withStacks.length === 1) return withStacks[0].stack

  const out = [{
    call_id: 'trace',
    function: 'trace',
    class: '',
    file: '',
    line: 0,
    duration_ms: withStacks.reduce((sum, s) => sum + (s.duration_ms || 0), 0),
    cpu_ms: 0,
    parent_id: null,
    depth: 0,
  }]
  withStacks.forEach((s, i) => {
    const ns = s.span_id || `s${i}`
    const wrapperId = `span:${ns}`
    out.push({
      call_id: wrapperId,
      function: (s.name || 'span') + (s.service ? ` [${s.service}]` : ''),
      class: '',
      file: '',
      line: 0,
      duration_ms: s.duration_ms || 0,
      cpu_ms: 0,
      parent_id: 'trace',
      depth: 1,
    })
    s.stack.forEach((n) => {
      out.push({
        ...n,
        call_id: `${ns}:${n.call_id}`,
        parent_id: (n.parent_id == null || n.parent_id === '') ? wrapperId : `${ns}:${n.parent_id}`,
        depth: (n.depth || 0) + 2,
      })
    })
  })
  return out
}
