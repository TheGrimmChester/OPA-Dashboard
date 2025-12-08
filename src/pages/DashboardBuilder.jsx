import React, { useState, useEffect, useRef } from 'react'
import { FiLayout, FiPlus, FiSave, FiTrash2, FiEdit2, FiX } from 'react-icons/fi'
import axios from 'axios'
import './DashboardBuilder.css'

const API_URL = import.meta.env.VITE_API_URL || ''

const WIDGET_TYPES = {
  metric: { name: 'Metric', icon: '📊' },
  chart: { name: 'Chart', icon: '📈' },
  table: { name: 'Table', icon: '📋' },
  heatmap: { name: 'Heatmap', icon: '🔥' },
}

function DashboardBuilder() {
  const [dashboards, setDashboards] = useState([])
  const [currentDashboard, setCurrentDashboard] = useState(null)
  const [widgets, setWidgets] = useState([])
  const [draggedWidget, setDraggedWidget] = useState(null)
  const [selectedWidget, setSelectedWidget] = useState(null)
  const [showWidgetMenu, setShowWidgetMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 })
  const containerRef = useRef(null)

  useEffect(() => {
    fetchDashboards()
  }, [])

  useEffect(() => {
    if (currentDashboard) {
      setWidgets(currentDashboard.config?.widgets || [])
    }
  }, [currentDashboard])

  const fetchDashboards = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/dashboards`)
      setDashboards(response.data.dashboards || [])
    } catch (err) {
      console.error('Error fetching dashboards:', err)
    }
  }

  const handleSave = async () => {
    if (!currentDashboard) return
    
    try {
      const config = {
        widgets: widgets,
        layout: 'grid',
      }
      
      await axios.put(`${API_URL}/api/dashboards/${currentDashboard.id}`, {
        ...currentDashboard,
        config,
      })
      
      alert('Dashboard saved successfully')
      fetchDashboards()
    } catch (err) {
      console.error('Error saving dashboard:', err)
      alert('Failed to save dashboard')
    }
  }

  const handleAddWidget = (type) => {
    const newWidget = {
      id: `widget-${Date.now()}`,
      type,
      title: `${WIDGET_TYPES[type].name} ${widgets.length + 1}`,
      x: 0,
      y: 0,
      width: type === 'metric' ? 200 : 400,
      height: type === 'metric' ? 150 : 300,
      config: getDefaultWidgetConfig(type),
    }
    
    setWidgets([...widgets, newWidget])
    setShowWidgetMenu(false)
  }

  const getDefaultWidgetConfig = (type) => {
    switch (type) {
      case 'metric':
        return { metric: 'duration_ms', aggregation: 'avg' }
      case 'chart':
        return { metric: 'duration_ms', chartType: 'line', timeRange: '24h' }
      case 'table':
        return { columns: ['service', 'duration_ms', 'status'], limit: 10 }
      case 'heatmap':
        return { metric: 'duration_ms', groupBy: 'service' }
      default:
        return {}
    }
  }

  const handleDragStart = (e, widget) => {
    setDraggedWidget(widget)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e) => {
    e.preventDefault()
    if (!draggedWidget) return

    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    setWidgets(widgets.map(w => 
      w.id === draggedWidget.id 
        ? { ...w, x: Math.max(0, x - 10), y: Math.max(0, y - 10) }
        : w
    ))
    
    setDraggedWidget(null)
  }

  const handleDeleteWidget = (id) => {
    setWidgets(widgets.filter(w => w.id !== id))
    setSelectedWidget(null)
  }

  const handleContextMenu = (e, widget) => {
    e.preventDefault()
    setMenuPosition({ x: e.clientX, y: e.clientY })
    setSelectedWidget(widget)
    setShowWidgetMenu(true)
  }

  const handleNewDashboard = async () => {
    const name = prompt('Dashboard name:')
    if (!name) return

    try {
      const response = await axios.post(`${API_URL}/api/dashboards`, {
        name,
        description: '',
        config: { widgets: [] },
        is_shared: false,
      })
      
      setCurrentDashboard(response.data)
      setWidgets([])
      fetchDashboards()
    } catch (err) {
      console.error('Error creating dashboard:', err)
      alert('Failed to create dashboard')
    }
  }

  return (
    <div className="DashboardBuilder">
      <div className="builder-header">
        <div className="header-title">
          <FiLayout className="header-icon" />
          <h2>Dashboard Builder</h2>
        </div>
        <div className="header-actions">
          <select
            value={currentDashboard?.id || ''}
            onChange={(e) => {
              const dashboard = dashboards.find(d => d.id === e.target.value)
              setCurrentDashboard(dashboard || null)
            }}
            className="dashboard-select"
          >
            <option value="">Select Dashboard</option>
            {dashboards.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <button className="btn btn-secondary" onClick={handleNewDashboard}>
            <FiPlus /> New Dashboard
          </button>
          {currentDashboard && (
            <button className="btn btn-primary" onClick={handleSave}>
              <FiSave /> Save
            </button>
          )}
        </div>
      </div>

      {currentDashboard ? (
        <div 
          className="builder-canvas"
          ref={containerRef}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="widget-palette">
            <h3>Widgets</h3>
            {Object.entries(WIDGET_TYPES).map(([type, info]) => (
              <div
                key={type}
                className="palette-item"
                draggable
                onDragStart={(e) => {
                  const widget = {
                    id: `new-${type}-${Date.now()}`,
                    type,
                    title: info.name,
                    x: 0,
                    y: 0,
                    width: type === 'metric' ? 200 : 400,
                    height: type === 'metric' ? 150 : 300,
                    config: getDefaultWidgetConfig(type),
                  }
                  handleDragStart(e, widget)
                }}
              >
                <span className="palette-icon">{info.icon}</span>
                <span>{info.name}</span>
              </div>
            ))}
          </div>

          <div className="canvas-area">
            {widgets.map(widget => (
              <div
                key={widget.id}
                className={`widget ${selectedWidget?.id === widget.id ? 'selected' : ''}`}
                style={{
                  left: `${widget.x}px`,
                  top: `${widget.y}px`,
                  width: `${widget.width}px`,
                  height: `${widget.height}px`,
                }}
                draggable
                onDragStart={(e) => handleDragStart(e, widget)}
                onContextMenu={(e) => handleContextMenu(e, widget)}
                onClick={() => setSelectedWidget(widget)}
              >
                <div className="widget-header">
                  <span>{widget.title}</span>
                  <button
                    className="widget-delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteWidget(widget.id)
                    }}
                  >
                    <FiX />
                  </button>
                </div>
                <div className="widget-content">
                  <WidgetPreview widget={widget} />
                </div>
                {selectedWidget?.id === widget.id && (
                  <div className="widget-resize-handle" />
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <FiLayout className="empty-icon" />
          <p>Select or create a dashboard to start building</p>
        </div>
      )}

      {showWidgetMenu && selectedWidget && (
        <div
          className="context-menu"
          style={{ left: menuPosition.x, top: menuPosition.y }}
          onClick={() => setShowWidgetMenu(false)}
        >
          <button onClick={() => {
            const title = prompt('Widget title:', selectedWidget.title)
            if (title) {
              setWidgets(widgets.map(w => 
                w.id === selectedWidget.id ? { ...w, title } : w
              ))
            }
            setShowWidgetMenu(false)
          }}>
            <FiEdit2 /> Edit Title
          </button>
          <button onClick={() => {
            handleDeleteWidget(selectedWidget.id)
            setShowWidgetMenu(false)
          }}>
            <FiTrash2 /> Delete
          </button>
        </div>
      )}
    </div>
  )
}

function WidgetPreview({ widget }) {
  switch (widget.type) {
    case 'metric':
      return (
        <div className="metric-preview">
          <div className="metric-value">--</div>
          <div className="metric-label">{widget.config.metric}</div>
        </div>
      )
    case 'chart':
      return (
        <div className="chart-preview">
          <div className="chart-placeholder">Chart: {widget.config.metric}</div>
        </div>
      )
    case 'table':
      return (
        <div className="table-preview">
          <div className="table-placeholder">Table: {widget.config.columns?.join(', ')}</div>
        </div>
      )
    case 'heatmap':
      return (
        <div className="heatmap-preview">
          <div className="heatmap-placeholder">Heatmap: {widget.config.metric}</div>
        </div>
      )
    default:
      return <div>Unknown widget type</div>
  }
}

export default DashboardBuilder

