import React from 'react'
import { FiHardDrive } from 'react-icons/fi'
import { formatPercentageDiff } from '../../utils/comparisonUtils'
import './ComparisonTable.css'

function formatDuration(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
  if (ms < 1000) return `${ms.toFixed(2)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function RedisComparisonTable({ comparison }) {
  if (!comparison || !comparison.comparison || comparison.comparison.length === 0) {
    return (
      <div className="comparison-empty">
        <FiHardDrive className="empty-icon" />
        <p>No Redis operations to compare</p>
      </div>
    )
  }
  
  return (
    <div className="comparison-table-container">
      <div className="comparison-summary">
        <div className="summary-item">
          <span className="summary-label">Total Operations:</span>
          <span className="summary-value">
            {comparison.total1} → {comparison.total2}
            <span className={`summary-diff ${comparison.totalDiff.changeType}`}>
              ({formatPercentageDiff(comparison.totalDiff.diff)})
            </span>
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Hit Rate:</span>
          <span className="summary-value">
            {comparison.hitRate1.toFixed(1)}% → {comparison.hitRate2.toFixed(1)}%
            <span className={`summary-diff ${comparison.hitRateDiff.changeType}`}>
              ({formatPercentageDiff(comparison.hitRateDiff.diff)})
            </span>
          </span>
        </div>
      </div>
      
      <div className="comparison-table-wrapper">
        <table className="comparison-table">
          <thead>
            <tr>
              <th>Command</th>
              <th>Trace 1</th>
              <th>Trace 2</th>
              <th>Difference</th>
            </tr>
          </thead>
          <tbody>
            {comparison.comparison.map((item, idx) => (
              <tr key={idx} className={item.existsInBoth ? '' : 'new-or-removed'}>
                <td className="type-cell">
                  <code>{item.command}</code>
                </td>
                <td className="value-cell">
                  <div className="value-group">
                    <div className="value-item">
                      <span className="value-label">Count:</span>
                      <span className="value-number">{item.count1}</span>
                    </div>
                    <div className="value-item">
                      <span className="value-label">Hits:</span>
                      <span className="value-number">{item.hits1}</span>
                    </div>
                    <div className="value-item">
                      <span className="value-label">Misses:</span>
                      <span className="value-number">{item.misses1}</span>
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
                      <span className="value-label">Hits:</span>
                      <span className="value-number">{item.hits2}</span>
                    </div>
                    <div className="value-item">
                      <span className="value-label">Misses:</span>
                      <span className="value-number">{item.misses2}</span>
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
                    <div className={`diff-item ${item.hitsDiff.changeType}`}>
                      <span className="diff-label">Hits:</span>
                      <span className="diff-value">{formatPercentageDiff(item.hitsDiff.diff)}</span>
                    </div>
                    <div className={`diff-item ${item.missesDiff.changeType}`}>
                      <span className="diff-label">Misses:</span>
                      <span className="diff-value">{formatPercentageDiff(item.missesDiff.diff)}</span>
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

export default RedisComparisonTable

