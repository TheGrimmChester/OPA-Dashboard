import React, { useState, useEffect } from 'react'
import { useTenant } from '../contexts/TenantContext'
import axios from 'axios'
import { FiPlus, FiTrash2, FiCopy, FiEye, FiEyeOff, FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import './ApiKeys.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function ApiKeys() {
  const { organizationId, projectId } = useTenant()
  const [apiKeys, setApiKeys] = useState([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [limit, setLimit] = useState(50)
  const [offset, setOffset] = useState(0)
  const [showNewKey, setShowNewKey] = useState(false)
  const [newKey, setNewKey] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    expires_at: '',
  })

  useEffect(() => {
    loadApiKeys()
  }, [organizationId, projectId, limit, offset])

  const loadApiKeys = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('auth_token')
      const params = new URLSearchParams({
        organization_id: organizationId,
        project_id: projectId,
        limit: limit.toString(),
        offset: offset.toString(),
      })
      const response = await axios.get(
        `${API_URL}/api/api-keys?${params}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )
      setApiKeys(response.data.api_keys || [])
      setTotal(response.data.total || response.data.api_keys?.length || 0)
    } catch (error) {
      console.error('Failed to load API keys:', error)
    } finally {
      setLoading(false)
    }
  }

  const createApiKey = async (e) => {
    e.preventDefault()
    try {
      const token = localStorage.getItem('auth_token')
      const response = await axios.post(
        `${API_URL}/api/api-keys`,
        {
          organization_id: organizationId,
          project_id: projectId,
          name: formData.name,
          expires_at: formData.expires_at || null,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )
      setNewKey(response.data.key)
      setShowNewKey(true)
      setShowCreateForm(false)
      setFormData({ name: '', expires_at: '' })
      loadApiKeys()
    } catch (error) {
      console.error('Failed to create API key:', error)
      alert('Failed to create API key: ' + (error.response?.data?.error || error.message))
    }
  }

  const deleteApiKey = async (keyId) => {
    if (!confirm('Are you sure you want to delete this API key?')) {
      return
    }

    try {
      const token = localStorage.getItem('auth_token')
      await axios.delete(`${API_URL}/api/api-keys/${keyId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      loadApiKeys()
    } catch (error) {
      console.error('Failed to delete API key:', error)
      alert('Failed to delete API key: ' + (error.response?.data?.error || error.message))
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    alert('Copied to clipboard!')
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never'
    try {
      return new Date(dateStr).toLocaleString()
    } catch {
      return dateStr
    }
  }

  return (
    <div className="api-keys-page">
      <div className="page-header">
        <h1>API Keys</h1>
        <button
          className="btn-primary"
          onClick={() => setShowCreateForm(true)}
          disabled={showCreateForm}
        >
          <FiPlus /> Create API Key
        </button>
      </div>

      {showNewKey && (
        <div className="new-key-alert">
          <h3>API Key Created</h3>
          <p>Save this key now - you won't be able to see it again!</p>
          <div className="key-display">
            <code>{newKey}</code>
            <button onClick={() => copyToClipboard(newKey)}>
              <FiCopy /> Copy
            </button>
          </div>
          <button className="btn-secondary" onClick={() => setShowNewKey(false)}>
            I've saved it
          </button>
        </div>
      )}

      {showCreateForm && (
        <div className="create-key-form">
          <h2>Create New API Key</h2>
          <form onSubmit={createApiKey}>
            <div className="form-group">
              <label>Name:</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="e.g., Production API Key"
              />
            </div>
            <div className="form-group">
              <label>Expires At (optional):</label>
              <input
                type="datetime-local"
                value={formData.expires_at}
                onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
              />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                Create Key
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowCreateForm(false)
                  setFormData({ name: '', expires_at: '' })
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="api-keys-list">
        <div className="api-keys-header">
          <h2>Your API Keys</h2>
          {!loading && (
            <div className="api-keys-info">
              Showing {apiKeys.length} of {total} key{total !== 1 ? 's' : ''}
              {total > 0 && (
                <span className="page-range">
                  {' '}({offset + 1}-{Math.min(offset + apiKeys.length, total)})
                </span>
              )}
            </div>
          )}
        </div>
        {loading ? (
          <div className="loading">Loading...</div>
        ) : apiKeys.length === 0 ? (
          <div className="empty-state">No API keys found. Create one to get started.</div>
        ) : (
          <>
            <table className="api-keys-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Organization</th>
                  <th>Project</th>
                  <th>Created</th>
                  <th>Expires</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((key) => (
                  <tr key={key.key_id}>
                    <td>{key.name}</td>
                    <td>{key.organization_id}</td>
                    <td>{key.project_id}</td>
                    <td>{formatDate(key.created_at)}</td>
                    <td>{formatDate(key.expires_at)}</td>
                    <td>
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => deleteApiKey(key.key_id)}
                        title="Delete"
                      >
                        <FiTrash2 />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {total > limit && (
              <div className="pagination">
                <button 
                  className="btn btn-secondary"
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0 || loading}
                >
                  <FiChevronLeft />
                  <span>Previous</span>
                </button>
                <span className="page-info">
                  Page {total > 0 ? Math.floor(offset / limit) + 1 : 0} of {total > 0 ? Math.ceil(total / limit) : 0}
                </span>
                <button 
                  className="btn btn-secondary"
                  onClick={() => setOffset(offset + limit)}
                  disabled={offset + limit >= total || loading}
                >
                  <span>Next</span>
                  <FiChevronRight />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default ApiKeys

