import React from 'react'
import './TimeRangePicker.css'

function TimeRangePicker({ value, onChange, options = null }) {
  const defaultOptions = [
    { value: '1h', label: 'Last Hour' },
    { value: '6h', label: 'Last 6 Hours' },
    { value: '24h', label: 'Last 24 Hours' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: 'custom', label: 'Custom Range' },
  ]

  const timeOptions = options || defaultOptions

  return (
    <div className="time-range-picker">
      <select 
        value={value} 
        onChange={(e) => onChange(e.target.value)}
        className="time-range-select"
      >
        {timeOptions.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export default TimeRangePicker

