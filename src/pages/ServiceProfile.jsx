import React from 'react'
import { useParams, Link } from 'react-router-dom'
import { FiGlobe } from 'react-icons/fi'
import TraceList from '../components/TraceList'
import './ServiceProfile.css'

function ServiceProfile() {
  const { serviceName } = useParams()

  return (
    <div className="ServiceProfile">
      <div className="service-profile-header">
        <div className="service-profile-header-left">
          <Link to="/services" className="back-link">← Back to Services</Link>
          <h1>{serviceName}</h1>
        </div>
      </div>

      <div className="service-profile-sections">
        <div className="service-section">
          <div className="service-section-header">
            <h2>Traces</h2>
          </div>
          <div className="service-traces-container">
            <TraceList 
              filters={{ service: serviceName }} 
              onTraceSelect={null}
              autoRefresh={true}
            />
          </div>
        </div>

        <div className="service-section">
          <div className="service-section-header">
            <h2>
              <FiGlobe /> HTTP Requests
            </h2>
            <Link 
              to={`/http?service=${encodeURIComponent(serviceName)}`}
              className="view-all-link"
            >
              View All HTTP Requests →
            </Link>
          </div>
          <div className="service-http-info">
            <p>View grouped HTTP requests for this service with performance metrics, error rates, and bandwidth usage.</p>
            <Link 
              to={`/http?service=${encodeURIComponent(serviceName)}`}
              className="btn btn-primary"
            >
              View HTTP Analysis
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ServiceProfile
