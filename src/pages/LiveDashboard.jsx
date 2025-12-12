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
  
  // Track data status from child components
  const dataStatusRef = useRef({
    serviceMap: false,
    sql: false,
    logs: false,
    dumps: false
  })
  
  // Track previous overall data state to detect changes
  const previousHasDataRef = useRef(null)
  const adjustmentTimeoutRef = useRef(null)
  
  // Adaptive interval configuration
  const MIN_INTERVAL = 5000   // 5 seconds when data is present
  const BASE_INTERVAL = 10000 // 10 seconds default
  const MAX_INTERVAL = 120000 // 120 seconds (2 minutes) when no data
  const INTERVAL_STEP = 10000 // Increase by 10 seconds when no data

  // Callback to update data status from child components
  const updateDataStatus = useCallback((component, hasData) => {
    dataStatusRef.current[component] = hasData
    
    // Clear any pending adjustment
    if (adjustmentTimeoutRef.current) {
      clearTimeout(adjustmentTimeoutRef.current)
    }
    
    // Debounce the interval adjustment to batch updates from multiple components
    adjustmentTimeoutRef.current = setTimeout(() => {
      // Check if any component has data
      const hasAnyData = Object.values(dataStatusRef.current).some(status => status === true)
      
      // Only adjust interval when the overall state changes or when we need to increment for no data
      const previousHasData = previousHasDataRef.current
      previousHasDataRef.current = hasAnyData
      
      setRefreshInterval(prevInterval => {
        if (hasAnyData) {
          // Data is present - reset to MIN_INTERVAL for fast updates
          return MIN_INTERVAL
        } else {
          // No data - gradually increase interval (but not above MAX_INTERVAL)
          if (previousHasData === true || previousHasData === null) {
            // State changed from has data to no data, or initial state
            // Start from BASE_INTERVAL
            return BASE_INTERVAL
          }
          // Still no data, increment interval
          return Math.min(MAX_INTERVAL, prevInterval + INTERVAL_STEP)
        }
      })
    }, 200) // Wait 200ms to batch updates from all components
  }, [])

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

    // Clear existing interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current)
    }

    // Set up auto-refresh interval with current refreshInterval
    refreshIntervalRef.current = setInterval(() => {
      handleRefresh()
    }, refreshInterval)

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
        refreshIntervalRef.current = null
      }
      if (adjustmentTimeoutRef.current) {
        clearTimeout(adjustmentTimeoutRef.current)
        adjustmentTimeoutRef.current = null
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
            onDataStatusChange={(hasData) => updateDataStatus('serviceMap', hasData)}
          />
        </div>

        {/* Bottom Grid - SQL, Logs, Dumps */}
        <div className="dashboard-grid">
          <div className="dashboard-section sql-section">
            <LiveSqlMini 
              isPaused={isPaused} 
              onRefresh={refreshTrigger}
              onDataStatusChange={(hasData) => updateDataStatus('sql', hasData)}
            />
          </div>
          <div className="dashboard-section logs-section">
            <LiveLogsMini 
              isPaused={isPaused} 
              onRefresh={refreshTrigger}
              onDataStatusChange={(hasData) => updateDataStatus('logs', hasData)}
            />
          </div>
          <div className="dashboard-section dumps-section">
            <LiveDumpsMini 
              isPaused={isPaused} 
              onRefresh={refreshTrigger}
              onDataStatusChange={(hasData) => updateDataStatus('dumps', hasData)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default LiveDashboard
