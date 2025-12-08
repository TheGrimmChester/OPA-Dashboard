import React, { useState } from 'react'
import axios from 'axios'
import './TraceSearch.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function TraceSearch({ onTraceSelect }) {
  const [traceId, setTraceId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [trace, setTrace] = useState(null)

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!traceId.trim()) return

    setLoading(true)
    setError(null)
    setTrace(null)

    try {
      const response = await axios.get(`${API_URL}/api/traces/${traceId}`)
      setTrace(response.data)
      onTraceSelect(response.data)
    } catch (err) {
      setError(err.response?.status === 404 
        ? 'Trace not found' 
        : 'Error fetching trace')
      console.error('Search error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="TraceSearch">
      <form onSubmit={handleSearch} className="search-form">
        <input
          type="text"
          value={traceId}
          onChange={(e) => setTraceId(e.target.value)}
          placeholder="Enter trace ID"
          className="search-input"
        />
        <button type="submit" disabled={loading} className="search-button">
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {trace && (
        <div className="trace-info">
          <h2>Trace: {trace.trace_id}</h2>
          <p>Spans: {trace.spans?.length || 0}</p>
          {trace.root && (
            <div className="root-span">
              <strong>Root:</strong> {trace.root.name} 
              ({trace.root.duration_ms}ms)
            </div>
          )}
          <div className="spans-list">
            <h3>Spans:</h3>
            {trace.spans?.map((span, idx) => (
              <div key={idx} className="span-item">
                <div className="span-name">{span.name}</div>
                <div className="span-details">
                  <span>Service: {span.service}</span>
                  <span>Duration: {span.duration_ms}ms</span>
                  <span>Status: {span.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default TraceSearch

