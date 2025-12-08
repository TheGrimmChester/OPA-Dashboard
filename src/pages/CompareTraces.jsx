import React, { useState, useEffect } from 'react'
import { useNavigate, Link, useLocation, useSearchParams } from 'react-router-dom'
import { 
  FiArrowLeft, 
  FiShuffle, 
  FiCheckCircle, 
  FiAlertCircle,
  FiServer,
  FiClock,
  FiLayers,
  FiRefreshCw,
  FiDownload
} from 'react-icons/fi'
import axios from 'axios'
import ProfileComparison from '../components/ProfileComparison'
import LoadingSpinner from '../components/LoadingSpinner'
import CopyToClipboard from '../components/CopyToClipboard'
import ShareButton from '../components/ShareButton'
import './CompareTraces.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function CompareTraces() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  
  const [trace1Id, setTrace1Id] = useState(searchParams.get('trace1') || '')
  const [trace2Id, setTrace2Id] = useState(searchParams.get('trace2') || '')
  const [trace1, setTrace1] = useState(null)
  const [trace2, setTrace2] = useState(null)
  const [loading1, setLoading1] = useState(false)
  const [loading2, setLoading2] = useState(false)
  const [error1, setError1] = useState(null)
  const [error2, setError2] = useState(null)
  const [viewMode, setViewMode] = useState(searchParams.get('mode') || 'diff')
  const [recentTraces, setRecentTraces] = useState([])
  const [loadingTraces, setLoadingTraces] = useState(false)

  // Fetch recent traces for suggestions
  useEffect(() => {
    const fetchRecentTraces = async () => {
      setLoadingTraces(true)
      try {
        // Try to get recent traces from the traces list endpoint
        const response = await axios.get(`${API_URL}/api/traces?limit=20`)
        if (response.data && Array.isArray(response.data)) {
          setRecentTraces(response.data)
        } else if (response.data && response.data.traces && Array.isArray(response.data.traces)) {
          setRecentTraces(response.data.traces)
        }
      } catch (err) {
        console.error('Error fetching recent traces:', err)
        // Don't show error, just continue without suggestions
      } finally {
        setLoadingTraces(false)
      }
    }

    fetchRecentTraces()
  }, [])

  // Fetch trace 1
  const fetchTrace1 = async (id = null) => {
    const traceId = id || trace1Id
    if (!traceId || !traceId.trim()) {
      setTrace1(null)
      setError1(null)
      return
    }

    setLoading1(true)
    setError1(null)
    try {
      const response = await axios.get(`${API_URL}/api/traces/${traceId.trim()}/full`)
      setTrace1(response.data)
    } catch (err) {
      setError1(err.response?.status === 404 ? 'Trace not found' : 'Error loading trace')
      setTrace1(null)
      console.error('Error fetching trace 1:', err)
    } finally {
      setLoading1(false)
    }
  }

  // Fetch trace 2
  const fetchTrace2 = async (id = null) => {
    const traceId = id || trace2Id
    if (!traceId || !traceId.trim()) {
      setTrace2(null)
      setError2(null)
      return
    }

    setLoading2(true)
    setError2(null)
    try {
      const response = await axios.get(`${API_URL}/api/traces/${traceId.trim()}/full`)
      setTrace2(response.data)
    } catch (err) {
      setError2(err.response?.status === 404 ? 'Trace not found' : 'Error loading trace')
      setTrace2(null)
      console.error('Error fetching trace 2:', err)
    } finally {
      setLoading2(false)
    }
  }

  const handleCompare = () => {
    if (trace1Id.trim() && trace2Id.trim()) {
      fetchTrace1()
      fetchTrace2()
    }
  }

  // Sync trace IDs and view mode to URL params
  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    
    if (trace1Id) params.set('trace1', trace1Id)
    else params.delete('trace1')
    
    if (trace2Id) params.set('trace2', trace2Id)
    else params.delete('trace2')
    
    if (viewMode && viewMode !== 'diff') params.set('mode', viewMode)
    else params.delete('mode')
    
    setSearchParams(params, { replace: true })
  }, [trace1Id, trace2Id, viewMode, searchParams, setSearchParams])

  // Auto-load traces from URL params on mount
  useEffect(() => {
    const trace1FromUrl = searchParams.get('trace1')
    const trace2FromUrl = searchParams.get('trace2')
    
    if (trace1FromUrl && trace1FromUrl !== trace1Id) {
      setTrace1Id(trace1FromUrl)
      fetchTrace1(trace1FromUrl)
    }
    if (trace2FromUrl && trace2FromUrl !== trace2Id) {
      setTrace2Id(trace2FromUrl)
      fetchTrace2(trace2FromUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run on mount

  // Check if trace IDs were passed via location state
  useEffect(() => {
    if (location.state?.trace1Id) {
      setTrace1Id(location.state.trace1Id)
      // Auto-load trace 1 if ID is provided
      fetchTrace1(location.state.trace1Id)
    }
    if (location.state?.trace2Id) {
      setTrace2Id(location.state.trace2Id)
      // Auto-load trace 2 if ID is provided
      fetchTrace2(location.state.trace2Id)
    }
  }, [location.state])

  const formatDuration = (ms) => {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
    if (ms < 1000) return `${ms.toFixed(2)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  return (
    <div className="compare-traces">
      <div className="compare-traces-header">
        <div className="compare-traces-header-left">
          <Link to="/traces" className="back-link btn btn-ghost">
            <FiArrowLeft />
            <span>Back to Traces</span>
          </Link>
          <div className="header-title-section">
            <FiShuffle className="header-icon" />
            <h1>Compare Traces</h1>
          </div>
        </div>
        <div className="compare-traces-header-right">
          {trace1Id && trace2Id && (
            <>
              <ShareButton />
              <ShareButton />
            </>
          )}
        </div>
      </div>

      <div className="compare-traces-content">
        <div className="trace-selectors">
          <div className="trace-selector card">
            <label htmlFor="trace1" className="selector-label">
              <FiShuffle className="label-icon" />
              <span>Trace 1 (Baseline)</span>
            </label>
            <div className="selector-input-group">
              <input
                id="trace1"
                type="text"
                value={trace1Id}
                onChange={(e) => setTrace1Id(e.target.value)}
                placeholder="Enter trace ID"
                className="trace-input"
                list="recent-traces-1"
              />
              <datalist id="recent-traces-1">
                {recentTraces.map((trace, idx) => (
                  <option key={idx} value={trace.trace_id || trace.id} />
                ))}
              </datalist>
              <button
                onClick={fetchTrace1}
                disabled={loading1 || !trace1Id.trim()}
                className="btn btn-primary load-btn"
              >
                {loading1 ? (
                  <>
                    <FiRefreshCw className="spinning" />
                    <span>Loading...</span>
                  </>
                ) : (
                  <>
                    <FiDownload />
                    <span>Load</span>
                  </>
                )}
              </button>
            </div>
            {error1 && (
              <div className="error-message">
                <FiAlertCircle />
                <span>{error1}</span>
              </div>
            )}
            {trace1 && (
              <div className="trace-info card">
                <div className="info-item">
                  <FiServer className="info-icon" />
                  <div className="info-content">
                    <strong>Service</strong>
                    <span>{trace1.spans?.[0]?.service || 'N/A'}</span>
                  </div>
                </div>
                <div className="info-item">
                  <FiClock className="info-icon" />
                  <div className="info-content">
                    <strong>Duration</strong>
                    <span>{formatDuration(trace1.spans?.[0]?.duration_ms || 0)}</span>
                  </div>
                </div>
                <div className="info-item">
                  <FiLayers className="info-icon" />
                  <div className="info-content">
                    <strong>Spans</strong>
                    <span>{trace1.spans?.length || 0}</span>
                  </div>
                </div>
                <div className="info-item">
                  {trace1.spans?.[0]?.status === 'error' || trace1.spans?.[0]?.status === '0' ? (
                    <FiAlertCircle className="info-icon error" />
                  ) : (
                    <FiCheckCircle className="info-icon success" />
                  )}
                  <div className="info-content">
                    <strong>Status</strong>
                    <span className={`status-badge ${trace1.spans?.[0]?.status === 'error' || trace1.spans?.[0]?.status === '0' ? 'error' : 'ok'}`}>
                      {trace1.spans?.[0]?.status === 'error' || trace1.spans?.[0]?.status === '0' ? 'Error' : 'OK'}
                    </span>
                  </div>
                </div>
                <div className="trace-loaded-indicator">
                  <FiCheckCircle className="check-icon" />
                  <span>Loaded</span>
                </div>
                <div className="trace-actions">
                  <CopyToClipboard text={trace1Id} label="Copy ID" />
                  <Link 
                    to={`/traces/${trace1Id}`}
                    className="btn btn-ghost view-trace-link"
                  >
                    View Trace
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div className="trace-selector card">
            <label htmlFor="trace2" className="selector-label">
              <FiShuffle className="label-icon" />
              <span>Trace 2 (New)</span>
            </label>
            <div className="selector-input-group">
              <input
                id="trace2"
                type="text"
                value={trace2Id}
                onChange={(e) => setTrace2Id(e.target.value)}
                placeholder="Enter trace ID"
                className="trace-input"
                list="recent-traces-2"
              />
              <datalist id="recent-traces-2">
                {recentTraces.map((trace, idx) => (
                  <option key={idx} value={trace.trace_id || trace.id} />
                ))}
              </datalist>
              <button
                onClick={fetchTrace2}
                disabled={loading2 || !trace2Id.trim()}
                className="btn btn-primary load-btn"
              >
                {loading2 ? (
                  <>
                    <FiRefreshCw className="spinning" />
                    <span>Loading...</span>
                  </>
                ) : (
                  <>
                    <FiDownload />
                    <span>Load</span>
                  </>
                )}
              </button>
            </div>
            {error2 && (
              <div className="error-message">
                <FiAlertCircle />
                <span>{error2}</span>
              </div>
            )}
            {trace2 && (
              <div className="trace-info card">
                <div className="info-item">
                  <FiServer className="info-icon" />
                  <div className="info-content">
                    <strong>Service</strong>
                    <span>{trace2.spans?.[0]?.service || 'N/A'}</span>
                  </div>
                </div>
                <div className="info-item">
                  <FiClock className="info-icon" />
                  <div className="info-content">
                    <strong>Duration</strong>
                    <span>{formatDuration(trace2.spans?.[0]?.duration_ms || 0)}</span>
                  </div>
                </div>
                <div className="info-item">
                  <FiLayers className="info-icon" />
                  <div className="info-content">
                    <strong>Spans</strong>
                    <span>{trace2.spans?.length || 0}</span>
                  </div>
                </div>
                <div className="info-item">
                  {trace2.spans?.[0]?.status === 'error' || trace2.spans?.[0]?.status === '0' ? (
                    <FiAlertCircle className="info-icon error" />
                  ) : (
                    <FiCheckCircle className="info-icon success" />
                  )}
                  <div className="info-content">
                    <strong>Status</strong>
                    <span className={`status-badge ${trace2.spans?.[0]?.status === 'error' || trace2.spans?.[0]?.status === '0' ? 'error' : 'ok'}`}>
                      {trace2.spans?.[0]?.status === 'error' || trace2.spans?.[0]?.status === '0' ? 'Error' : 'OK'}
                    </span>
                  </div>
                </div>
                <div className="trace-loaded-indicator">
                  <FiCheckCircle className="check-icon" />
                  <span>Loaded</span>
                </div>
                <div className="trace-actions">
                  <CopyToClipboard text={trace2Id} label="Copy ID" />
                  <Link 
                    to={`/traces/${trace2Id}`}
                    className="btn btn-ghost view-trace-link"
                  >
                    View Trace
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="view-mode-selector">
          <label>View Mode:</label>
          <div className="view-mode-buttons">
            <button
              className={viewMode === 'diff' ? 'active' : ''}
              onClick={() => setViewMode('diff')}
            >
              Difference View
            </button>
            <button
              className={viewMode === 'side-by-side' ? 'active' : ''}
              onClick={() => setViewMode('side-by-side')}
            >
              Side by Side
            </button>
          </div>
        </div>

        {trace1 && trace2 && (
          <div className="comparison-container">
            <ProfileComparison trace1={trace1} trace2={trace2} viewMode={viewMode} />
          </div>
        )}

        {(!trace1 || !trace2) && (
          <div className="comparison-placeholder">
            <p>Select two traces above to start comparing</p>
            {recentTraces.length > 0 && (
              <div className="recent-traces">
                <h3>Recent Traces:</h3>
                <div className="recent-traces-list">
                  {recentTraces.slice(0, 10).map((trace, idx) => {
                    const traceId = trace.trace_id || trace.id
                    return (
                      <div key={idx} className="recent-trace-item">
                        <button
                          onClick={() => {
                            if (!trace1) {
                              setTrace1Id(traceId)
                              setTrace1Id(traceId)
                              setTimeout(() => fetchTrace1(), 100)
                            } else if (!trace2) {
                              setTrace2Id(traceId)
                              setTimeout(() => fetchTrace2(), 100)
                            }
                          }}
                          className="trace-link-btn"
                        >
                          {traceId.substring(0, 16)}...
                        </button>
                        <span className="trace-meta">
                          {formatDuration(trace.duration_ms || 0)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default CompareTraces

