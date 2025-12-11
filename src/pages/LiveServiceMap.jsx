import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { FiRefreshCw, FiPause, FiPlay, FiRadio, FiArrowLeft } from 'react-icons/fi'
import ServiceMap from '../components/ServiceMap'
import HelpIcon from '../components/HelpIcon'
import './LiveServiceMap.css'

function LiveServiceMap() {
  const [isPaused, setIsPaused] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(Date.now())
  const [refreshInterval, setRefreshInterval] = useState(10000) // 10 seconds
  const refreshIntervalRef = useRef(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

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
    <div className="live-service-map">
      <div className="live-service-map-header">
        <div className="live-service-map-header-left">
          <Link to="/live" className="back-link">
            <FiArrowLeft /> Back to Live Dashboard
          </Link>
          <div className="live-header-title">
            <FiRadio className="page-icon" />
            <h1>Live Service Map</h1>
            <HelpIcon 
              text="Real-time service dependency visualization with auto-refresh. Updates every 10 seconds to show the latest service relationships and health status." 
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
        <div className="live-service-map-header-right">
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

      <div className="live-service-map-content">
        <ServiceMap refreshTrigger={refreshTrigger} />
      </div>
    </div>
  )
}

export default LiveServiceMap
