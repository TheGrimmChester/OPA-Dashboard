import React from 'react'
import { Link } from 'react-router-dom'
import { FiAlertOctagon, FiRefreshCw } from 'react-icons/fi'
import { Button, EmptyState } from '@open-family/ui'
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
      const detail = this.state.error ? String(this.state.error) : ''
      return (
        <div className="opa-errboundary">
          <EmptyState
            icon={<FiAlertOctagon />}
            title="This view stopped rendering"
            description="The page threw while drawing itself, so nothing below this point is on screen. Reloading recovers it; the same error repeating is worth reporting with the detail below."
            actions={
              <>
                <Link to="/" className="oui-btn is-secondary">Go to the overview</Link>
                <Button
                  variant="primary"
                  icon={<FiRefreshCw />}
                  onClick={() => window.location.reload()}
                >
                  Reload the page
                </Button>
              </>
            }
          />
          {/* A stack trace is a developer artefact: it stays behind a disclosure and
              only in a development build, where it is the fastest way to the cause. */}
          {process.env.NODE_ENV === 'development' && detail && (
            <details className="opa-errboundary-detail">
              <summary>Error detail</summary>
              <pre className="oui-mono">{detail}</pre>
            </details>
          )}
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
