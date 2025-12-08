import React from 'react'
import './ApdexScore.css'

function ApdexScore({ score }) {
  const getScoreColor = (score) => {
    if (score >= 0.94) return '#4caf50' // Excellent
    if (score >= 0.85) return '#8bc34a' // Good
    if (score >= 0.70) return '#ff9800' // Fair
    return '#f44336' // Poor
  }

  const getScoreLabel = (score) => {
    if (score >= 0.94) return 'Excellent'
    if (score >= 0.85) return 'Good'
    if (score >= 0.70) return 'Fair'
    return 'Poor'
  }

  const color = getScoreColor(score)
  const label = getScoreLabel(score)

  return (
    <div className="apdex-score">
      <div className="apdex-value" style={{ color }}>
        {score.toFixed(3)}
      </div>
      <div className="apdex-label" style={{ color }}>
        {label}
      </div>
    </div>
  )
}

export default ApdexScore

