import React from 'react'
import ComparisonTable, { summaryItem } from './ComparisonTable'
import { fmtMs } from '../../theme/format'

/** SQL queries, side by side across two traces. */
export default function SqlComparisonTable({ comparison }) {
  return (
    <ComparisonTable
      comparison={comparison}
      label="SQL query comparison"
      emptyTitle="No SQL queries to compare"
      emptyDescription="Neither trace recorded a database query, so there is nothing to line up."
      summary={[
        summaryItem('Total queries', comparison?.total1, comparison?.total2, comparison?.totalDiff),
        summaryItem('Unique queries', comparison?.unique1, comparison?.unique2, comparison?.uniqueDiff),
      ]}
      identity={{
        header: 'Query',
        mono: true,
        render: (r) => <code className="oui-mono opa-cmp-query">{r.queryText}</code>,
      }}
      metrics={[
        { key: 'count', label: 'Count', left: (r) => r.count1, right: (r) => r.count2, change: (r) => r.countDiff },
        { key: 'duration', label: 'Duration', left: (r) => fmtMs(r.duration1), right: (r) => fmtMs(r.duration2), change: (r) => r.durationDiff },
      ]}
    />
  )
}
