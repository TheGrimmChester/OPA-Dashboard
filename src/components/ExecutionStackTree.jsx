import React, { useState, useMemo, useCallback, useEffect } from 'react'
import {
  FiCpu, FiHardDrive, FiGlobe, FiChevronRight, FiChevronDown,
  FiChevronsDown, FiChevronsUp, FiLayers, FiAlertTriangle, FiInfo,
} from 'react-icons/fi'
import TraceTabFilters from './TraceTabFilters'
import { EmptyState } from './ui'
import { VIZ_V2_ENABLED } from '../utils/chartTheme'
import { detectOpType, typeFill, typeLabel, fnKindLabel } from '../utils/opTypes'
import { fmtMs, fmtBytes, fmtNum, fmtPct } from '../theme/format'
import './ExecutionStackTree.css'

// Row virtualization tuning (only used when VIZ_V2 is enabled).
const ROW_HEIGHT = 30        // fixed windowed-row height in px
const OVERSCAN = 6           // extra rows rendered above/below the viewport
const VIEWPORT_MAX = 640     // max scroll-container height in px
// Indent for windowed rows. It STOPS growing past ROW_INDENT_MAX_DEPTH: letting
// it grow per level either crushes the row content or forces the whole list to
// scroll horizontally (which pushes the right-flushed metrics out of sight).
// Beyond the cap the true depth is shown as a badge instead.
const ROW_INDENT = 14
const ROW_INDENT_MAX_DEPTH = 12
const ROW_PAD = 8            // gutter before the first indent level
// Same node budget as the profile model (callGraphModel MAX_NODES), so a
// pathological trace can't make this the one view that stalls. The overflow is
// reported in the header rather than silently dropped.
const NODE_CAP = 200000
// Compact form of opTypes' FN_KIND_LABELS. User code (0) is the overwhelming
// majority, so it stays untagged and only the notable kinds get a tag.
const KIND_TAG = { 1: 'internal', 2: 'method' }
// Levels opened on load, and the ceiling on how many nodes that may open: a wide
// trace must not seed thousands of expanded rows.
const AUTO_EXPAND_LEVELS = 3
const AUTO_EXPAND_MAX = 400
// Exact counts for the truncation notice. fmtNum's 1-decimal k/M rounding would
// render the cap and the real total identically ("200.0k of 200.0k").
const exact = (n) => n.toLocaleString('en-US')

