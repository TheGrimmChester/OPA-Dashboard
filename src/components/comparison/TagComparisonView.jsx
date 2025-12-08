import React from 'react'
import { FiTag } from 'react-icons/fi'
import { formatPercentageDiff } from '../../utils/comparisonUtils'
import './ComparisonTable.css'

function TagComparisonView({ comparison }) {
  if (!comparison || !comparison.comparison || comparison.comparison.length === 0) {
    return (
      <div className="comparison-empty">
        <FiTag className="empty-icon" />
        <p>No tags to compare</p>
      </div>
    )
  }
  
  return (
    <div className="comparison-table-container">
      <div className="comparison-summary">
        <div className="summary-item">
          <span className="summary-label">Total Tag Items:</span>
          <span className="summary-value">
            {comparison.total1} → {comparison.total2}
            <span className={`summary-diff ${comparison.totalDiff.changeType}`}>
              ({formatPercentageDiff(comparison.totalDiff.diff)})
            </span>
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Unique Keys:</span>
          <span className="summary-value">
            {comparison.uniqueKeys1} → {comparison.uniqueKeys2}
            <span className={`summary-diff ${comparison.uniqueKeysDiff.changeType}`}>
              ({formatPercentageDiff(comparison.uniqueKeysDiff.diff)})
            </span>
          </span>
        </div>
      </div>
      
      <div className="comparison-table-wrapper">
        <table className="comparison-table">
          <thead>
            <tr>
              <th>Tag Key</th>
              <th>Trace 1 Values</th>
              <th>Trace 2 Values</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {comparison.comparison.map((item, idx) => (
              <tr key={idx} className={item.existsInBoth ? '' : 'new-or-removed'}>
                <td className="tag-key-cell">
                  <code>{item.key}</code>
                </td>
                <td className="tag-values-cell">
                  {item.values1.length > 0 ? (
                    <div className="tag-values">
                      {item.values1.map((val, vIdx) => (
                        <span key={vIdx} className="tag-value">{String(val)}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="tag-empty">—</span>
                  )}
                </td>
                <td className="tag-values-cell">
                  {item.values2.length > 0 ? (
                    <div className="tag-values">
                      {item.values2.map((val, vIdx) => (
                        <span key={vIdx} className="tag-value">{String(val)}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="tag-empty">—</span>
                  )}
                </td>
                <td className="tag-status-cell">
                  {item.isEqual ? (
                    <span className="tag-status equal">Equal</span>
                  ) : item.existsInBoth ? (
                    <span className="tag-status different">Different</span>
                  ) : item.values1.length > 0 ? (
                    <span className="tag-status removed">Removed</span>
                  ) : (
                    <span className="tag-status added">Added</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default TagComparisonView

