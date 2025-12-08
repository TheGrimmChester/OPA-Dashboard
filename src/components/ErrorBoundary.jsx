import React from 'react'
import { Link } from 'react-router-dom'
import './ErrorBoundary.css'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <h2>Something went wrong</h2>
            <p>An error occurred while rendering this page.</p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="error-details">
                <summary>Error details</summary>
                <pre>{this.state.error.toString()}</pre>
              </details>
            )}
            <div className="error-boundary-actions">
              <button onClick={() => window.location.reload()}>
                Reload Page
              </button>
              <Link to="/" className="button-link">
                Go to Home
              </Link>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary

