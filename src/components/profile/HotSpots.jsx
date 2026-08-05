import React, { useCallback, useMemo, useState } from 'react'
import {
  FiAlertTriangle, FiChevronRight, FiCornerDownRight, FiCornerLeftUp, FiInfo, FiRepeat,
  FiSearch, FiX,
} from 'react-icons/fi'
import { Button, EmptyState, Meter, Table } from '@open-family/ui'
import { useTableSort } from '../../hooks/useTableSort'
import { fmtBytes, fmtMs, fmtNum, fmtPct } from '../../theme/format'
import {
  METRICS, baseName, clsName, fileName, fnName, lineNo, neighbours, representativePath,
} from '../../utils/callGraphModel'
import { TYPE_ORDER, fnKindLabel, typeFill, typeLabel } from '../../utils/opTypes'
import { METRIC_LABELS } from './ProfileToolbar'
import './profile.css'

// A trace can hold 50k symbols; the table renders every row it is given, so the
// list is capped and the cap is stated in the footer.
const ROW_CAP = 250
const NEIGHBOUR_LIMIT = 12
const PATH_CAP = 40
const NAME_MAX = 58
const DETAIL_ID = 'opa-prof-detail'

const BYTE_METRICS = { memory: true, network: true }

// Metric-correct value formatting (time vs bytes). Exported so the other profile
// views format the same numbers the same way.
export function fmtMetric(metric, v) {
  return BYTE_METRICS[metric] ? fmtBytes(v) : fmtMs(v)
}

// CSS can only ellipsise an edge, but the informative half of a PHP symbol is
// the TAIL (Class::method) — so the middle is what gets dropped.
export function middleEllipsis(s, max = NAME_MAX) {
  const str = s == null ? '' : String(s)
  if (str.length <= max) return str
  const head = Math.ceil((max - 1) / 2)
  return `${str.slice(0, head)}…${str.slice(str.length - (max - 1 - head))}`
}

// typeFill's neutral is a surface color: unusable as text, so unknown types fall
// back to a text token here.
function typeTone(op) {
  return op >= 0 ? typeFill(TYPE_ORDER[op]) : 'var(--text-muted)'
}

/**
 * Proportion bar for a table cell: the kit's Meter carries the share and the
 * figure beside it carries the value, because a bar on its own cannot be read.
 *
 * The bar no longer takes the operation type's hue. Meter's fill follows the
 * product accent, and the type is already spelled out as a labelled tag in the
 * Function cell — so nothing was riding on the colour alone.
 */
function MetricBar({ value, max, label, measure }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <span className="opa-prof-bar">
      <Meter value={pct} label={`${measure}: ${fmtPct(pct, 0)} of the largest in view`} />
      <span className="opa-prof-bar-v oui-num">{label}</span>
    </span>
  )
}

// Class-qualified but namespace-stripped: readable inside a breadcrumb.
function shortLabel(node) {
  const fn = fnName(node)
  const cls = clsName(node)
  if (!cls) return fn
  const parts = cls.split('\\')
  return `${parts[parts.length - 1]}::${fn}`
}

function srcLabel(node) {
  const file = fileName(node)
  if (!file) return ''
  const line = lineNo(node)
  return `${baseName(file)}${line ? `:${line}` : ''}`
}

function Stat({ label, value, title }) {
  return (
    <div className="opa-prof-stat" title={title}>
      <span className="opa-prof-stat-l">{label}</span>
      <span className="opa-prof-stat-v">{value}</span>
    </div>
  )
}

