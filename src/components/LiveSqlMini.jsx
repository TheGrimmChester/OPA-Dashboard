import React, { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FiDatabase, FiRefreshCw, FiExternalLink, FiArrowRight } from 'react-icons/fi'
import { sqlService } from '../services/sqlApi'
import './LiveSqlMini.css'

function formatDuration(ms) {
  if (!ms && ms !== 0) return 'N/A'
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
  if (ms < 1000) return `${ms.toFixed(2)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function LiveSqlMini({ isPaused, onRefresh }) {
  const navigate = useNavigate()
  const [queries, setQueries] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const fetchQueries = useCallback(async (isRefresh = false) => {
    if (isPaused) return
    
    try {
      if (isRefresh && queries.length > 0) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setError(null)
      
      const now = new Date()
      const from = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      
      const params = {
        from: from.toISOString().slice(0, 19).replace('T', ' '),
        to: now.toISOString().slice(0, 19).replace('T', ' '),
        limit: 10,
        offset: 0,
      }
      
      const data = await sqlService.listQueries(params)
      setQueries(data.queries || [])
    } catch (err) {
      console.error('Fetch SQL queries error:', err)
      setError('Error fetching SQL queries')
      setQueries([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [isPaused, queries.length])

  useEffect(() => {
    fetchQueries()
  }, [fetchQueries])

  useEffect(() => {
    if (onRefresh && onRefresh > 0 && !loading) {
      fetchQueries(true)
    }
  }, [onRefresh, fetchQueries, loading])

  if (loading && queries.length === 0) {
    return (
      <div className="live-sql-mini">
        <div className="mini-header">
          <h3>SQL Queries</h3>
          <Link to="/live/sql" className="view-all-link">
            View Full <FiExternalLink />
          </Link>
        </div>
        <div className="mini-content loading">
          <FiDatabase className="loading-spinner" />
          <span>Loading...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="live-sql-mini">
        <div className="mini-header">
          <h3>SQL Queries</h3>
          <Link to="/live/sql" className="view-all-link">
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
    <div className="live-sql-mini">
      <div className="mini-header">
        <h3>SQL Queries</h3>
        <Link to="/live/sql" className="view-all-link">
          View Full <FiExternalLink />
        </Link>
      </div>
      <div className={`mini-content ${refreshing ? 'refreshing' : ''}`}>
        {refreshing && (
          <div className="refresh-overlay active">
            <div className="refresh-overlay-content">
              <FiRefreshCw className="loading-spinner" />
            </div>
          </div>
        )}
        {queries.length === 0 ? (
          <div className="empty-state">
            <FiDatabase className="empty-icon" />
            <p>No SQL queries found</p>
          </div>
        ) : (
          <div className="queries-list">
            {queries.map((query, idx) => (
              <div 
                key={idx} 
                className="query-item"
                onClick={() => navigate(`/live/sql/${encodeURIComponent(query.fingerprint || query.query_fingerprint)}`)}
              >
                <div className="query-header">
                  <code className="query-fingerprint">
                    {query.fingerprint || query.query_fingerprint || 'N/A'}
                  </code>
                  <FiArrowRight className="arrow-icon" />
                </div>
                <div className="query-stats">
                  <span className="stat">
                    <strong>{query.execution_count?.toLocaleString() || 0}</strong> exec
                  </span>
                  <span className="stat">
                    Avg: <strong>{formatDuration(query.avg_duration)}</strong>
                  </span>
                  <span className="stat">
                    P95: <strong>{formatDuration(query.p95_duration)}</strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default LiveSqlMini
