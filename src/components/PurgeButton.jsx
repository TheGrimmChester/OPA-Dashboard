import React, { useState } from 'react'
import { traceApi } from '../services/api'
import './PurgeButton.css'

function PurgeButton() {
  const [isConfirming, setIsConfirming] = useState(false)
  const [isPurging, setIsPurging] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  const handlePurgeClick = () => {
    setIsConfirming(true)
    setError(null)
    setSuccess(false)
  }

  const handleConfirm = async () => {
    setIsPurging(true)
    setError(null)
    setSuccess(false)

    try {
      await traceApi.purgeAllTraces()
      setSuccess(true)
      setIsConfirming(false)
      
      // Reload the page after 2 seconds to reflect the purge
      setTimeout(() => {
        window.location.reload()
      }, 2000)
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to purge traces')
      setIsPurging(false)
    }
  }

  const handleCancel = () => {
    setIsConfirming(false)
    setError(null)
    setSuccess(false)
  }

  if (isConfirming) {
    return (
      <div className="purge-confirmation">
        <div className="purge-confirmation-content">
          <h3>⚠️ Confirm Purge</h3>
          <p>Are you sure you want to delete <strong>ALL traces</strong>? This action cannot be undone.</p>
          <div className="purge-confirmation-buttons">
            <button
              className="purge-button-confirm"
              onClick={handleConfirm}
              disabled={isPurging}
            >
              {isPurging ? 'Purging...' : 'Yes, Purge All'}
            </button>
            <button
              className="purge-button-cancel"
              onClick={handleCancel}
              disabled={isPurging}
            >
              Cancel
            </button>
          </div>
          {error && <div className="purge-error">{error}</div>}
          {success && <div className="purge-success">All traces purged successfully. Reloading...</div>}
        </div>
      </div>
    )
  }

  return (
    <button
      className="purge-button"
      onClick={handlePurgeClick}
      title="Purge all traces"
    >
      🗑️ Purge All
    </button>
  )
}

export default PurgeButton

