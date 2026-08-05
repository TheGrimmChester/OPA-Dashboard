import React, { useState } from 'react'
import { FiFilter, FiRotateCcw } from 'react-icons/fi'
import { Button, Field, Input } from '@open-family/ui'
import HelpIcon from './HelpIcon'
import './TraceTabFilters.css'

const DEFAULT_THRESHOLDS = {
  duration: 0, // ms
  memory: 0, // bytes
  network: 0, // bytes
  cpu: 0, // ms
}

// One row per threshold: the id, the visible label and the input granularity.
// Declaring them keeps the four controls identical instead of four near-copies
// that drift a step or a label apart.
const FILTER_FIELDS = [
  { key: 'duration', label: 'Duration (ms)', step: '0.1' },
  { key: 'memory', label: 'Memory (bytes)', step: '1' },
  { key: 'network', label: 'Network (bytes)', step: '1' },
  { key: 'cpu', label: 'CPU (ms)', step: '0.01' },
]

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
          <FiFilter aria-hidden="true" />
          <span>Filters</span>
          <HelpIcon text="Filter items by duration, memory, network, or CPU thresholds. Only items meeting the thresholds will be displayed." position="right" />
        </div>
      </div>
      <div className="trace-tab-filters-content">
          <div className="filter-controls">
            {FILTER_FIELDS.filter((f) => availableFilters.includes(f.key)).map((f) => (
              <Field
                key={f.key}
                label={f.label}
                htmlFor={`filter-${f.key}`}
                hint={formatValue(f.key, thresholds[f.key])}
              >
                <Input
                  id={`filter-${f.key}`}
                  type="number"
                  min="0"
                  step={f.step}
                  value={thresholds[f.key]}
                  onChange={(e) => handleThresholdChange(f.key, e.target.value)}
                />
              </Field>
            ))}
          </div>
          <div className="filter-actions">
            <Button size="sm" icon={<FiRotateCcw />} onClick={handleReset}>
              Reset to defaults
            </Button>
          </div>
      </div>
    </div>
  )
}

export default TraceTabFilters