function FunctionCell({ row, graph, selected, onSelect }) {
  const s = row.s
  const rec = graph.recursiveCalls[s]
  return (
    <span className="opa-prof-fncell">
      <button
        type="button"
        className={`opa-prof-fn${selected ? ' is-selected' : ''}`}
        aria-expanded={selected}
        aria-controls={selected ? DETAIL_ID : undefined}
        title={row.key}
        // The row's own onClick would immediately toggle the selection back off.
        onClick={(e) => { e.stopPropagation(); onSelect(row.key, s) }}
      >
        <span className="opa-prof-type" style={{ color: typeTone(graph.symOpType[s]) }}>
          {typeLabel(TYPE_ORDER[graph.symOpType[s]])}
        </span>
        <span className="opa-prof-fn-name">{middleEllipsis(row.key)}</span>
      </button>
      {rec > 0 && (
        <span className="opa-prof-flag" title={`${rec} recursive call${rec === 1 ? '' : 's'}`}>
          <FiRepeat size={10} aria-hidden="true" />{fmtNum(rec)}
        </span>
      )}
      {graph.symIsWrapper[s] === 1 && (
        <span className="opa-prof-flag" title="Synthetic trace / span entry point">entry</span>
      )}
    </span>
  )
}

// One side of the caller/callee pivot. The "via" bar is the cost that flowed
// through THAT call site, which is what answers "why is this hot?".
function NeighbourList({ title, icon, dir, entries, graph, ranked, mk, structureMode, focus, onSelect }) {
  const deg = dir === 'in' ? ranked.inDeg[focus] : ranked.outDeg[focus]
  const edgeVal = (e) => (structureMode ? graph.eCount[e] : Math.abs(graph.eW[mk][e]))
  let max = 0
  for (let i = 0; i < entries.length; i++) max = Math.max(max, edgeVal(entries[i].e))

  return (
    <div className="opa-prof-col">
      <div className="opa-prof-col-head">
        {icon}{title}<span className="oui-text-muted oui-num">{fmtNum(deg)}</span>
      </div>
      {entries.length === 0 ? (
        <div className="opa-prof-nempty">
          {dir === 'in'
            ? 'No caller in this trace — this is an entry point.'
            : 'No callee in this trace — leaf function.'}
        </div>
      ) : (
        <>
          <div className="opa-prof-nhead">
            <span>{dir === 'in' ? 'Caller' : 'Callee'}</span>
            <span title="Cost that flowed through this call site">{structureMode ? 'Via (calls)' : 'Via'}</span>
            <span className="opa-prof-nnum">Self</span>
            <span className="opa-prof-nnum">Total</span>
            <span className="opa-prof-nnum">Calls</span>
          </div>
          {entries.map(({ e, sym: other }) => (
            <button
              key={e}
              type="button"
              className="opa-prof-nrow"
              title={`${graph.symKey[other]} — ${fmtNum(graph.eCount[e])} call site hit${graph.eCount[e] === 1 ? '' : 's'}`}
              onClick={() => onSelect(graph.symKey[other], other)}
            >
              <span className="opa-prof-nname">{middleEllipsis(graph.symKey[other], 40)}</span>
              <MetricBar
                value={edgeVal(e)}
                max={max}
                label={structureMode ? fmtNum(graph.eCount[e]) : fmtMetric(mk, graph.eW[mk][e])}
                measure={structureMode ? 'Calls through this call site' : 'Cost through this call site'}
              />
              <span className="opa-prof-nnum">{structureMode ? '—' : fmtMetric(mk, graph.selfM[mk][other])}</span>
              <span className="opa-prof-nnum">{structureMode ? '—' : fmtMetric(mk, graph.inclM[mk][other])}</span>
              <span className="opa-prof-nnum">{fmtNum(graph.callCount[other])}</span>
            </button>
          ))}
          {deg > entries.length && (
            <div className="opa-prof-nempty">+{fmtNum(deg - entries.length)} more · top {entries.length} by cost shown</div>
          )}
        </>
      )}
    </div>
  )
}

