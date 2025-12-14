import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FiHardDrive, FiRefreshCw, FiExternalLink, FiArrowRight } from 'react-icons/fi'
import { redisService } from '../services/redisApi'
import './LiveRedisMini.css'

function formatDuration(ms) {
  if (!ms && ms !== 0) return 'N/A'
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
  if (ms < 1000) return `${ms.toFixed(2)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function LiveRedisMini({ isPaused, onRefresh, onDataStatusChange }) {
  const navigate = useNavigate()
  const [operations, setOperations] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const fetchOperations = useCallback(async (isRefresh = false) => {
    if (isPaused) return
    
    try {
      if (isRefresh) {
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
      
      const data = await redisService.listOperations(params)
      const fetchedOperations = data.operations || []
      const hasData = fetchedOperations.length > 0
      
      if (onDataStatusChange) {
        onDataStatusChange(hasData)
      }
      
      setOperations(fetchedOperations)
    } catch (err) {
      console.error('Fetch Redis operations error:', err)
      setError('Error fetching Redis operations')
      setOperations([])
      if (onDataStatusChange) {
        onDataStatusChange(false)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [isPaused, onDataStatusChange])

  const hasMountedRef = useRef(false)
  
  useEffect(() => {
    if (!hasMountedRef.current && !isPaused) {
      hasMountedRef.current = true
      fetchOperations()
    }
  }, [isPaused, fetchOperations])

  useEffect(() => {
    if (onRefresh && onRefresh > 0 && !loading && hasMountedRef.current) {
      fetchOperations(true)
    }
  }, [onRefresh, fetchOperations, loading])

  if (loading && operations.length === 0) {
    return (
      <div className="live-redis-mini">
        <div className="mini-header">
          <h3>Redis Operations</h3>
          <Link to="/live/redis" className="view-all-link">
            View Full <FiExternalLink />
          </Link>
        </div>
        <div className="mini-content loading">
          <FiHardDrive className="loading-spinner" />
          <span>Loading...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="live-redis-mini">
        <div className="mini-header">
          <h3>Redis Operations</h3>
          <Link to="/live/redis" className="view-all-link">
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
    <div className="live-redis-mini">
      <div className="mini-header">
        <h3>Redis Operations</h3>
        <Link to="/live/redis" className="view-all-link">
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
        {operations.length === 0 ? (
          <div className="empty-state">
            <FiHardDrive className="empty-icon" />
            <p>No Redis operations found</p>
          </div>
        ) : (
          <div className="operations-list">
            {operations.map((op, idx) => (
              <div 
                key={idx} 
                className="operation-item"
                onClick={() => navigate(`/live/redis?command=${encodeURIComponent(op.command || '')}&key=${encodeURIComponent(op.key || '')}`)}
              >
                <div className="operation-header">
                  <code className="operation-command">
                    {op.command || 'N/A'}
                  </code>
                  {op.key && (
                    <span className="operation-key">{op.key}</span>
                  )}
                  <FiArrowRight className="arrow-icon" />
                </div>
                <div className="operation-stats">
                  <span className="stat">
                    <strong>{op.execution_count?.toLocaleString() || 0}</strong> exec
                  </span>
                  <span className="stat">
                    Avg: <strong>{formatDuration(op.avg_duration)}</strong>
                  </span>
                  <span className="stat">
                    P95: <strong>{formatDuration(op.p95_duration)}</strong>
                  </span>
                  {op.hit_count !== undefined && op.miss_count !== undefined && (
                    <span className="stat">
                      Hit: <strong>{op.hit_count}</strong> / Miss: <strong>{op.miss_count}</strong>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default LiveRedisMini
