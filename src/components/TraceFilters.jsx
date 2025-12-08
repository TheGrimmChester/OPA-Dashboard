import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import axios from 'axios'
import HelpIcon from './HelpIcon'
import './TraceFilters.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function TraceFilters({ onFiltersChange }) {
  const [searchParams, setSearchParams] = useSearchParams()
  
  const [service, setService] = useState(searchParams.get('service') || '')
  const [status, setStatus] = useState(searchParams.get('status') || 'all')
  const [language, setLanguage] = useState(searchParams.get('language') || '')
  const [framework, setFramework] = useState(searchParams.get('framework') || '')
  const [version, setVersion] = useState(searchParams.get('version') || '')
  const [timeRange, setTimeRange] = useState(searchParams.get('timeRange') || '24h')
  const [minDuration, setMinDuration] = useState(searchParams.get('minDuration') || '')
  const [maxDuration, setMaxDuration] = useState(searchParams.get('maxDuration') || '')
  const [traceId, setTraceId] = useState(searchParams.get('traceId') || '')
  const [scheme, setScheme] = useState(searchParams.get('scheme') || '')
  const [host, setHost] = useState(searchParams.get('host') || '')
  const [uri, setUri] = useState(searchParams.get('uri') || '')
  const [queryString, setQueryString] = useState(searchParams.get('queryString') || '')
  const [services, setServices] = useState([])
  const [languages, setLanguages] = useState([])
  const [frameworks, setFrameworks] = useState([])

  useEffect(() => {
    // Fetch available services
    axios.get(`${API_URL}/api/services`)
      .then(res => {
        const serviceNames = (res.data.services || []).map(s => s.service)
        setServices(serviceNames)
      })
      .catch(err => console.error('Error fetching services:', err))
    
    // Fetch available languages
    axios.get(`${API_URL}/api/languages`)
      .then(res => {
        const langList = (res.data.languages || []).map(l => l.language)
        setLanguages(langList)
      })
      .catch(err => console.error('Error fetching languages:', err))
  }, [])

  useEffect(() => {
    // Fetch frameworks when language changes
    if (language) {
      axios.get(`${API_URL}/api/frameworks?language=${encodeURIComponent(language)}`)
        .then(res => {
          const fwList = (res.data.frameworks || []).map(f => f.framework)
          setFrameworks(fwList)
        })
        .catch(err => console.error('Error fetching frameworks:', err))
    } else {
      setFrameworks([])
      setFramework('')
    }
  }, [language])

  // Sync filter state to URL params
  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    
    if (service) params.set('service', service)
    else params.delete('service')
    
    if (status && status !== 'all') params.set('status', status)
    else params.delete('status')
    
    if (language) params.set('language', language)
    else params.delete('language')
    
    if (framework) params.set('framework', framework)
    else params.delete('framework')
    
    if (version) params.set('version', version)
    else params.delete('version')
    
    if (timeRange && timeRange !== '24h') params.set('timeRange', timeRange)
    else params.delete('timeRange')
    
    if (minDuration) params.set('minDuration', minDuration)
    else params.delete('minDuration')
    
    if (maxDuration) params.set('maxDuration', maxDuration)
    else params.delete('maxDuration')
    
    if (traceId) params.set('traceId', traceId)
    else params.delete('traceId')
    
    setSearchParams(params, { replace: true })
  }, [service, status, language, framework, version, timeRange, minDuration, maxDuration, traceId, searchParams, setSearchParams])

  // Calculate and pass filters to parent
  useEffect(() => {
    const filters = {}
    
    if (service) filters.service = service
    if (status && status !== 'all') filters.status = status
    if (language) filters.language = language
    if (framework) filters.framework = framework
    if (version) filters.version = version
    
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
      default:
        fromDate.setHours(now.getHours() - 24)
    }
    filters.from = fromDate.toISOString().slice(0, 19).replace('T', ' ')
    
    if (minDuration) filters.min_duration = minDuration
    if (maxDuration) filters.max_duration = maxDuration
    if (traceId) filters.trace_id = traceId
    if (scheme) filters.scheme = scheme
    if (host) filters.host = host
    if (uri) filters.uri = uri
    if (queryString) filters.query_string = queryString
    
    onFiltersChange(filters)
  }, [service, status, language, framework, version, timeRange, minDuration, maxDuration, traceId, scheme, host, uri, queryString, onFiltersChange])

  const handleClear = () => {
    setService('')
    setStatus('all')
    setLanguage('')
    setFramework('')
    setVersion('')
    setTimeRange('24h')
    setMinDuration('')
    setMaxDuration('')
    setTraceId('')
    setScheme('')
    setHost('')
    setUri('')
    setQueryString('')
  }

  return (
    <div className="TraceFilters">
      <div className="filters-header">
        <h3>Filters <HelpIcon text="Filter traces by service, status, time range, duration, and other criteria" position="right" /></h3>
        <button onClick={handleClear} className="clear-button">Clear All</button>
      </div>
      
      <div className="filters-grid">
        <div className="filter-group">
          <label>Service</label>
          <select 
            value={service} 
            onChange={(e) => setService(e.target.value)}
            className="filter-select"
          >
            <option value="">All Services</option>
            {services.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Status</label>
          <select 
            value={status} 
            onChange={(e) => setStatus(e.target.value)}
            className="filter-select"
          >
            <option value="all">All</option>
            <option value="ok">OK</option>
            <option value="error">Error</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Language</label>
          <select 
            value={language} 
            onChange={(e) => setLanguage(e.target.value)}
            className="filter-select"
          >
            <option value="">All Languages</option>
            {languages.map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Framework</label>
          <select 
            value={framework} 
            onChange={(e) => setFramework(e.target.value)}
            className="filter-select"
            disabled={!language}
          >
            <option value="">All Frameworks</option>
            {frameworks.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Version</label>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="Language version"
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <label>Time Range</label>
          <select 
            value={timeRange} 
            onChange={(e) => setTimeRange(e.target.value)}
            className="filter-select"
          >
            <option value="1h">Last Hour</option>
            <option value="6h">Last 6 Hours</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Min Duration (ms)</label>
          <input
            type="number"
            value={minDuration}
            onChange={(e) => setMinDuration(e.target.value)}
            placeholder="0"
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <label>Max Duration (ms)</label>
          <input
            type="number"
            value={maxDuration}
            onChange={(e) => setMaxDuration(e.target.value)}
            placeholder="∞"
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <label>Trace ID (optional)</label>
          <input
            type="text"
            value={traceId}
            onChange={(e) => setTraceId(e.target.value)}
            placeholder="Search by trace ID"
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <label>Scheme</label>
          <select 
            value={scheme} 
            onChange={(e) => setScheme(e.target.value)}
            className="filter-select"
          >
            <option value="">All</option>
            <option value="http">HTTP</option>
            <option value="https">HTTPS</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Host</label>
          <input
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="Filter by host"
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <label>URI</label>
          <input
            type="text"
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            placeholder="Filter by URI path"
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <label>Query String</label>
          <input
            type="text"
            value={queryString}
            onChange={(e) => setQueryString(e.target.value)}
            placeholder="Filter by query parameters"
            className="filter-input"
          />
        </div>
      </div>
    </div>
  )
}

export default TraceFilters