function SymbolDetail({ graph, ranked, mk, structureMode, shareBase, sym, onSelect, onClose }) {
  const callers = useMemo(() => neighbours(graph, ranked, sym, 'in', NEIGHBOUR_LIMIT), [graph, ranked, sym])
  const callees = useMemo(() => neighbours(graph, ranked, sym, 'out', NEIGHBOUR_LIMIT), [graph, ranked, sym])
  const path = useMemo(() => representativePath(graph, sym, PATH_CAP), [graph, sym])

  const self = graph.selfM[mk][sym]
  const incl = graph.inclM[mk][sym]
  const pct = shareBase > 0 ? (Math.abs(self) / shareBase) * 100 : null
  const rep = graph.repIdx[sym]
  const node = rep >= 0 ? graph.calls.src[rep] : null
  const src = node ? srcLabel(node) : ''
  const rec = graph.recursiveCalls[sym]

  return (
    <div className="opa-prof-detail" id={DETAIL_ID}>
      <div className="opa-prof-detail-head">
        <div className="opa-prof-detail-id">
          <div className="opa-prof-detail-title">
            <span className="opa-prof-type" style={{ color: typeTone(graph.symOpType[sym]) }}>
              {typeLabel(TYPE_ORDER[graph.symOpType[sym]])}
            </span>
            {graph.symKey[sym]}
          </div>
          <div className="opa-prof-detail-src oui-mono" title={node && fileName(node) ? fileName(node) : undefined}>
            {/* function_type is often absent; "Unknown function" is noise, so the
                kind only appears when the collector actually reported it. */}
            {[
              graph.symFnType[sym] >= 0 ? fnKindLabel(graph.symFnType[sym]) : null,
              src || null,
              rec > 0 ? `${fmtNum(rec)} recursive` : null,
              graph.symIsWrapper[sym] === 1 ? 'synthetic entry point' : null,
            ].filter(Boolean).join(' · ') || 'No source location reported'}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="opa-prof-close"
          icon={<FiX />}
          aria-label="Close function details"
          onClick={onClose}
        />
      </div>

      <div className="opa-prof-stats">
        <Stat
          label={`Self ${METRIC_LABELS[mk].toLowerCase()}`}
          value={structureMode ? '—' : fmtMetric(mk, self)}
          title={structureMode ? 'Not recorded in this trace' : undefined}
        />
        <Stat label="Self %" value={pct == null ? '—' : fmtPct(pct)} />
        <Stat label="Total" value={structureMode ? '—' : fmtMetric(mk, incl)} title="Inclusive: recursion counted once" />
        <Stat label="Calls" value={fmtNum(graph.callCount[sym])} />
        <Stat label="Callers" value={fmtNum(ranked.inDeg[sym])} />
        <Stat label="Callees" value={fmtNum(ranked.outDeg[sym])} />
        <Stat
          label="Depth"
          value={graph.minDepth[sym] === graph.maxDepth[sym] ? fmtNum(graph.minDepth[sym]) : `${graph.minDepth[sym]}–${graph.maxDepth[sym]}`}
          title="Stack depth range across every observed call"
        />
      </div>

      {path.length > 0 && (
        <div className="opa-prof-path">
          {/* One CONCRETE path, not "the" stack: the symbol is an aggregate. */}
          <span className="opa-prof-stat-l">Observed path</span>
          {path.length === PATH_CAP && <span className="opa-prof-crumb-sep">…</span>}
          {path.map(({ idx, node: pn }, i) => {
            const ps = graph.symOf[idx]
            const last = i === path.length - 1
            const label = shortLabel(pn)
            const title = `${graph.symKey[ps] || label}${srcLabel(pn) ? ` — ${srcLabel(pn)}` : ''}`
            return (
              <React.Fragment key={idx}>
                {i > 0 && <FiChevronRight className="opa-prof-crumb-sep" size={11} aria-hidden="true" />}
                {ps >= 0 && !last ? (
                  <button type="button" className="opa-prof-crumb" title={title} onClick={() => onSelect(graph.symKey[ps], ps)}>
                    {label}
                  </button>
                ) : (
                  <span className={`opa-prof-crumb${last ? ' is-focus' : ''}`} title={title} aria-current={last ? 'true' : undefined}>
                    {label}
                  </span>
                )}
              </React.Fragment>
            )
          })}
        </div>
      )}

      <div className="opa-prof-cols">
        <NeighbourList
          title="Callers" icon={<FiCornerLeftUp aria-hidden="true" />} dir="in" entries={callers}
          graph={graph} ranked={ranked} mk={mk} structureMode={structureMode} focus={sym} onSelect={onSelect}
        />
        <NeighbourList
          title="Callees" icon={<FiCornerDownRight aria-hidden="true" />} dir="out" entries={callees}
          graph={graph} ranked={ranked} mk={mk} structureMode={structureMode} focus={sym} onSelect={onSelect}
        />
      </div>
    </div>
  )
}

