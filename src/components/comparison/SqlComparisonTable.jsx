import React from 'react'
import { FiDatabase } from 'react-icons/fi'
import { formatPercentageDiff } from '../../utils/comparisonUtils'
import './ComparisonTable.css'

function formatDuration(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
  if (ms < 1000) return `${ms.toFixed(2)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function SqlComparisonTable({ comparison }) {
  if (!comparison || !comparison.comparison || comparison.comparison.length === 0) {
    return (
      <div className="comparison-empty">
        <FiDatabase className="empty-icon" />
        <p>No SQL queries to compare</p>
      </div>
    )
  }
  
  return (
    <div className="comparison-table-container">
      <div className="comparison-summary">
        <div className="summary-item">
          <span className="summary-label">Total Queries:</span>
          <span className="summary-value">
            {comparison.total1} → {comparison.total2}
            <span className={`summary-diff ${comparison.totalDiff.changeType}`}>
              ({formatPercentageDiff(comparison.totalDiff.diff)})
            </span>
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Unique Queries:</span>
          <span className="summary-value">
            {comparison.unique1} → {comparison.unique2}
            <span className={`summary-diff ${comparison.uniqueDiff.changeType}`}>
              ({formatPercentageDiff(comparison.uniqueDiff.diff)})
            </span>
          </span>
        </div>
      </div>
      
      <div className="comparison-table-wrapper">
        <table className="comparison-table">
          <thead>
            <tr>
              <th>Query</th>
              <th>Trace 1</th>
              <th>Trace 2</th>
              <th>Difference</th>
            </tr>
          </thead>
          <tbody>
            {comparison.comparison.map((item, idx) => (
              <tr key={idx} className={item.existsInBoth ? '' : 'new-or-removed'}>
                <td className="query-cell">
                  <code className="query-text">{item.queryText}</code>
                </td>
                <td className="value-cell">
                  <div className="value-group">
                    <div className="value-item">
                      <span className="value-label">Count:</span>
                      <span className="value-number">{item.count1}</span>
                    </div>
                    <div className="value-item">
                      <span className="value-label">Duration:</span>
                      <span className="value-number">{formatDuration(item.duration1)}</span>
                    </div>
                  </div>
                </td>
                <td className="value-cell">
                  <div className="value-group">
                    <div className="value-item">
                      <span className="value-label">Count:</span>
                      <span className="value-number">{item.count2}</span>
                    </div>
                    <div className="value-item">
                      <span className="value-label">Duration:</span>
                      <span className="value-number">{formatDuration(item.duration2)}</span>
                    </div>
                  </div>
                </td>
                <td className="diff-cell">
                  <div className="diff-group">
                    <div className={`diff-item ${item.countDiff.changeType}`}>
                      <span className="diff-label">Count:</span>
                      <span className="diff-value">{formatPercentageDiff(item.countDiff.diff)}</span>
                    </div>
                    <div className={`diff-item ${item.durationDiff.changeType}`}>
                      <span className="diff-label">Duration:</span>
                      <span className="diff-value">{formatPercentageDiff(item.durationDiff.diff)}</span>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default SqlComparisonTable

