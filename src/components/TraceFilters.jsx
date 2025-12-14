import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FiChevronDown, FiChevronUp } from 'react-icons/fi'
import FilterBuilder from './FilterBuilder'
import TimeRangePicker from './TimeRangePicker'
import HelpIcon from './HelpIcon'
import './TraceFilters.css'

function TraceFilters({ onFiltersChange }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [isCollapsed, setIsCollapsed] = useState(true)
  
  const filterQuery = searchParams.get('filter') || ''
  const [filter, setFilter] = useState(filterQuery)
  const [timeRange, setTimeRange] = useState(searchParams.get('timeRange') || '24h')

  // Sync filter state to URL params
  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    
    if (filter) params.set('filter', filter)
    else params.delete('filter')
    
    if (timeRange && timeRange !== '24h') params.set('timeRange', timeRange)
    else params.delete('timeRange')
    
    setSearchParams(params, { replace: true })
  }, [filter, timeRange, searchParams, setSearchParams])

  // Calculate and pass filters to parent
  useEffect(() => {
    const filters = {}
    
    // Pass filter query string
    if (filter) filters.filter = filter
    
    // Calculate time range
    const now = new Date()
    let fromDate = new Date()
    switch (timeRange) {
      case '1h':
        fromDate.setHours(now.getHours() - 1)
        break
      case '6h':
        fromDate.setHours(now.getHours() - 6)
        break
      case '24h':
        fromDate.setHours(now.getHours() - 24)
        break
      case '7d':
        fromDate.setDate(now.getDate() - 7)
        break
      case '30d':
        fromDate.setDate(now.getDate() - 30)
        break
      default:
        fromDate.setHours(now.getHours() - 24)
    }
    filters.from = fromDate.toISOString().slice(0, 19).replace('T', ' ')
    
    onFiltersChange(filters)
  }, [filter, timeRange, onFiltersChange])

  const handleClear = () => {
    setFilter('')
    setTimeRange('24h')
  }

  return (
    <div className="TraceFilters">
      <div className="filters-header">
        <div className="filters-header-left">
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)} 
            className="collapse-button"
            aria-label={isCollapsed ? 'Expand filters' : 'Collapse filters'}
          >
            {isCollapsed ? <FiChevronDown /> : <FiChevronUp />}
          </button>
          <h3>Filters <HelpIcon text="Filter traces by service, status, time range, duration, and other criteria" position="right" /></h3>
        </div>
        <button onClick={handleClear} className="clear-button">Clear All</button>
      </div>
      
      {!isCollapsed && (
      <div className="filters-content">
        <div className="trace-filters-main">
          <div className="filter-group">
            <label>Time Range:</label>
            <TimeRangePicker value={timeRange} onChange={setTimeRange} />
          </div>
          <div className="filter-group filter-group-full">
            <label>Filter:</label>
            <FilterBuilder
              value={filter}
              onChange={setFilter}
              placeholder="e.g., service:api, status:error, duration_ms:>1000, tags.http_request.scheme:https, (service:api AND duration_ms:>500)"
            />
          </div>
        </div>
        <div className="filter-help-text">
          <HelpIcon text="Filter examples: service:api, status:error, language:php, framework:symfony, duration_ms:>1000, duration_ms:<5000, trace_id:abc123, tags.http_request.host:example.com, tags.http_request.uri:/api/users" position="right" />
        </div>
      </div>
      )}
    </div>
  )
}

export default TraceFilters