function HotSpotsBody({ model, metric, query, onMetricChange, selectedKey, onSelectSymbol }) {
  const { graph, ranked, totals } = model
  // The columns exist for every metric, but the ORDER always follows the metric
  // the model was ranked with.
  const mk = METRICS.indexOf(metric) >= 0 ? metric : ranked.metric
  // Only blank the value columns when the metric truly carries no data. Using
  // ranked.structureMode here claimed "memory was not recorded" for any trace
  // whose allocations and frees happen to cancel in the signed sum.
  const structureMode = totals ? !totals.hasData[mk] : ranked.structureMode
  // Σ|self|: the share denominator. |Σ self| put signed metrics into the
  // thousands of percent.
  const shareBase = totals ? totals.selfAbs[mk] : ranked.totalSelf
  const q = (query || '').trim()

  const keyIndex = useMemo(() => {
    const m = new Map()
    for (let s = 0; s < graph.S; s++) m.set(graph.symKey[s], s)
    return m
  }, [graph])

  // Controlled when the caller passes selectedKey at all, self-managed only when
  // the prop is absent. Testing `!= null` instead made a controlled null fall
  // through to the internal key, so a parent could set a selection but never
  // clear one (e.g. on trace change) and the detail pane stayed stuck open.
  const controlled = selectedKey !== undefined
  const [ownKey, setOwnKey] = useState(null)
  const activeKey = controlled ? selectedKey : ownKey
  const selSym = activeKey != null && keyIndex.has(activeKey) ? keyIndex.get(activeKey) : -1

  const select = useCallback((key, sym) => {
    setOwnKey((prev) => (prev === key ? null : key))
    if (onSelectSymbol) onSelectSymbol(key, sym)
  }, [onSelectSymbol])

  const clear = useCallback(() => {
    setOwnKey(null)
    if (onSelectSymbol) onSelectSymbol(null, -1)
  }, [onSelectSymbol])

  const view = useMemo(() => {
    const needle = q.toLowerCase()
    const self = graph.selfM[mk]
    const order = ranked.hotOrder
    const rows = []
    let matched = 0
    let maxSelf = 0
    let maxCalls = 0
    for (let k = 0; k < order.length; k++) {
      const s = order[k]
      // The model never hides the focus, so a drilled-into symbol stays visible.
      if (!ranked.visible[s] && s !== selSym) continue
      const key = graph.symKey[s]
      if (needle && key.toLowerCase().indexOf(needle) < 0) continue
      matched++
      if (rows.length >= ROW_CAP) continue
      rows.push({ s, key, rank: k + 1 })
      const a = Math.abs(self[s])
      if (a > maxSelf) maxSelf = a
      if (graph.callCount[s] > maxCalls) maxCalls = graph.callCount[s]
    }
    return { rows, matched, maxSelf, maxCalls }
  }, [graph, ranked, mk, q, selSym])

  const { rows, matched, maxSelf, maxCalls } = view

  const columns = useMemo(() => {
    const self = graph.selfM[mk]
    const incl = graph.inclM[mk]
    const metricName = METRIC_LABELS[mk]
    const cols = [
      {
        key: 'rank',
        header: '#',
        numeric: true,
        width: 44,
        sortValue: (r) => r.rank,
        render: (r) => <span className="opa-prof-rank">{r.rank}</span>,
      },
      {
        key: 'fn',
        header: 'Function',
        sortValue: (r) => r.key,
        render: (r) => <FunctionCell row={r} graph={graph} selected={r.s === selSym} onSelect={select} />,
      },
      {
        key: 'self',
        header: 'Self',
        width: 180,
        sortValue: (r) => Math.abs(self[r.s]),
        render: (r) => (structureMode ? <span className="opa-prof-dim">—</span> : (
          <MetricBar
            value={Math.abs(self[r.s])}
            max={maxSelf}
            label={fmtMetric(mk, self[r.s])}
            measure={`Self ${metricName.toLowerCase()}`}
          />
        )),
      },
      {
        key: 'pct',
        header: 'Self %',
        numeric: true,
        width: 74,
        sortValue: (r) => Math.abs(self[r.s]),
        render: (r) => (shareBase > 0
          ? fmtPct((Math.abs(self[r.s]) / shareBase) * 100)
          : <span className="opa-prof-dim" title="Metric not recorded">—</span>),
      },
      {
        key: 'total',
        header: 'Total',
        numeric: true,
        width: 92,
        sortValue: (r) => Math.abs(incl[r.s]),
        render: (r) => (structureMode ? <span className="opa-prof-dim">—</span> : fmtMetric(mk, incl[r.s])),
      },
    ]
    // With no metric to show, the ranking IS the call count — so the bar moves
    // to the column that actually carries data instead of faking a time bar.
    cols.push(structureMode
      ? {
        key: 'calls',
        header: 'Calls',
        width: 150,
        sortValue: (r) => graph.callCount[r.s],
        render: (r) => (
          <MetricBar
            value={graph.callCount[r.s]}
            max={maxCalls}
            label={fmtNum(graph.callCount[r.s])}
            measure="Calls"
          />
        ),
      }
      : {
        key: 'calls',
        header: 'Calls',
        numeric: true,
        width: 72,
        sortValue: (r) => graph.callCount[r.s],
        render: (r) => fmtNum(graph.callCount[r.s]),
      })
    return cols
  }, [graph, ranked, mk, maxSelf, maxCalls, structureMode, selSym, select, shareBase])

  // The kit's Table leaves sorting to the caller. The hook keeps the previous
  // behaviour exactly: every column sortable, no initial sort, numeric columns
  // descending on the first click.
  const { rows: sortedRows, columns: sortableColumns, onSort } = useTableSort(rows, columns)

  const withData = useMemo(
    () => METRICS.filter((k) => (totals ? totals.hasData[k] : Math.abs(graph.totalSelfM[k]) > 0)),
    [graph, totals],
  )

  const hidden = graph.S - ranked.visibleCount

  return (
    <div className="opa-prof-hotspots">
      {structureMode && (
        <div className="opa-prof-notice warn">
          <FiAlertTriangle aria-hidden="true" />
          <div>
            <strong>{METRIC_LABELS[mk]}</strong> was not recorded in this trace (every value is 0), so rows are
            ranked by <strong>call count</strong>. Self, total and share are shown as “—” rather than 0.
          </div>
          {onMetricChange && withData.length > 0 && (
            <div className="opa-prof-notice-actions">
              {withData.map((k) => (
                <Button key={k} size="sm" variant="secondary" onClick={() => onMetricChange(k)}>
                  Rank by {METRIC_LABELS[k]}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Data exists, but its signed total cancels (allocations against frees),
          so the ranking fell back to call count. The values are real and stay
          visible — only the ORDER is not by cost. */}
      {!structureMode && model.totals.rankedByCalls && (
        <div className="opa-prof-notice">
          <FiInfo aria-hidden="true" />
          <div>
            <strong>{METRIC_LABELS[mk]}</strong> nets out to zero across this trace, so rows are ordered by
            <strong> call count</strong>. The per-function values below are still exact.
          </div>
        </div>
      )}
      {model.totals.truncated && (
        <div className="opa-prof-notice">
          <FiInfo aria-hidden="true" />
          <div>
            Ingest stopped at the first <strong>{fmtNum(model.totals.calls)}</strong> of {fmtNum(model.totals.scanned)} calls;
            the ranking below covers that prefix only.
          </div>
        </div>
      )}
      {ranked.allEqual && !structureMode && (
        <div className="opa-prof-notice">
          <FiInfo aria-hidden="true" />
          <div>Every function reports the same self {METRIC_LABELS[mk].toLowerCase()} — the order below is a tie-break, not a cost ranking.</div>
        </div>
      )}

      <Table
        aria-label="Functions ranked by self cost"
        // The model is built synchronously from a call stack the caller already
        // holds, so there is no in-flight fetch here and no loading state to
        // show. `errorState` is required of every Table in this codebase and is
        // wired for the day the model is built off a request.
        state={rows.length ? 'ready' : 'empty'}
        columns={sortableColumns}
        rows={sortedRows}
        getRowKey={(r) => String(r.s)}
        onSort={onSort}
        onRowClick={(r) => select(r.key, r.s)}
        emptyState={
          <EmptyState
            inline
            icon={<FiSearch />}
            title={q ? `No function matches “${q}”` : 'No function passes the current filters'}
            description={q
              ? 'The filter runs against the whole symbol key, so a namespace or class fragment matches too.'
              : 'Every function in this trace fell below the significance threshold for the selected metric. Ranking by a metric the trace actually recorded usually brings them back.'}
          />
        }
        errorState={
          <EmptyState
            inline
            icon={<FiAlertTriangle />}
            title="The hot-spot list could not be built"
            description="Aggregating this trace's call stack failed, so there is no ranking to show. The rest of the profile is unaffected."
          />
        }
      />

      <div className="opa-prof-foot">
        {matched > rows.length
          ? `Top ${rows.length} of ${fmtNum(matched)} matching functions — sorting reorders these ${rows.length}.`
          : `${fmtNum(matched)} function${matched === 1 ? '' : 's'}${q ? ' matching' : ''}.`}
        {hidden > 0 && ` ${fmtNum(hidden)} below the significance threshold hidden.`}
      </div>

      {selSym >= 0 && (
        <SymbolDetail
          graph={graph}
          ranked={ranked}
          mk={mk}
          structureMode={structureMode}
          shareBase={shareBase}
          sym={selSym}
          onSelect={select}
          onClose={clear}
        />
      )}
    </div>
  )
}

/**
 * Blackfire-style hot-spot list: functions ranked by SELF cost, with an inline
 * caller/callee pivot for the selected symbol.
 *
 * The outer component only handles the degenerate cases, so the body's hooks
 * always run against a real model.
 *
 * `maxHeight` is accepted and ignored. The kit's table scrolls its own wrapper
 * and the page scrolls; capping the height here put the row count behind a
 * second scrollbar nested inside the page's. Callers can drop the prop.
 */
export default function HotSpots({ model, metric = 'duration', query = '', onMetricChange, selectedKey, onSelectSymbol, maxHeight: _maxHeight }) {
  if (!model || !model.ready) {
    return (
      <EmptyState
        inline
        title="No profile data"
        description="This trace carries no call stack, so there is nothing to rank. The OPA profiler records one when it is enabled for the service."
      />
    )
  }
  if (model.graph.S === 0) {
    return (
      <EmptyState
        inline
        title="No function survived aggregation"
        description="Every call was filtered out before grouping. Lowering the significance threshold or grouping by method rather than class usually recovers them."
      />
    )
  }
  return (
    <HotSpotsBody
      model={model}
      metric={metric}
      query={query}
      onMetricChange={onMetricChange}
      selectedKey={selectedKey}
      onSelectSymbol={onSelectSymbol}
    />
  )
}
