import React from 'react'
import { Badge } from '@open-family/ui'
import ComparisonTable, { summaryItem } from './ComparisonTable'
import { fmtMs, fmtBytes } from '../../theme/format'

/** Status codes as badges. The tone follows the class, and the code is the label. */
function StatusCodes({ codes }) {
  const entries = Object.entries(codes || {})
  if (entries.length === 0) return <span className="oui-text-muted">—</span>
  return (
    <span className="oui-row opa-cmp-codes">
      {entries.map(([code, count]) => (
        <Badge
          key={code}
          tone={Number(code) >= 500 ? 'critical' : Number(code) >= 400 ? 'serious' : Number(code) >= 300 ? 'warning' : 'good'}
        >
          {`${code} × ${count}`}
        </Badge>
      ))}
    </span>
  )
}

/** External HTTP requests, side by side across two traces. */
export default function HttpComparisonTable({ comparison }) {
  return (
    <ComparisonTable
      comparison={comparison}
      label="HTTP request comparison"
      emptyTitle="No HTTP requests to compare"
      emptyDescription="Neither trace recorded an outbound HTTP request, so there is nothing to line up."
      summary={[
        summaryItem('Total requests', comparison?.total1, comparison?.total2, comparison?.totalDiff),
      ]}
      identity={{
        header: 'URL',
        mono: true,
        render: (r) => <code className="oui-mono opa-cmp-query">{r.url}</code>,
      }}
      metrics={[
        { key: 'count', label: 'Count', left: (r) => r.count1, right: (r) => r.count2, change: (r) => r.countDiff },
        { key: 'duration', label: 'Duration', left: (r) => fmtMs(r.duration1), right: (r) => fmtMs(r.duration2), change: (r) => r.durationDiff },
        { key: 'sent', label: 'Sent', left: (r) => fmtBytes(r.bytesSent1), right: (r) => fmtBytes(r.bytesSent2), change: (r) => r.bytesSentDiff },
        { key: 'received', label: 'Received', left: (r) => fmtBytes(r.bytesReceived1), right: (r) => fmtBytes(r.bytesReceived2), change: (r) => r.bytesReceivedDiff },
      ]}
      extraColumns={[
        {
          key: 'codes',
          header: 'Status codes',
          render: (r) => (
            <span className="oui-stack">
              <StatusCodes codes={r.statusCodes1} />
              <StatusCodes codes={r.statusCodes2} />
            </span>
          ),
        },
      ]}
    />
  )
}
