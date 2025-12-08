import React from 'react'
import { FiGlobe } from 'react-icons/fi'
import { formatPercentageDiff } from '../../utils/comparisonUtils'
import './ComparisonTable.css'

function formatDuration(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
  if (ms < 1000) return `${ms.toFixed(2)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatBytes(bytes) {
  if (bytes === 0) return '0B'
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
}

function HttpComparisonTable({ comparison }) {
  if (!comparison || !comparison.comparison || comparison.comparison.length === 0) {
    return (
      <div className="comparison-empty">
        <FiGlobe className="empty-icon" />
        <p>No HTTP requests to compare</p>
      </div>
    )
  }
  
  return (
    <div className="comparison-table-container">
      <div className="comparison-summary">
        <div className="summary-item">
          <span className="summary-label">Total Requests:</span>
          <span className="summary-value">
            {comparison.total1} → {comparison.total2}
            <span className={`summary-diff ${comparison.totalDiff.changeType}`}>
              ({formatPercentageDiff(comparison.totalDiff.diff)})
            </span>
          </span>
        </div>
      </div>
      
      <div className="comparison-table-wrapper">
        <table className="comparison-table">
          <thead>
            <tr>
              <th>URL</th>
              <th>Trace 1</th>
              <th>Trace 2</th>
              <th>Difference</th>
            </tr>
          </thead>
          <tbody>
            {comparison.comparison.map((item, idx) => (
              <tr key={idx} className={item.existsInBoth ? '' : 'new-or-removed'}>
                <td className="url-cell">
                  <code className="url-text">{item.url}</code>
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
                    <div className="value-item">
                      <span className="value-label">Sent:</span>
                      <span className="value-number">{formatBytes(item.bytesSent1)}</span>
                    </div>
                    <div className="value-item">
                      <span className="value-label">Received:</span>
                      <span className="value-number">{formatBytes(item.bytesReceived1)}</span>
                    </div>
                    {Object.keys(item.statusCodes1).length > 0 && (
                      <div className="value-item">
                        <span className="value-label">Status Codes:</span>
                        <div className="status-codes">
                          {Object.entries(item.statusCodes1).map(([code, count]) => (
                            <span key={code} className={`status-badge ${code >= 400 ? 'error' : code >= 300 ? 'warning' : 'ok'}`}>
                              {code}: {count}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
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
                    <div className="value-item">
                      <span className="value-label">Sent:</span>
                      <span className="value-number">{formatBytes(item.bytesSent2)}</span>
                    </div>
                    <div className="value-item">
                      <span className="value-label">Received:</span>
                      <span className="value-number">{formatBytes(item.bytesReceived2)}</span>
                    </div>
                    {Object.keys(item.statusCodes2).length > 0 && (
                      <div className="value-item">
                        <span className="value-label">Status Codes:</span>
                        <div className="status-codes">
                          {Object.entries(item.statusCodes2).map(([code, count]) => (
                            <span key={code} className={`status-badge ${code >= 400 ? 'error' : code >= 300 ? 'warning' : 'ok'}`}>
                              {code}: {count}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
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
                    <div className={`diff-item ${item.bytesSentDiff.changeType}`}>
                      <span className="diff-label">Sent:</span>
                      <span className="diff-value">{formatPercentageDiff(item.bytesSentDiff.diff)}</span>
                    </div>
                    <div className={`diff-item ${item.bytesReceivedDiff.changeType}`}>
                      <span className="diff-label">Received:</span>
                      <span className="diff-value">{formatPercentageDiff(item.bytesReceivedDiff.diff)}</span>
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

export default HttpComparisonTable

