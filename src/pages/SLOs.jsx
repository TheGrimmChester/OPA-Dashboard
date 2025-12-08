import React, { useState, useEffect } from 'react'
import { FiTarget, FiPlus, FiEdit, FiTrash2, FiTrendingUp, FiTrendingDown } from 'react-icons/fi'
import axios from 'axios'
import './SLOs.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function SLOs() {
  const [slos, setSlos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingSLO, setEditingSLO] = useState(null)

  useEffect(() => {
    fetchSLOs()
  }, [])

  const fetchSLOs = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/slos`)
      setSlos(response.data.slos || [])
    } catch (err) {
      console.error('Error fetching SLOs:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this SLO?')) return
    
    try {
      await axios.delete(`${API_URL}/api/slos/${id}`)
      fetchSLOs()
    } catch (err) {
      console.error('Error deleting SLO:', err)
      alert('Failed to delete SLO')
    }
  }

  if (loading) {
    return <div className="SLOs">Loading SLOs...</div>
  }

  return (
    <div className="SLOs">
      <div className="slos-header">
        <div className="header-title">
          <FiTarget className="header-icon" />
          <h2>SLO/SLA Tracking</h2>
          {!loading && (
            <span className="slos-count">
              ({slos.length} SLO{slos.length !== 1 ? 's' : ''})
            </span>
          )}
        </div>
        <button 
          className="btn btn-primary"
          onClick={() => setShowForm(true)}
        >
          <FiPlus /> New SLO
        </button>
      </div>

      {showForm && (
        <SLOForm
          slo={editingSLO}
          onClose={() => {
            setShowForm(false)
            setEditingSLO(null)
          }}
          onSave={() => {
            fetchSLOs()
            setShowForm(false)
            setEditingSLO(null)
          }}
        />
      )}

      <div className="slos-list">
        {slos.length === 0 ? (
          <div className="empty-state">
            <FiTarget className="empty-icon" />
            <p>No SLOs configured</p>
            <button 
              className="btn btn-primary"
              onClick={() => setShowForm(true)}
            >
              Create Your First SLO
            </button>
          </div>
        ) : (
          slos.map(slo => (
            <SLOCard
              key={slo.id}
              slo={slo}
              onEdit={() => {
                setEditingSLO(slo)
                setShowForm(true)
              }}
              onDelete={() => handleDelete(slo.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function SLOCard({ slo, onEdit, onDelete }) {
  const [compliance, setCompliance] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCompliance()
  }, [slo.id])

  const fetchCompliance = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/slos/${slo.id}/compliance`)
      if (response.data.metrics && response.data.metrics.length > 0) {
        setCompliance(response.data.metrics[0])
      }
    } catch (err) {
      console.error('Error fetching compliance:', err)
    } finally {
      setLoading(false)
    }
  }

  const compliancePercent = compliance ? compliance.compliance_percentage : null
  const isBreach = compliance ? compliance.is_breach : false

  return (
    <div className="slo-card">
      <div className="slo-header">
        <div>
          <h3>{slo.name}</h3>
          <p className="slo-description">{slo.description}</p>
        </div>
        <div className="slo-status">
          {compliancePercent !== null && (
            <div className={`compliance-badge ${isBreach ? 'breach' : 'compliant'}`}>
              {isBreach ? <FiTrendingDown /> : <FiTrendingUp />}
              {compliancePercent.toFixed(1)}%
            </div>
          )}
        </div>
      </div>
      
      <div className="slo-details">
        <div className="detail-item">
          <strong>Service:</strong> {slo.service}
        </div>
        <div className="detail-item">
          <strong>Type:</strong> {slo.slo_type}
        </div>
        <div className="detail-item">
          <strong>Target:</strong> {slo.target_value}%
        </div>
        <div className="detail-item">
          <strong>Window:</strong> {slo.window_hours} hours
        </div>
      </div>

      <div className="slo-actions">
        <button className="btn btn-sm btn-secondary" onClick={onEdit}>
          <FiEdit /> Edit
        </button>
        <button className="btn btn-sm btn-danger" onClick={onDelete}>
          <FiTrash2 /> Delete
        </button>
      </div>
    </div>
  )
}

function SLOForm({ slo, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: slo?.name || '',
    description: slo?.description || '',
    service: slo?.service || '',
    slo_type: slo?.slo_type || 'availability',
    target_value: slo?.target_value || 99.9,
    window_hours: slo?.window_hours || 720,
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    try {
      const payload = {
        ...formData,
        id: slo?.id || undefined,
      }
      
      if (slo) {
        await axios.put(`${API_URL}/api/slos/${slo.id}`, payload)
      } else {
        await axios.post(`${API_URL}/api/slos`, payload)
      }
      
      onSave()
    } catch (err) {
      console.error('Error saving SLO:', err)
      alert('Failed to save SLO')
    }
  }

  return (
    <div className="slo-form-overlay">
      <div className="slo-form">
        <div className="form-header">
          <h3>{slo ? 'Edit SLO' : 'New SLO'}</h3>
          <button className="close-btn" onClick={onClose}>×</button>
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
            <label>Service *</label>
            <input
              type="text"
              value={formData.service}
              onChange={(e) => setFormData({ ...formData, service: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>SLO Type *</label>
            <select
              value={formData.slo_type}
              onChange={(e) => setFormData({ ...formData, slo_type: e.target.value })}
              required
            >
              <option value="availability">Availability</option>
              <option value="latency">Latency</option>
              <option value="error_rate">Error Rate</option>
            </select>
          </div>

          <div className="form-group">
            <label>Target Value (%) *</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={formData.target_value}
              onChange={(e) => setFormData({ ...formData, target_value: parseFloat(e.target.value) })}
              required
            />
          </div>

          <div className="form-group">
            <label>Window (hours) *</label>
            <input
              type="number"
              min="1"
              value={formData.window_hours}
              onChange={(e) => setFormData({ ...formData, window_hours: parseInt(e.target.value) })}
              required
            />
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default SLOs

