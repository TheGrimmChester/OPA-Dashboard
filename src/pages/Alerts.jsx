import React, { useState, useEffect } from 'react'
import { FiBell, FiPlus, FiEdit, FiTrash2, FiCheck, FiX } from 'react-icons/fi'
import axios from 'axios'
import './Alerts.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function Alerts() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingAlert, setEditingAlert] = useState(null)

  useEffect(() => {
    fetchAlerts()
  }, [])

  const fetchAlerts = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/alerts`)
      setAlerts(response.data.alerts || [])
    } catch (err) {
      console.error('Error fetching alerts:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this alert?')) return
    
    try {
      await axios.delete(`${API_URL}/api/alerts/${id}`)
      fetchAlerts()
    } catch (err) {
      console.error('Error deleting alert:', err)
      alert('Failed to delete alert')
    }
  }

  const handleTest = async (id) => {
    try {
      await axios.post(`${API_URL}/api/alerts/${id}`)
      alert('Alert test triggered')
    } catch (err) {
      console.error('Error testing alert:', err)
      alert('Failed to test alert')
    }
  }

  if (loading) {
    return <div className="Alerts">Loading alerts...</div>
  }

  return (
    <div className="Alerts">
      <div className="alerts-header">
        <div className="header-title">
          <FiBell className="header-icon" />
          <h2>Alerts</h2>
          {!loading && (
            <span className="alerts-count">
              ({alerts.length} alert{alerts.length !== 1 ? 's' : ''})
            </span>
          )}
        </div>
        <button 
          className="btn btn-primary"
          onClick={() => setShowForm(true)}
        >
          <FiPlus /> New Alert
        </button>
      </div>

      {showForm && (
        <AlertForm
          alert={editingAlert}
          onClose={() => {
            setShowForm(false)
            setEditingAlert(null)
          }}
          onSave={() => {
            fetchAlerts()
            setShowForm(false)
            setEditingAlert(null)
          }}
        />
      )}

      <div className="alerts-list">
        {alerts.length === 0 ? (
          <div className="empty-state">
            <FiBell className="empty-icon" />
            <p>No alerts configured</p>
            <button 
              className="btn btn-primary"
              onClick={() => setShowForm(true)}
            >
              Create Your First Alert
            </button>
          </div>
        ) : (
          alerts.map(alert => (
            <div key={alert.id} className="alert-card">
              <div className="alert-header">
                <div>
                  <h3>{alert.name}</h3>
                  <p className="alert-description">{alert.description}</p>
                </div>
                <div className="alert-status">
                  <span className={`status-badge ${alert.enabled ? 'enabled' : 'disabled'}`}>
                    {alert.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
              
              <div className="alert-details">
                <div className="detail-item">
                  <strong>Condition:</strong> {alert.condition_type}
                </div>
                <div className="detail-item">
                  <strong>Action:</strong> {alert.action_type}
                </div>
                {alert.service && (
                  <div className="detail-item">
                    <strong>Service:</strong> {alert.service}
                  </div>
                )}
                {alert.language && (
                  <div className="detail-item">
                    <strong>Language:</strong> {alert.language}
                  </div>
                )}
              </div>

              <div className="alert-actions">
                <button 
                  className="btn btn-sm btn-secondary"
                  onClick={() => handleTest(alert.id)}
                >
                  Test
                </button>
                <button 
                  className="btn btn-sm btn-secondary"
                  onClick={() => {
                    setEditingAlert(alert)
                    setShowForm(true)
                  }}
                >
                  <FiEdit /> Edit
                </button>
                <button 
                  className="btn btn-sm btn-danger"
                  onClick={() => handleDelete(alert.id)}
                >
                  <FiTrash2 /> Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function AlertForm({ alert, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: alert?.name || '',
    description: alert?.description || '',
    enabled: alert?.enabled !== false,
    condition_type: alert?.condition_type || 'duration',
    condition_config: alert?.condition_config || { threshold: 1000, operator: 'gt' },
    action_type: alert?.action_type || 'webhook',
    action_config: alert?.action_config || { url: '' },
    service: alert?.service || '',
    language: alert?.language || '',
    framework: alert?.framework || '',
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    try {
      const payload = {
        ...formData,
        id: alert?.id || undefined,
      }
      
      if (alert) {
        await axios.put(`${API_URL}/api/alerts/${alert.id}`, payload)
      } else {
        await axios.post(`${API_URL}/api/alerts`, payload)
      }
      
      onSave()
    } catch (err) {
      console.error('Error saving alert:', err)
      alert('Failed to save alert')
    }
  }

  return (
    <div className="alert-form-overlay">
      <div className="alert-form">
        <div className="form-header">
          <h3>{alert ? 'Edit Alert' : 'New Alert'}</h3>
          <button className="close-btn" onClick={onClose}>
            <FiX />
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Condition Type *</label>
            <select
              value={formData.condition_type}
              onChange={(e) => setFormData({ ...formData, condition_type: e.target.value })}
              required
            >
              <option value="duration">Duration</option>
              <option value="error_rate">Error Rate</option>
              <option value="throughput">Throughput</option>
            </select>
          </div>

          <div className="form-group">
            <label>Threshold *</label>
            <input
              type="number"
              value={formData.condition_config.threshold || ''}
              onChange={(e) => setFormData({
                ...formData,
                condition_config: { ...formData.condition_config, threshold: parseFloat(e.target.value) }
              })}
              required
            />
          </div>

          <div className="form-group">
            <label>Action Type *</label>
            <select
              value={formData.action_type}
              onChange={(e) => setFormData({ ...formData, action_type: e.target.value })}
              required
            >
              <option value="webhook">Webhook</option>
              <option value="email">Email</option>
              <option value="slack">Slack</option>
            </select>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              <FiCheck /> Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Alerts

