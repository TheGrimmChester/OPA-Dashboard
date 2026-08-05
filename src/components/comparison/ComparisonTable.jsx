import React from 'react'
import { Table, Card, Badge, EmptyState, Delta, DefinitionList } from '@open-family/ui'
import { formatPercentageDiff } from '../../utils/comparisonUtils'

/**
 * One side-by-side comparison table, used by all of them.
 *
 * There were five of these — SQL, HTTP, cache, Redis, tags — each a hand-written
 * `<table>` with its own stylesheet, its own padding and its own header size. So
 * the same comparison rendered at a different density depending on which tab you
 * were on, and none of them matched the tables everywhere else in the product.
 *
 * A comparison has three parts, and they are the props: a `summary` of totals, an
 * `identity` column naming the thing being compared, and a list of `metrics`
 * measured on both sides. Everything else is shared.
 */

/**
 * A change between the two traces.
 *
 * `changeType` from `comparisonUtils` says whether the movement is an increase or
 * a decrease; whether that is *welcome* depends on the measure, which is why
 * `lowerIsBetter` is a separate input. Duration going down is good news; a cache
 * hit rate going down is not.
 */
function ChangeCell({ change, lowerIsBetter = true }) {
  if (!change) return <span className="oui-text-muted">—</span>
  const raw = Number(change.diff)
  if (!Number.isFinite(raw) || raw === 0) {
    return <Delta value={formatPercentageDiff(change.diff)} direction="flat" />
  }
  const rising = raw > 0
  return (
    <Delta
      value={formatPercentageDiff(change.diff)}
      direction={rising ? 'up' : 'down'}
      good={lowerIsBetter ? !rising : rising}
    />
  )
}

export default function ComparisonTable({
  /** `{ comparison: [], total1, total2, totalDiff, … }` from comparisonUtils. */
  comparison,
  /** Names the table for assistive technology. */
  label,
  /** Shown when there is nothing on either side. */
  emptyTitle,
  emptyDescription,
  /** `[{ term, value }]` totals above the table. */
  summary = [],
  /** `{ header, render, mono }` — the thing being compared. */
  identity,
  /** `[{ key, label, left, right, change, lowerIsBetter }]` measured both sides. */
  metrics = [],
  /** Extra trailing columns, already in kit column shape. */
  extraColumns = [],
  getRowKey = (row, index) => String(index),
}) {
  const rows = comparison?.comparison || []

  if (!comparison || rows.length === 0) {
    return (
      <Card>
        <EmptyState inline title={emptyTitle} description={emptyDescription} />
      </Card>
    )
  }

  const sideCell = (row, pick) => (
    <span className="oui-stack opa-cmp-side">
      {metrics.map((metric) => (
        <span key={metric.key} className="oui-row is-between">
          <span className="oui-text-muted oui-text-sm">{metric.label}</span>
          <span className="oui-num">{pick(metric, row)}</span>
        </span>
      ))}
    </span>
  )

  const columns = [
    {
      key: 'identity',
      header: identity.header,
      mono: identity.mono,
      render: (row) => (
        <span className="oui-row">
          {identity.render(row)}
          {row.existsInBoth === false ? (
            <Badge tone="accent">Only one trace</Badge>
          ) : null}
        </span>
      ),
    },
    { key: 'left', header: 'Trace 1', render: (row) => sideCell(row, (m, r) => m.left(r)) },
    { key: 'right', header: 'Trace 2', render: (row) => sideCell(row, (m, r) => m.right(r)) },
    {
      key: 'change',
      header: 'Change',
      render: (row) => (
        <span className="oui-stack opa-cmp-side">
          {metrics.map((metric) => (
            <span key={metric.key} className="oui-row is-between">
              <span className="oui-text-muted oui-text-sm">{metric.label}</span>
              <ChangeCell change={metric.change(row)} lowerIsBetter={metric.lowerIsBetter !== false} />
            </span>
          ))}
        </span>
      ),
    },
    ...extraColumns,
  ]

  return (
    <div className="oui-stack">
      {summary.length > 0 ? (
        <Card quiet>
          <DefinitionList items={summary} />
        </Card>
      ) : null}

      <Card flush>
        <Table
          aria-label={label}
          // The comparison is computed from two traces that are already
          // resolved before this renders, so there is no in-flight state here.
          state={rows.length ? 'ready' : 'empty'}
          columns={columns}
          rows={rows}
          getRowKey={getRowKey}
          emptyState={<EmptyState inline title={emptyTitle} description={emptyDescription} />}
          errorState={
            <EmptyState
              inline
              title="This comparison could not be built"
              description="One of the two traces did not resolve. Reload the comparison to try again."
            />
          }
        />
      </Card>
    </div>
  )
}

/** Totals row helper: "12 → 18" with the change beside it. */
export function summaryItem(term, from, to, change, lowerIsBetter = true) {
  return {
    term,
    value: (
      <span className="oui-row">
        <span className="oui-num">{from}</span>
        <span className="oui-text-muted" aria-hidden="true">→</span>
        <span className="oui-num">{to}</span>
        <ChangeCell change={change} lowerIsBetter={lowerIsBetter} />
      </span>
    ),
  }
}
