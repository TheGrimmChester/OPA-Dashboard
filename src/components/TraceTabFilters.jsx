import React, { useState } from 'react'
import { FiFilter } from 'react-icons/fi'
import HelpIcon from './HelpIcon'
import './TraceTabFilters.css'

const DEFAULT_THRESHOLDS = {
  duration: 10, // ms
  memory: 0.1, // bytes
  network: 0, // bytes (0 - no filter by default)
  cpu: 0.1, // ms
}

function TraceTabFilters({ 
  onFiltersChange, 
  availableFilters = ['duration', 'memory', 'network', 'cpu'],
  initialThresholds = {}
}) {
  const [thresholds, setThresholds] = useState({
    ...DEFAULT_THRESHOLDS,
    ...initialThresholds
  })

  const handleThresholdChange = (filter, value) => {
    const numValue = parseFloat(value) || 0
    const newThresholds = {
      ...thresholds,
      [filter]: numValue
    }
    setThresholds(newThresholds)
    if (onFiltersChange) {
      onFiltersChange({
        enabled: true,
        thresholds: newThresholds
      })
    }
  }

  const handleReset = () => {
    const resetThresholds = {
      ...DEFAULT_THRESHOLDS,
      ...initialThresholds
    }
    setThresholds(resetThresholds)
    if (onFiltersChange) {
      onFiltersChange({
        enabled: true,
        thresholds: resetThresholds
      })
    }
  }

  // Initialize filters on mount
  React.useEffect(() => {
    if (onFiltersChange) {
      onFiltersChange({
        enabled: true,
        thresholds: {
          ...DEFAULT_THRESHOLDS,
          ...initialThresholds
        }
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const formatValue = (filter, value) => {
    switch (filter) {
      case 'duration':
      case 'cpu':
        return `${value} ms`
      case 'memory':
      case 'network':
        if (value < 1024) return `${value} B`
        if (value < 1024 * 1024) return `${(value / 1024).toFixed(2)} KB`
        return `${(value / (1024 * 1024)).toFixed(2)} MB`
      default:
        return value
    }
  }

  return (
    <div className="trace-tab-filters">
      <div className="trace-tab-filters-header">
        <div className="filter-label">
          <FiFilter />
          <span>Filters</span>
          <HelpIcon text="Filter items by duration, memory, network, or CPU thresholds. Only items meeting the thresholds will be displayed." position="right" />
        </div>
      </div>
      <div className="trace-tab-filters-content">
          <div className="filter-controls">
            {availableFilters.includes('duration') && (
              <div className="filter-control">
                <label htmlFor="filter-duration">
                  Duration (ms)
                </label>
                <input
                  id="filter-duration"
                  type="number"
                  min="0"
                  step="0.1"
                  value={thresholds.duration}
                  onChange={(e) => handleThresholdChange('duration', e.target.value)}
                />
                <span className="filter-value">{formatValue('duration', thresholds.duration)}</span>
              </div>
            )}
            {availableFilters.includes('memory') && (
              <div className="filter-control">
                <label htmlFor="filter-memory">
                  Memory (bytes)
                </label>
                <input
                  id="filter-memory"
                  type="number"
                  min="0"
                  step="1"
                  value={thresholds.memory}
                  onChange={(e) => handleThresholdChange('memory', e.target.value)}
                />
                <span className="filter-value">{formatValue('memory', thresholds.memory)}</span>
              </div>
            )}
            {availableFilters.includes('network') && (
              <div className="filter-control">
                <label htmlFor="filter-network">
                  Network (bytes)
                </label>
                <input
                  id="filter-network"
                  type="number"
                  min="0"
                  step="1"
                  value={thresholds.network}
                  onChange={(e) => handleThresholdChange('network', e.target.value)}
                />
                <span className="filter-value">{formatValue('network', thresholds.network)}</span>
              </div>
            )}
            {availableFilters.includes('cpu') && (
              <div className="filter-control">
                <label htmlFor="filter-cpu">
                  CPU (ms)
                </label>
                <input
                  id="filter-cpu"
                  type="number"
                  min="0"
                  step="0.01"
                  value={thresholds.cpu}
                  onChange={(e) => handleThresholdChange('cpu', e.target.value)}
                />
                <span className="filter-value">{formatValue('cpu', thresholds.cpu)}</span>
              </div>
            )}
          </div>
          <div className="filter-actions">
            <button className="filter-reset-btn" onClick={handleReset}>
              Reset to Defaults
            </button>
          </div>
      </div>
    </div>
  )
}

export default TraceTabFilters

