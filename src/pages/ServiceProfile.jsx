import React from 'react'
import { useParams, Link } from 'react-router-dom'
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

      <div className="service-traces-container">
        <TraceList 
          filters={{ service: serviceName }} 
          onTraceSelect={null}
          autoRefresh={true}
        />
      </div>
    </div>
  )
}

export default ServiceProfile
