import React from 'react'
import { FiTrendingUp, FiTrendingDown, FiMinus } from 'react-icons/fi'
import { formatPercentageDiff, getChangeType } from '../../utils/comparisonUtils'
import './MetricComparisonCard.css'

function MetricComparisonCard({ label, value1, value2, diff, unit = '', formatValue = (v) => v, icon: Icon }) {
  const changeType = getChangeType(diff, 5)
  
  const getChangeIcon = () => {
    switch (changeType) {
      case 'improvement':
        return <FiTrendingDown className="change-icon improvement" />
      case 'degradation':
        return <FiTrendingUp className="change-icon degradation" />
      default:
        return <FiMinus className="change-icon no-change" />
    }
  }
  
  const getChangeClass = () => {
    return `metric-change ${changeType}`
  }
  
  return (
    <div className="metric-comparison-card">
      <div className="metric-header">
        {Icon && <Icon className="metric-icon" />}
        <h3 className="metric-label">{label}</h3>
      </div>
      <div className="metric-values">
        <div className="metric-value-group">
          <div className="metric-value-label">Trace 1</div>
          <div className="metric-value">{formatValue(value1)}{unit}</div>
        </div>
        <div className="metric-value-group">
          <div className="metric-value-label">Trace 2</div>
          <div className="metric-value">{formatValue(value2)}{unit}</div>
        </div>
      </div>
      <div className="metric-footer">
        <div className={getChangeClass()}>
          {getChangeIcon()}
          <span className="change-value">{formatPercentageDiff(diff)}</span>
        </div>
      </div>
    </div>
  )
}

export default MetricComparisonCard

