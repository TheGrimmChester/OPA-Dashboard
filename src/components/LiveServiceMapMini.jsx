import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { FiServer, FiActivity, FiRefreshCw, FiExternalLink } from 'react-icons/fi'
import { useTenant } from '../contexts/TenantContext'
import './LiveServiceMapMini.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function getTimeRangeParams(range = '24h') {
  const now = new Date()
  let from
  
  switch (range) {
    case '1h':
      from = new Date(now.getTime() - 60 * 60 * 1000)
      break
    case '6h':
      from = new Date(now.getTime() - 6 * 60 * 60 * 1000)
      break
    case '24h':
      from = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      break
    case '7d':
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
    case '30d':
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      break
    default:
      from = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  }
  
  const to = now
  return {
    from: from.toISOString().slice(0, 19).replace('T', ' '),
    to: to.toISOString().slice(0, 19).replace('T', ' ')
  }
}

function LiveServiceMapMini({ isPaused, onRefresh, onDataStatusChange }) {
  const { organizationId, projectId } = useTenant()
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const loadServiceMap = useCallback(async () => {
    if (isPaused) return
    
    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem('auth_token')
      // Use tenant context values, fallback to localStorage, but preserve 'all' if set
      const orgIdRaw = organizationId !== undefined && organizationId !== null 
        ? organizationId 
        : (localStorage.getItem('organization_id') || 'default-org')
      const projIdRaw = projectId !== undefined && projectId !== null 
        ? projectId 
        : (localStorage.getItem('project_id') || 'default-project')
      
      const timeParams = getTimeRangeParams('24h')
      const params = new URLSearchParams({
        from: timeParams.from,
        to: timeParams.to
      })
      
      const headers = {
        Authorization: `Bearer ${token}`,
      }
      
      // Only include headers when not "all" - when "all", backend returns all orgs/projects
      if (orgIdRaw && orgIdRaw !== 'all') {
        headers['X-Organization-ID'] = orgIdRaw
      } else if (orgIdRaw === 'all') {
        // Send "all" explicitly so backend knows to return all data
        headers['X-Organization-ID'] = 'all'
      }
      if (projIdRaw && projIdRaw !== 'all') {
        headers['X-Project-ID'] = projIdRaw
      } else if (projIdRaw === 'all') {
        // Send "all" explicitly so backend knows to return all data
        headers['X-Project-ID'] = 'all'
      }
      
      const response = await axios.get(`${API_URL}/api/service-map?${params.toString()}`, {
        headers,
      })
      
      const nodesData = Array.isArray(response.data?.nodes) ? response.data.nodes : []
      const edgesData = Array.isArray(response.data?.edges) ? response.data.edges : []
      
      const hasData = nodesData.length > 0 || edgesData.length > 0
      if (onDataStatusChange) {
        onDataStatusChange(hasData)
      }
      
      setNodes(nodesData)
      setEdges(edgesData)
    } catch (err) {
      console.error('Failed to load service map:', err)
      setError('Failed to load service map')
      setNodes([])
      setEdges([])
      if (onDataStatusChange) {
        onDataStatusChange(false)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [isPaused, organizationId, projectId, onDataStatusChange])

  const hasMountedRef = useRef(false)
  const lastTenantRef = useRef(`${organizationId}-${projectId}`)
  
  useEffect(() => {
    const currentTenant = `${organizationId}-${projectId}`
    if (!hasMountedRef.current && !isPaused) {
      hasMountedRef.current = true
      lastTenantRef.current = currentTenant
      loadServiceMap()
    } else if (lastTenantRef.current !== currentTenant && !isPaused) {
      // Tenant changed, reload
      lastTenantRef.current = currentTenant
      loadServiceMap()
    }
  }, [isPaused, organizationId, projectId, loadServiceMap])

  useEffect(() => {
    if (onRefresh && hasMountedRef.current) {
      loadServiceMap()
    }
  }, [onRefresh, loadServiceMap])

  const healthyCount = nodes.filter(n => n.health_status === 'healthy').length
  const degradedCount = nodes.filter(n => n.health_status === 'degraded').length
  const downCount = nodes.filter(n => n.health_status === 'down').length

  if (loading && nodes.length === 0) {
    return (
      <div className="live-service-map-mini">
        <div className="mini-header">
          <h3>Service Map</h3>
          <Link to="/live/service-map" className="view-all-link">
            View Full <FiExternalLink />
          </Link>
        </div>
        <div className="mini-content loading">
          <FiActivity className="loading-spinner" />
          <span>Loading...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="live-service-map-mini">
        <div className="mini-header">
          <h3>Service Map</h3>
          <Link to="/live/service-map" className="view-all-link">
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
    <div className="live-service-map-mini">
      <div className="mini-header">
        <h3>Service Map</h3>
        <Link to="/live/service-map" className="view-all-link">
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
        <div className="service-map-stats">
          <div className="stat-item">
            <div className="stat-value">{nodes.length}</div>
            <div className="stat-label">Services</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{edges.length}</div>
            <div className="stat-label">Connections</div>
          </div>
        </div>
        <div className="health-status">
          <div className="health-item healthy">
            <span className="health-dot"></span>
            <span>{healthyCount} Healthy</span>
          </div>
          <div className="health-item degraded">
            <span className="health-dot"></span>
            <span>{degradedCount} Degraded</span>
          </div>
          <div className="health-item down">
            <span className="health-dot"></span>
            <span>{downCount} Down</span>
          </div>
        </div>
        {nodes.length > 0 && (
          <div className="service-list">
            {nodes.slice(0, 5).map((node) => (
              <div key={node.id} className="service-item">
                <FiServer className="service-icon" />
                <span className="service-name">{node.service || node.id}</span>
                <span className={`health-badge ${node.health_status || 'unknown'}`}>
                  {node.health_status || 'unknown'}
                </span>
              </div>
            ))}
            {nodes.length > 5 && (
              <div className="more-services">
                +{nodes.length - 5} more services
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default LiveServiceMapMini
