import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { 
  FiTerminal, 
  FiServer,
  FiActivity,
  FiLink,
  FiExternalLink
} from 'react-icons/fi'
import './LiveDumpsMini.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function formatTimestamp(timestamp) {
  if (!timestamp) return 'N/A'
  const date = new Date(timestamp)
  return date.toLocaleTimeString()
}

function LiveDumpsMini({ isPaused, onRefresh }) {
  const [dumps, setDumps] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchDumps = useCallback(async () => {
    if (isPaused) return
    
    try {
      setLoading(true)
      setError(null)
      
      const params = new URLSearchParams({
        limit: '10',
        all: '1',
      })
      
      const response = await axios.get(`${API_URL}/api/dumps?${params}`)
      const fetchedDumps = response.data.dumps || []
      
      setDumps(fetchedDumps.slice(0, 10))
    } catch (err) {
      console.error('Error fetching dumps:', err)
      setError('Error fetching dumps')
      setDumps([])
    } finally {
      setLoading(false)
    }
  }, [isPaused])

  useEffect(() => {
    fetchDumps()
  }, [fetchDumps])

  useEffect(() => {
    if (onRefresh) {
      fetchDumps()
    }
  }, [onRefresh, fetchDumps])

  if (loading && dumps.length === 0) {
    return (
      <div className="live-dumps-mini">
        <div className="mini-header">
          <h3>Live Dumps</h3>
          <Link to="/live-dumps" className="view-all-link">
            View Full <FiExternalLink />
          </Link>
        </div>
        <div className="mini-content loading">
          <FiTerminal className="loading-spinner" />
          <span>Loading...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="live-dumps-mini">
        <div className="mini-header">
          <h3>Live Dumps</h3>
          <Link to="/live-dumps" className="view-all-link">
            View Full <FiExternalLink />
          </Link>
        </div>
        <div className="mini-content error">
          <span>{error}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="live-dumps-mini">
      <div className="mini-header">
        <h3>Live Dumps</h3>
        <Link to="/live-dumps" className="view-all-link">
          View Full <FiExternalLink />
        </Link>
      </div>
      <div className="mini-content">
        {dumps.length === 0 ? (
          <div className="empty-state">
            <FiTerminal className="empty-icon" />
            <p>No dumps found</p>
          </div>
        ) : (
          <div className="dumps-list">
            {dumps.map((dump) => (
              <div key={dump.id} className="dump-entry">
                <div className="dump-header-mini">
                  <div className="dump-service-mini">
                    <FiServer className="icon" />
                    <span>{dump.service}</span>
                  </div>
                  <span className="dump-timestamp-mini">{formatTimestamp(dump.timestamp)}</span>
                </div>
                <div className="dump-span-mini">
                  <FiActivity className="icon" />
                  <span>{dump.span_name}</span>
                </div>
                {dump.trace_id && (
                  <Link to={`/traces/${dump.trace_id}`} className="trace-link-mini">
                    <FiLink className="icon" />
                    View Trace
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default LiveDumpsMini
