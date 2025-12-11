import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { FiRefreshCw, FiPause, FiPlay, FiRadio, FiActivity } from 'react-icons/fi'
import LiveServiceMapMini from '../components/LiveServiceMapMini'
import LiveSqlMini from '../components/LiveSqlMini'
import LiveLogsMini from '../components/LiveLogsMini'
import LiveDumpsMini from '../components/LiveDumpsMini'
import HelpIcon from '../components/HelpIcon'
import TenantSwitcher from '../components/TenantSwitcher'
import './LiveDashboard.css'

function LiveDashboard() {
  const [isPaused, setIsPaused] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(Date.now())
  const [refreshInterval, setRefreshInterval] = useState(10000) // 10 seconds
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const refreshIntervalRef = useRef(null)

  const handleRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1)
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
    <div className="live-dashboard">
      <div className="live-dashboard-header">
        <div className="live-dashboard-header-left">
          <div className="live-header-title">
            <FiRadio className="page-icon" />
            <h1>Live Dashboard</h1>
            <HelpIcon 
              text="Real-time monitoring overview showing all live features in one organized view. All sections auto-refresh every 10 seconds to display the latest data." 
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
        <div className="live-dashboard-header-right">
          <TenantSwitcher />
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
            title="Manual refresh all sections"
          >
            <FiRefreshCw />
            <span>Refresh All</span>
          </button>
        </div>
      </div>

      <div className="live-dashboard-content">
        {/* Service Map - Full Width */}
        <div className="dashboard-section service-map-section">
          <LiveServiceMapMini 
            isPaused={isPaused} 
            onRefresh={refreshTrigger}
          />
        </div>

        {/* Bottom Grid - SQL, Logs, Dumps */}
        <div className="dashboard-grid">
          <div className="dashboard-section sql-section">
            <LiveSqlMini 
              isPaused={isPaused} 
              onRefresh={refreshTrigger}
            />
          </div>
          <div className="dashboard-section logs-section">
            <LiveLogsMini 
              isPaused={isPaused} 
              onRefresh={refreshTrigger}
            />
          </div>
          <div className="dashboard-section dumps-section">
            <LiveDumpsMini 
              isPaused={isPaused} 
              onRefresh={refreshTrigger}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default LiveDashboard
