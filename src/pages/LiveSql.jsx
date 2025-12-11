import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { FiRefreshCw, FiPause, FiPlay, FiRadio, FiArrowLeft, FiDatabase } from 'react-icons/fi'
import SqlAnalysis from './SqlAnalysis'
import HelpIcon from '../components/HelpIcon'
import './LiveSql.css'

function LiveSql() {
  const [isPaused, setIsPaused] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(Date.now())
  const [refreshInterval, setRefreshInterval] = useState(10000) // 10 seconds
  const refreshIntervalRef = useRef(null)
  const forceRefreshRef = useRef(null)

  // Force refresh mechanism - we'll use a key to force SqlAnalysis to remount
  const [refreshKey, setRefreshKey] = useState(0)

  const handleRefresh = useCallback(() => {
    setRefreshKey(prev => prev + 1)
    setLastRefresh(Date.now())
  }, [])

  useEffect(() => {
    if (isPaused) {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
        refreshIntervalRef.current = null
      }
      return
    }

    // Initial refresh
    handleRefresh()

    // Set up auto-refresh interval
    refreshIntervalRef.current = setInterval(() => {
      handleRefresh()
    }, refreshInterval)

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
        refreshIntervalRef.current = null
      }
    }
  }, [isPaused, refreshInterval, handleRefresh])

  const formatTimeAgo = (timestamp) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ago`
  }

  return (
    <div className="live-sql">
      <div className="live-sql-header">
        <div className="live-sql-header-left">
          <Link to="/live" className="back-link">
            <FiArrowLeft /> Back to Live Dashboard
          </Link>
          <div className="live-header-title">
            <FiRadio className="page-icon" />
            <h1>Live SQL</h1>
            <HelpIcon 
              text="Real-time SQL query monitoring with auto-refresh. Updates every 10 seconds to show the latest query performance metrics and execution statistics." 
              position="right" 
            />
          </div>
          <div className="connection-status">
            <div className={`status-indicator ${!isPaused ? 'connected' : 'paused'}`} />
            <span>{isPaused ? 'Paused' : 'Live'}</span>
            {!isPaused && lastRefresh && (
              <span className="last-refresh">Last refresh: {formatTimeAgo(lastRefresh)}</span>
            )}
          </div>
        </div>
        <div className="live-sql-header-right">
          <button 
            className={`btn ${isPaused ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setIsPaused(!isPaused)}
            title={isPaused ? 'Resume auto-refresh' : 'Pause auto-refresh'}
          >
            {isPaused ? <FiPlay /> : <FiPause />}
            <span>{isPaused ? 'Resume' : 'Pause'}</span>
          </button>
          <button 
            className="btn btn-secondary"
            onClick={handleRefresh}
            title="Manual refresh"
          >
            <FiRefreshCw />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="live-sql-content">
        <SqlAnalysis key={refreshKey} />
      </div>
    </div>
  )
}

export default LiveSql
