import React from 'react'
import ComparisonTable, { summaryItem } from './ComparisonTable'
import { fmtMs, fmtPct } from '../../theme/format'

/** Cache operations, side by side across two traces. */
export default function CacheComparisonTable({ comparison }) {
  return (
    <ComparisonTable
      comparison={comparison}
      label="Cache operation comparison"
      emptyTitle="No cache operations to compare"
      emptyDescription="Neither trace recorded a cache operation, so there is nothing to line up."
      summary={[
        summaryItem('Total operations', comparison?.total1, comparison?.total2, comparison?.totalDiff),
        summaryItem('Hit rate', fmtPct(comparison?.hitRate1), fmtPct(comparison?.hitRate2), comparison?.hitRateDiff, false),
      ]}
      identity={{
        header: 'Operation type',
        render: (r) => <span className="oui-mono">{r.type}</span>,
      }}
      metrics={[
        { key: 'count', label: 'Count', left: (r) => r.count1, right: (r) => r.count2, change: (r) => r.countDiff },
        { key: 'duration', label: 'Duration', left: (r) => fmtMs(r.duration1), right: (r) => fmtMs(r.duration2), change: (r) => r.durationDiff },
        { key: 'hits', label: 'Hits', left: (r) => r.hits1, right: (r) => r.hits2, change: (r) => r.hitsDiff, lowerIsBetter: false },
        { key: 'misses', label: 'Misses', left: (r) => r.misses1, right: (r) => r.misses2, change: (r) => r.missesDiff },
      ]}
    />
  )
}
