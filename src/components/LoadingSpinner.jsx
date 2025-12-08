import React from 'react'
import { FiLoader } from 'react-icons/fi'
import './LoadingSpinner.css'

function LoadingSpinner({ message = 'Loading...', size = 'medium' }) {
  return (
    <div className={`loading-spinner-container ${size}`}>
      <FiLoader className="spinner-icon" />
      {message && <div className="loading-message">{message}</div>}
    </div>
  )
}

export default LoadingSpinner

