import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { FiPlus, FiEdit2, FiTrash2, FiTrendingUp, FiActivity } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import ApdexScore from '../components/ApdexScore'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import './KeyTransactions.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function KeyTransactions() {
  const [transactions, setTransactions] = useState([])
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    service: '',
    pattern: '',
    description: '',
  })
  const [metrics, setMetrics] = useState([])

  useEffect(() => {
    loadTransactions()
  }, [])

  useEffect(() => {
    if (selectedTransaction) {
      loadTransactionMetrics(selectedTransaction.transaction_id)
    }
  }, [selectedTransaction])

  const loadTransactions = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await axios.get(`${API_URL}/api/key-transactions`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Organization-ID': localStorage.getItem('organization_id') || 'default-org',
          'X-Project-ID': localStorage.getItem('project_id') || 'default-project',
        },
      })
      setTransactions(response.data.transactions || [])
    } catch (error) {
      console.error('Failed to load transactions:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadTransactionMetrics = async (txID) => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await axios.get(`${API_URL}/api/key-transactions/${txID}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Organization-ID': localStorage.getItem('organization_id') || 'default-org',
          'X-Project-ID': localStorage.getItem('project_id') || 'default-project',
        },
      })
      setSelectedTransaction(response.data)
      if (response.data.metrics) {
        setMetrics([response.data.metrics])
      }
    } catch (error) {
      console.error('Failed to load transaction metrics:', error)
    }
  }

  const createTransaction = async (e) => {
    e.preventDefault()
    try {
      const token = localStorage.getItem('auth_token')
      await axios.post(`${API_URL}/api/key-transactions`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Organization-ID': localStorage.getItem('organization_id') || 'default-org',
          'X-Project-ID': localStorage.getItem('project_id') || 'default-project',
        },
      })
      setShowCreateForm(false)
      setFormData({ name: '', service: '', pattern: '', description: '' })
      loadTransactions()
    } catch (error) {
      console.error('Failed to create transaction:', error)
      alert('Failed to create transaction: ' + (error.response?.data?.error || error.message))
    }
  }

  const deleteTransaction = async (txID) => {
    if (!confirm('Are you sure you want to delete this key transaction?')) {
      return
    }

    try {
      const token = localStorage.getItem('auth_token')
      await axios.delete(`${API_URL}/api/key-transactions/${txID}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Organization-ID': localStorage.getItem('organization_id') || 'default-org',
          'X-Project-ID': localStorage.getItem('project_id') || 'default-project',
        },
      })
      loadTransactions()
      if (selectedTransaction?.transaction_id === txID) {
        setSelectedTransaction(null)
      }
    } catch (error) {
      console.error('Failed to delete transaction:', error)
      alert('Failed to delete transaction: ' + (error.response?.data?.error || error.message))
    }
  }

  if (loading) {
    return <div className="key-transactions-loading">Loading key transactions...</div>
  }

  if (selectedTransaction) {
    return (
      <div className="key-transactions-page">
        <div className="page-header">
          <button onClick={() => setSelectedTransaction(null)} className="back-btn">
            ← Back to Transactions
          </button>
          <h1>{selectedTransaction.name}</h1>
        </div>

        <div className="transaction-details">
          <div className="transaction-info">
            <div className="info-item">
              <label>Service:</label>
              <span>{selectedTransaction.service}</span>
            </div>
            <div className="info-item">
              <label>Pattern:</label>
              <span>{selectedTransaction.pattern}</span>
            </div>
            <div className="info-item">
              <label>Description:</label>
              <span>{selectedTransaction.description || 'N/A'}</span>
            </div>
            <div className="info-item">
              <label>Status:</label>
              <span className={selectedTransaction.enabled ? 'status-enabled' : 'status-disabled'}>
                {selectedTransaction.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>

          {selectedTransaction.metrics && (
            <div className="transaction-metrics">
              <h2>Metrics (Last 7 Days)</h2>
              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-label">Apdex Score</div>
                  <ApdexScore score={selectedTransaction.metrics.apdex_score || 0} />
                </div>
                <div className="metric-card">
                  <div className="metric-label">Avg Duration</div>
                  <div className="metric-value">
                    {selectedTransaction.metrics.avg_duration?.toFixed(2)}ms
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">P95 Duration</div>
                  <div className="metric-value">
                    {selectedTransaction.metrics.p95_duration?.toFixed(2)}ms
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">P99 Duration</div>
                  <div className="metric-value">
                    {selectedTransaction.metrics.p99_duration?.toFixed(2)}ms
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Error Rate</div>
                  <div className="metric-value">
                    {selectedTransaction.metrics.error_rate?.toFixed(2)}%
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Total Requests</div>
                  <div className="metric-value">
                    {selectedTransaction.metrics.total_requests?.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="key-transactions-page">
      <div className="page-header">
        <h1>Key Transactions</h1>
        <button
          className="btn-primary"
          onClick={() => setShowCreateForm(true)}
          disabled={showCreateForm}
        >
          <FiPlus /> Create Key Transaction
        </button>
      </div>

      {showCreateForm && (
        <div className="create-transaction-form">
          <h2>Create New Key Transaction</h2>
          <form onSubmit={createTransaction}>
            <div className="form-group">
              <label>Name:</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="e.g., User Login"
              />
            </div>
            <div className="form-group">
              <label>Service:</label>
              <input
                type="text"
                value={formData.service}
                onChange={(e) => setFormData({ ...formData, service: e.target.value })}
                required
                placeholder="e.g., api-service"
              />
            </div>
            <div className="form-group">
              <label>Pattern:</label>
              <input
                type="text"
                value={formData.pattern}
                onChange={(e) => setFormData({ ...formData, pattern: e.target.value })}
                required
                placeholder="e.g., api-service:login or /api/login"
              />
              <small>Format: service:name, URL path, or service name</small>
            </div>
            <div className="form-group">
              <label>Description:</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description"
                rows={3}
              />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                Create
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowCreateForm(false)
                  setFormData({ name: '', service: '', pattern: '', description: '' })
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="transactions-list">
        <div className="transactions-header">
          <h2>Key Transactions</h2>
          {!loading && (
            <span className="transactions-count">
              ({transactions.length} transaction{transactions.length !== 1 ? 's' : ''})
            </span>
          )}
        </div>
        {transactions.length === 0 ? (
          <div className="empty-state">No key transactions found. Create one to get started.</div>
        ) : (
          <div className="transactions-grid">
            {transactions.map((tx) => (
              <div key={tx.transaction_id} className="transaction-card">
                <div className="transaction-card-header">
                  <h3>{tx.name}</h3>
                  <div className="transaction-actions">
                    <button
                      className="btn-icon"
                      onClick={() => loadTransactionMetrics(tx.transaction_id)}
                      title="View Details"
                    >
                      <FiActivity />
                    </button>
                    <button
                      className="btn-icon btn-danger"
                      onClick={() => deleteTransaction(tx.transaction_id)}
                      title="Delete"
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </div>
                <div className="transaction-card-body">
                  <div className="transaction-meta">
                    <span className="meta-label">Service:</span>
                    <span>{tx.service}</span>
                  </div>
                  <div className="transaction-meta">
                    <span className="meta-label">Pattern:</span>
                    <span className="pattern">{tx.pattern}</span>
                  </div>
                  <div className="transaction-status">
                    <span className={tx.enabled ? 'status-enabled' : 'status-disabled'}>
                      {tx.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default KeyTransactions

