import React from 'react'
import { Select } from '@open-family/ui'
import './TimeRangePicker.css'

const DEFAULT_OPTIONS = [
  { value: '1h', label: 'Last hour' },
  { value: '6h', label: 'Last 6 hours' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
]

/**
 * Time-range select for the shell. The callback contract is unchanged: `onChange`
 * still receives the bare option value, not the DOM event.
 */
function TimeRangePicker({ value, onChange, options = null }) {
  const timeOptions = options || DEFAULT_OPTIONS

  return (
    <span className="opa-timerange">
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={timeOptions}
        aria-label="Time range"
      />
    </span>
  )
}

export default TimeRangePicker
