import React from 'react'
import { Table, Card, Badge, EmptyState, DefinitionList } from '@open-family/ui'
import { summaryItem } from './ComparisonTable'

/**
 * Tag keys and their values, side by side across two traces.
 *
 * This is not a metric comparison — there is no magnitude to diff, only whether a
 * key is present and whether its values match. So it states the outcome as a word
 * rather than a percentage, and the badge tone is a second encoding of that word
 * rather than the only one.
 */
function outcome(item) {
  if (item.isEqual) return { label: 'Equal', tone: 'good' }
  if (item.existsInBoth) return { label: 'Different', tone: 'warning' }
  if ((item.values1 || []).length > 0) return { label: 'Removed', tone: 'critical' }
  return { label: 'Added', tone: 'accent' }
}

function Values({ values }) {
  if (!values || values.length === 0) return <span className="oui-text-muted">—</span>
  return (
    <span className="oui-row opa-cmp-codes">
      {values.map((value, index) => (
        <Badge key={`${index}-${value}`}>{String(value)}</Badge>
      ))}
    </span>
  )
}

export default function TagComparisonView({ comparison }) {
  const rows = comparison?.comparison || []

  if (!comparison || rows.length === 0) {
    return (
      <Card>
        <EmptyState
          inline
          title="No tags to compare"
          description="Neither trace carries any tags, so there is nothing to line up."
        />
      </Card>
    )
  }

  const columns = [
    { key: 'key', header: 'Tag key', mono: true, render: (r) => <span className="oui-mono">{r.key}</span> },
    { key: 'values1', header: 'Trace 1', render: (r) => <Values values={r.values1} /> },
    { key: 'values2', header: 'Trace 2', render: (r) => <Values values={r.values2} /> },
    {
      key: 'status',
      header: 'Status',
      render: (r) => {
        const { label, tone } = outcome(r)
        return <Badge tone={tone}>{label}</Badge>
      },
    },
  ]

  return (
    <div className="oui-stack">
      <Card quiet>
        <DefinitionList
          items={[
            summaryItem('Total tags', comparison.total1, comparison.total2, comparison.totalDiff),
            summaryItem('Unique keys', comparison.uniqueKeys1, comparison.uniqueKeys2, comparison.uniqueKeysDiff),
          ]}
        />
      </Card>

      <Card flush>
        <Table
          aria-label="Tag comparison"
          // Both traces are already resolved before this renders.
          state={rows.length ? 'ready' : 'empty'}
          columns={columns}
          rows={rows}
          getRowKey={(r, i) => String(r.key ?? i)}
          emptyState={<EmptyState inline title="No tags to compare" />}
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