function ExecutionStackTree({ callStack }) {
  const [expandedNodes, setExpandedNodes] = useState(new Set())
  const [filters, setFilters] = useState({ enabled: false, thresholds: {} })
  const [sortOrder, setSortOrder] = useState('newest') // 'newest' | 'oldest'

  // Normalize nodes - handle both flat and hierarchical structures.
  // _raw keeps a reference (not a copy) to the collector record so the visible
  // rows can classify their operation type lazily instead of paying for
  // detectOpType on every one of a 200k-node trace.
  const normalizeNode = useCallback((node) => {
    return {
      call_id: node.call_id || node.CallID || node.id || Math.random().toString(),
      function: node.function || node.Function || node.name || 'unknown',
      class: node.class || node.Class || '',
      file: node.file || node.File || '',
      line: node.line || node.Line || 0,
      duration_ms: node.duration_ms || node.DurationMs || node.duration || 0,
      cpu_ms: node.cpu_ms || node.CPUMs || node.cpu || 0,
      memory_delta: node.memory_delta || node.MemoryDelta || 0,
      network_bytes_sent: node.network_bytes_sent || node.NetworkBytesSent || 0,
      network_bytes_received: node.network_bytes_received || node.NetworkBytesReceived || 0,
      parent_id: node.parent_id || node.ParentID || null,
      depth: node.depth || node.Depth || 0,
      function_type: node.function_type || node.FunctionType || 0,
      self_ms: 0, // filled below from the child index
      _raw: node,
    }
  }, [])

  // Build root nodes, a parentId -> children[] index, and the metric scales the
  // rows are drawn against.
  const { rootNodes, childrenMap, scale, stats } = useMemo(() => {
    const empty = {
      rootNodes: [],
      childrenMap: new Map(),
      scale: { maxSelf: 0, wall: 0, structureMode: true },
      stats: { calls: 0, depth: 0, truncated: 0 },
    }
    if (!Array.isArray(callStack) || callStack.length === 0) {
      return empty
    }

    // Flatten hierarchical structure if needed
    const flattenStack = (nodes) => {
      const flat = []
      const processNode = (node) => {
        flat.push(node)
        if (node.children && Array.isArray(node.children) && node.children.length > 0) {
          node.children.forEach(processNode)
        }
      }
      nodes.forEach(processNode)
      return flat
    }

    // Check if already hierarchical
    const hasNestedChildren = callStack.some(node =>
      node && node.children && Array.isArray(node.children) && node.children.length > 0
    )

    // Get flat array of all nodes, capped at the shared node budget
    const allNodesFlat = hasNestedChildren ? flattenStack(callStack) : callStack
    const truncated = allNodesFlat.length > NODE_CAP ? allNodesFlat.length : 0
    const source = truncated ? allNodesFlat.slice(0, NODE_CAP) : allNodesFlat

    // Normalize all nodes and create map
    const normalizedNodes = source.map(node => normalizeNode(node))
    const map = new Map()
    const roots = []
    const childIndex = new Map()

    normalizedNodes.forEach(node => map.set(node.call_id, node))

    // Identify roots and index children by parent_id (O(n)). A node whose
    // parent_id is not in the map is promoted to a root: merged/truncated stacks
    // do produce dangling parent refs, and orphaning them would drop whole
    // subtrees from the view without saying so.
    for (const node of normalizedNodes) {
      const pid = node.parent_id
      if (!pid || !map.has(pid)) {
        roots.push(node)
        continue
      }
      const siblings = childIndex.get(pid)
      if (siblings) {
        siblings.push(node)
      } else {
        childIndex.set(pid, [node])
      }
    }

    // Stable child sort by depth (matches previous getChildren ordering),
    // then optionally reversed so the most recent call at each level shows first.
    const byDepth = (a, b) => {
      if (a.depth !== undefined && b.depth !== undefined) {
        return a.depth - b.depth
      }
      return 0
    }
    const applyOrder = (siblings) => {
      siblings.sort(byDepth)
      if (sortOrder === 'newest') siblings.reverse()
      return siblings
    }
    childIndex.forEach(applyOrder)
    applyOrder(roots)

    // Self time = own duration minus the sum of the DIRECT children's durations.
    // Two flat passes over the parent index, never a tree walk, so a cyclic
    // parent_id cannot hang us. Explicit loops throughout: Math.max(...array)
    // throws RangeError past ~124k elements, i.e. exactly the traces this view
    // virtualizes for.
    const childSum = new Map()
    childIndex.forEach((kids, pid) => {
      let sum = 0
      for (let i = 0; i < kids.length; i++) sum += kids[i].duration_ms
      childSum.set(pid, sum)
    })

    let maxSelf = 0
    let maxDuration = 0
    let maxDepth = 0
    for (const node of normalizedNodes) {
      const self = node.duration_ms - (childSum.get(node.call_id) || 0)
      node.self_ms = self > 0 ? self : 0 // clamp: child totals can overshoot a rounded parent
      if (node.self_ms > maxSelf) maxSelf = node.self_ms
      if (node.duration_ms > maxDuration) maxDuration = node.duration_ms
      if (node.depth > maxDepth) maxDepth = node.depth
    }

    let wall = 0
    for (const root of roots) wall += root.duration_ms

    return {
      rootNodes: roots,
      childrenMap: childIndex,
      // structureMode: OPA durations are placeholders and are frequently all
      // zero. Rows then show structure only - never a confident "0µs".
      scale: { maxSelf, wall, structureMode: maxDuration === 0 },
      stats: { calls: normalizedNodes.length, depth: maxDepth + 1, truncated },
    }
  }, [callStack, normalizeNode, sortOrder])

  // Filter function - shared for both root nodes and children
  const shouldIncludeNode = useCallback((node) => {
    if (!filters.enabled) {
      return true
    }

    const thresholds = filters.thresholds || {}

    if (thresholds.duration !== undefined && node.duration_ms < thresholds.duration) {
      return false
    }

    // Memory is a delta, so threshold on its magnitude
    if (thresholds.memory !== undefined && Math.abs(node.memory_delta) < thresholds.memory) {
      return false
    }

    const totalNetwork = (node.network_bytes_sent || 0) + (node.network_bytes_received || 0)
    if (thresholds.network !== undefined && totalNetwork < thresholds.network) {
      return false
    }

    if (thresholds.cpu !== undefined && node.cpu_ms < thresholds.cpu) {
      return false
    }

    return true
  }, [filters])

  // Check if a node has (visible) children - O(1) lookup in the precomputed index.
  // When a filter is active, only count children that pass the filter, so we don't
  // show an expand chevron for a subtree that would render empty.
  const hasChildren = useCallback((nodeId) => {
    const children = childrenMap.get(nodeId)
    if (!children || children.length === 0) {
      return false
    }
    if (!filters.enabled) {
      return true
    }
    return children.some(shouldIncludeNode)
  }, [childrenMap, filters.enabled, shouldIncludeNode])

  // Get children for a specific node - pure O(1) lookup, no state mutation and
  // no node copies, so the self/total figures computed once above stay attached.
  const getChildren = useCallback((parentId) => {
    const children = childrenMap.get(parentId)
    if (!children || children.length === 0) {
      return []
    }
    // Apply filters (shouldIncludeNode is a no-op when filters are disabled)
    return children.filter(shouldIncludeNode)
  }, [childrenMap, shouldIncludeNode])

  // Visible top level (children are resolved lazily on expand)
  const filteredTreeData = useMemo(
    () => rootNodes.filter(shouldIncludeNode),
    [rootNodes, shouldIncludeNode]
  )

  // Open the first few levels whenever the underlying stack changes, so the view
  // lands on the entry path instead of a single collapsed root. Iterative BFS
  // (never recursion) over the parent index, hard-capped in both depth and count.
  useEffect(() => {
    const open = new Set()
    let frontier = rootNodes
    for (let level = 0; level < AUTO_EXPAND_LEVELS && frontier.length > 0 && open.size < AUTO_EXPAND_MAX; level++) {
      const next = []
      for (const node of frontier) {
        if (open.size >= AUTO_EXPAND_MAX) break
        const kids = childrenMap.get(node.call_id)
        if (!kids || kids.length === 0) continue
        open.add(node.call_id)
        for (const kid of kids) next.push(kid)
      }
      frontier = next
    }
    setExpandedNodes(open)
  }, [rootNodes, childrenMap])

  const toggleNode = useCallback((callId) => {
    setExpandedNodes(prev => {
      const newExpanded = new Set(prev)
      if (newExpanded.has(callId)) {
        newExpanded.delete(callId)
      } else {
        newExpanded.add(callId)
      }
      return newExpanded
    })
  }, [])

  const expandAll = useCallback(() => {
    const allVisibleNodeIds = new Set()
    const collectVisibleIds = (nodes) => {
      nodes.forEach(node => {
        if (hasChildren(node.call_id)) {
          allVisibleNodeIds.add(node.call_id)
          // Recurse using the freshly computed children, not stale state
          collectVisibleIds(getChildren(node.call_id))
        }
      })
    }
    collectVisibleIds(filteredTreeData)
    setExpandedNodes(allVisibleNodeIds)
  }, [filteredTreeData, hasChildren, getChildren])

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set())
  }, [])

  // --- Row virtualization (VIZ_V2, on by default) -------------------------
  // Flatten the currently-visible rows (respecting expand state AND active
  // filters) into a linear list so we can window it. This walks the same
  // O(1) childrenMap via getChildren(), so filtering/expand semantics match
  // the recursive renderer exactly.
  const [scrollTop, setScrollTop] = useState(0)

  const flatRows = useMemo(() => {
    if (!VIZ_V2_ENABLED) return []
    const rows = []
    const walk = (nodes, depth) => {
      for (const node of nodes) {
        const expandable = hasChildren(node.call_id)
        rows.push({ node, depth, expandable })
        if (expandable && expandedNodes.has(node.call_id)) {
          walk(getChildren(node.call_id), depth + 1)
        }
      }
    }
    walk(filteredTreeData, 0)
    return rows
  }, [filteredTreeData, expandedNodes, hasChildren, getChildren])

  const handleScroll = useCallback((e) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  if (filteredTreeData.length === 0) {
    return (
      <div className="execution-stack-tree">
        <TraceTabFilters
          onFiltersChange={setFilters}
          availableFilters={['duration', 'memory', 'network', 'cpu']}
        />
        <div className="stack-tree-head">
          <h3 className="stack-tree-title"><FiLayers />Execution stack</h3>
        </div>
        <EmptyState
          icon={<FiLayers />}
          title={filters.enabled && stats.calls > 0
            ? 'No calls match the current thresholds'
            : 'No execution stack recorded'}
          hint={filters.enabled && stats.calls > 0
            ? `${fmtNum(stats.calls)} calls were filtered out - lower the thresholds above`
            : 'The agent captured no call stack for this trace'}
        />
      </div>
    )
  }

  // Windowed slice (only meaningful when VIZ_V2 is enabled; cheap no-op otherwise)
  const total = flatRows.length
  const viewportHeight = Math.min(VIEWPORT_MAX, Math.max(total, 1) * ROW_HEIGHT)
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIndex = Math.min(total, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN)
  const visibleSlice = flatRows.slice(startIndex, endIndex)

  return (
    <div className="execution-stack-tree">
      <TraceTabFilters
        onFiltersChange={setFilters}
        availableFilters={['duration', 'memory', 'network', 'cpu']}
      />
      <div className="stack-tree-head">
        <h3 className="stack-tree-title"><FiLayers />Execution stack</h3>
        <div className="stack-tree-meta opa-mono opa-tnum">
          <span title={`${exact(stats.calls)} calls captured`}>{fmtNum(stats.calls)} calls</span>
          <span className="stack-tree-sep">/</span>
          <span title="Deepest recorded stack depth">depth {fmtNum(stats.depth)}</span>
          {!scale.structureMode && (
            <>
              <span className="stack-tree-sep">/</span>
              <span title="Wall time of the root calls">{fmtMs(scale.wall)}</span>
            </>
          )}
        </div>
        <div className="stack-tree-actions">
          <select
            className="opa-select"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            aria-label="Sibling order"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <button onClick={expandAll} className="opa-btn" type="button">
            <FiChevronsDown />Expand all
          </button>
          <button onClick={collapseAll} className="opa-btn" type="button">
            <FiChevronsUp />Collapse all
          </button>
        </div>
      </div>

      {scale.structureMode && (
        <div className="stack-tree-note">
          <FiInfo />
          No timing was recorded for these calls, so Self and Total are blank and rows show
          call structure only.
        </div>
      )}
      {stats.truncated > 0 && (
        <div className="stack-tree-note is-warn">
          <FiAlertTriangle />
          Trace truncated: showing the first {exact(NODE_CAP)} of {exact(stats.truncated)} calls.
        </div>
      )}

      <div className="stack-tree-colhead">
        <span className="stack-tree-colhead-fn">Function</span>
        <span className="stack-tree-cell stack-tree-cell--self" title="Time in this call, children excluded">Self</span>
        <span className="stack-tree-cell stack-tree-cell--total" title="Time in this call including children">Total</span>
        <span className="stack-tree-cell stack-tree-cell--pct" title="Share of the trace wall time">% trace</span>
      </div>

      {/* Large traces: hand-rolled row windowing (no extra deps). Flatten the
          visible rows, then render only the slice inside the scroll viewport
          plus a small overscan. On by default via VIZ_V2_ENABLED; deployers
          can opt back into the full recursive render with VITE_VIZ_V2=false. */}
      {VIZ_V2_ENABLED ? (
        <div
          className="execution-stack-tree-content execution-stack-tree-content--virtual"
          onScroll={handleScroll}
          style={{ height: viewportHeight, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}
        >
          <div style={{ height: total * ROW_HEIGHT, position: 'relative' }} role="tree" aria-label="Execution stack">
            {visibleSlice.map(({ node, depth, expandable }, i) => {
              const index = startIndex + i
              return (
                <StackRow
                  key={node.call_id || index}
                  node={node}
                  depth={depth}
                  expandable={expandable}
                  isExpanded={expandedNodes.has(node.call_id)}
                  onToggle={toggleNode}
                  virtual
                  top={index * ROW_HEIGHT}
                  zebra={index % 2 === 1}
                  scale={scale}
                />
              )
            })}
          </div>
        </div>
      ) : (
        <div className="execution-stack-tree-content" role="tree" aria-label="Execution stack">
          {filteredTreeData.map((node, idx) => (
            <StackTreeNode
              key={node.call_id || idx}
              node={node}
              expandedNodes={expandedNodes}
              onToggle={toggleNode}
              depth={0}
              getChildren={getChildren}
              hasChildren={hasChildren}
              scale={scale}
            />
          ))}
        </div>
      )}

      <div className="stack-tree-foot">
        <span className="opa-tnum">{fmtNum(total)} rows shown</span>
        <span className="stack-tree-legend">
          Self = this call only, Total = with children. Bar length is Self against the hottest call.
        </span>
      </div>
    </div>
  )
}

// Recursive renderer, used when VIZ_V2 is disabled. Indentation comes from the
// nested rails instead of row padding, so StackRow renders flush here.
function StackTreeNode({ node, expandedNodes, onToggle, depth, getChildren, hasChildren, scale }) {
  const nodeHasChildren = hasChildren(node.call_id)
  const isExpanded = expandedNodes.has(node.call_id)
  const children = isExpanded && nodeHasChildren ? getChildren(node.call_id) : []

  return (
    <>
      <StackRow
        node={node}
        depth={depth}
        expandable={nodeHasChildren}
        isExpanded={isExpanded}
        onToggle={onToggle}
        scale={scale}
      />
      {children.length > 0 && (
        <div className="stack-tree-children" role="group">
          {children.map((child, idx) => (
            <StackTreeNode
              key={child.call_id || idx}
              node={child}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              depth={depth + 1}
              getChildren={getChildren}
              hasChildren={hasChildren}
              scale={scale}
            />
          ))}
        </div>
      )}
    </>
  )
}

// Signed byte delta. fmtBytes already prints the minus sign; allocations get an
// explicit "+" so a delta never reads as an absolute footprint.
function memoryLabel(bytes) {
  return bytes > 0 ? `+${fmtBytes(bytes)}` : fmtBytes(bytes)
}

// One stack row. In the windowed path it is absolutely positioned and exactly
// ROW_HEIGHT tall (a prerequisite for scrollTop-based windowing), so everything
// it renders has to fit on a single line.
function StackRow({ node, depth, expandable, isExpanded, onToggle, virtual, top, zebra, scale }) {
  const opType = detectOpType(node._raw)
  const typeColor = typeFill(opType)
  const displayName = node.class ? `${node.class}::${node.function}` : node.function
  const kindTag = KIND_TAG[node.function_type]
  const capped = virtual && depth > ROW_INDENT_MAX_DEPTH
  const indent = (virtual ? Math.min(depth, ROW_INDENT_MAX_DEPTH) : 0) * ROW_INDENT
  const zero = scale.structureMode
  const selfFrac = scale.maxSelf > 0 ? node.self_ms / scale.maxSelf : 0
  const share = scale.wall > 0 ? (node.duration_ms / scale.wall) * 100 : null
  const net = node.network_bytes_sent + node.network_bytes_received

  const style = {
    paddingLeft: `${indent + ROW_PAD}px`,
    // Ancestor guide rails are painted as a background gradient sized to the
    // indent (see CSS), so nesting costs no extra DOM per level.
    '--stack-indent': `${indent}px`,
  }
  if (virtual) {
    style.position = 'absolute'
    style.top = top
    style.left = 0
    style.right = 0
    style.height = ROW_HEIGHT
  }

  const toggle = () => onToggle(node.call_id)
  const onKeyDown = (e) => {
    if (!expandable) return
    const open = e.key === 'Enter' || e.key === ' ' || (e.key === 'ArrowRight' && !isExpanded)
    const close = e.key === 'ArrowLeft' && isExpanded
    if (open || close) {
      e.preventDefault()
      toggle()
    }
  }

  const title = [
    displayName,
    node.file ? `${node.file}${node.line > 0 ? `:${node.line}` : ''}` : null,
    zero ? null : `self ${fmtMs(node.self_ms)} / total ${fmtMs(node.duration_ms)}${share == null ? '' : ` (${fmtPct(share)})`}`,
    `${typeLabel(opType)} / ${fnKindLabel(node.function_type)} / level ${depth + 1}`,
  ].filter(Boolean).join('\n')

  return (
    <div
      className={
        'stack-tree-node-content' +
        (virtual ? ' stack-tree-node-content--virtual' : '') +
        (zebra ? ' is-zebra' : '') +
        (expandable ? ' is-expandable' : '')
      }
      style={style}
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={expandable ? isExpanded : undefined}
      tabIndex={0}
      title={title}
      onClick={expandable ? toggle : undefined}
      onKeyDown={onKeyDown}
    >
      {expandable ? (
        <button
          className="stack-tree-expand-btn"
          // No handler of its own: the click bubbles to the row, which owns
          // toggling. tabIndex -1 keeps the row as the single focus target
          // instead of two tab stops per row.
          tabIndex={-1}
          aria-label={isExpanded ? `Collapse ${displayName}` : `Expand ${displayName}`}
          type="button"
        >
          {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
        </button>
      ) : (
        <span className="stack-tree-spacer" />
      )}
      <span className="stack-tree-dot" style={{ background: typeColor }} aria-hidden="true" />

      <div className="stack-tree-node-name">
        <strong className="stack-tree-fn">{displayName}</strong>
        {node.file && (
          <span className="stack-tree-file">
            {node.file.split('/').pop()}{node.line > 0 && `:${node.line}`}
          </span>
        )}
        {kindTag && <span className={`stack-tree-function-type ${kindTag}`}>{kindTag}</span>}
        {capped && (
          <span className="stack-tree-depth-badge" title={`Nesting level ${depth + 1}`}>
            d{depth + 1}
          </span>
        )}

        {node.cpu_ms > 0 && !zero && (
          <span className="stack-tree-chip" title={`CPU ${fmtMs(node.cpu_ms)}`}>
            <FiCpu />{fmtMs(node.cpu_ms)}
          </span>
        )}
        {node.memory_delta !== 0 && (
          // Negative = memory released, the only unambiguously good direction;
          // allocations stay neutral rather than being scored as failures.
          <span
            className={`stack-tree-chip${node.memory_delta < 0 ? ' is-freed' : ''}`}
            title={`Memory delta ${memoryLabel(node.memory_delta)}`}
          >
            <FiHardDrive />{memoryLabel(node.memory_delta)}
          </span>
        )}
        {net > 0 && (
          <span
            className="stack-tree-chip is-net"
            title={`Network sent ${fmtBytes(node.network_bytes_sent)}, received ${fmtBytes(node.network_bytes_received)}`}
          >
            <FiGlobe />
            {node.network_bytes_sent > 0 && `↑${fmtBytes(node.network_bytes_sent)}`}
            {node.network_bytes_sent > 0 && node.network_bytes_received > 0 && ' '}
            {node.network_bytes_received > 0 && `↓${fmtBytes(node.network_bytes_received)}`}
          </span>
        )}

        <span className="stack-tree-cells">
          <span className="stack-tree-cell stack-tree-cell--self">
            {!zero && selfFrac > 0 && (
              <span
                className="stack-tree-selffill"
                style={{ width: `${selfFrac * 100}%`, background: typeColor }}
                aria-hidden="true"
              />
            )}
            <span className="stack-tree-cellval">{zero ? '—' : fmtMs(node.self_ms)}</span>
          </span>
          <span className="stack-tree-cell stack-tree-cell--total">
            {zero ? '—' : fmtMs(node.duration_ms)}
          </span>
          <span className="stack-tree-cell stack-tree-cell--pct">
            {zero || share == null ? '—' : fmtPct(share, share < 10 ? 1 : 0)}
          </span>
        </span>
      </div>
    </div>
  )
}

export default ExecutionStackTree
