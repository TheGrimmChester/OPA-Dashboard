import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom'
import { FiDatabase, FiRefreshCw, FiAlertCircle, FiArrowLeft, FiChevronLeft, FiChevronRight, FiArrowUp, FiArrowDown } from 'react-icons/fi'
import { sqlService } from '../services/sqlApi'
import SqlQueryViewer from '../components/SqlQueryViewer'
import ShareButton from '../components/ShareButton'
import LoadingSpinner from '../components/LoadingSpinner'
import TimeRangePicker from '../components/TimeRangePicker'
import HelpIcon from '../components/HelpIcon'
import FilterBuilder from '../components/FilterBuilder'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import './SqlAnalysis.css'

function SqlAnalysis({ refreshTrigger }) {
  const { fingerprint } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  
  const [queries, setQueries] = useState([])
  const [queryDetail, setQueryDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [total, setTotal] = useState(0)
  const limitParam = searchParams.get('limit')
  const offsetParam = searchParams.get('offset')
  const [limit, setLimit] = useState(limitParam ? parseInt(limitParam, 10) : 50)
  const [offset, setOffset] = useState(offsetParam ? parseInt(offsetParam, 10) : 0)
  const [service, setService] = useState(searchParams.get('service') || '')
  const [timeRange, setTimeRange] = useState(searchParams.get('timeRange') || '24h')
  const filterQuery = searchParams.get('filter') || ''
  const [filter, setFilter] = useState(filterQuery)
  const sortByParam = searchParams.get('sortBy')
  const sortOrderParam = searchParams.get('sortOrder')
  const [sortBy, setSortBy] = useState(sortByParam || 'last_created_at')
  const [sortOrder, setSortOrder] = useState(sortOrderParam || 'desc')

  const getTimeRangeParams = () => {
    const now = new Date()
    let from, to
    to = now.toISOString().slice(0, 19).replace('T', ' ')
    
    switch (timeRange) {
      case '1h':
        from = new Date(now.getTime() - 3600000).toISOString().slice(0, 19).replace('T', ' ')
        break
      case '6h':
        from = new Date(now.getTime() - 21600000).toISOString().slice(0, 19).replace('T', ' ')
        break
      case '24h':
        from = new Date(now.getTime() - 86400000).toISOString().slice(0, 19).replace('T', ' ')
        break
      case '7d':
        from = new Date(now.getTime() - 604800000).toISOString().slice(0, 19).replace('T', ' ')
        break
      case '30d':
        from = new Date(now.getTime() - 2592000000).toISOString().slice(0, 19).replace('T', ' ')
        break
      default:
        from = new Date(now.getTime() - 86400000).toISOString().slice(0, 19).replace('T', ' ')
    }
    
    return { from, to }
  }

  const fetchQueries = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    
    try {
      const { from, to } = getTimeRangeParams()
      const params = {
        from,
        to,
        limit,
        offset,
      }
      
      if (service) params.service = service
      if (filter) params.filter = filter
      
      const data = await sqlService.listQueries(params)
      setQueries(data.queries || [])
      setTotal(data.total || data.queries?.length || 0)
    } catch (err) {
      setError(err.response?.data?.error || 'Error fetching SQL queries')
      console.error('Fetch SQL queries error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [service, timeRange, limit, offset, filter])

  const fetchQueryDetail = useCallback(async () => {
    if (!fingerprint) return
    
    setLoading(true)
    setError(null)
    
    try {
      const data = await sqlService.getQueryDetails(fingerprint)
      setQueryDetail(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Error fetching query details')
      console.error('Fetch query detail error:', err)
    } finally {
      setLoading(false)
    }
  }, [fingerprint])

  useEffect(() => {
    if (fingerprint) {
      fetchQueryDetail()
    } else {
      fetchQueries()
    }
  }, [fingerprint, fetchQueryDetail, fetchQueries])

  useEffect(() => {
    if (!fingerprint) {
      setOffset(0)
    }
  }, [service, timeRange, filter, fingerprint])

  // Handle external refresh trigger
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0 && !fingerprint && !loading) {
      fetchQueries(true)
    }
  }, [refreshTrigger, fetchQueries, fingerprint, loading])
  
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
    setOffset(0)
  }

  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    
    if (service) params.set('service', service)
    else params.delete('service')
    
    if (timeRange && timeRange !== '24h') params.set('timeRange', timeRange)
    else params.delete('timeRange')
    
    if (filter) params.set('filter', filter)
    else params.delete('filter')
    
    if (limit !== 50) params.set('limit', limit.toString())
    else params.delete('limit')
    
    if (offset !== 0) params.set('offset', offset.toString())
    else params.delete('offset')
    
    if (sortBy !== 'last_created_at') params.set('sortBy', sortBy)
    else params.delete('sortBy')
    
    if (sortOrder !== 'desc') params.set('sortOrder', sortOrder)
    else params.delete('sortOrder')
    
    setSearchParams(params, { replace: true })
  }, [service, timeRange, filter, limit, offset, sortBy, sortOrder, searchParams, setSearchParams])

  const formatDuration = (ms) => {
    if (!ms && ms !== 0) return 'N/A'
    if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
    if (ms < 1000) return `${ms.toFixed(2)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  if (loading && !queries.length && !queryDetail) {
    return <LoadingSpinner message="Loading SQL queries..." />
  }

  // Query detail view
  if (fingerprint && queryDetail) {
    return (
      <div className="sql-analysis">
        <div className="sql-analysis-header">
          <Link to="/sql" className="back-link">← Back to SQL Queries</Link>
          <h1>SQL Query Details</h1>
          <ShareButton />
        </div>

        <div className="sql-query-detail">
          <div className="query-fingerprint">
            <h2>Query Fingerprint</h2>
            <div className="fingerprint-value">{fingerprint}</div>
          </div>

          <div className="query-stats">
            <div className="stat-card">
              <div className="stat-label">Total Executions</div>
              <div className="stat-value">{queryDetail.total_executions?.toLocaleString() || 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Avg Duration</div>
              <div className="stat-value">{formatDuration(queryDetail.avg_duration)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">P95 Duration</div>
              <div className="stat-value">{formatDuration(queryDetail.p95_duration)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">P99 Duration</div>
              <div className="stat-value">{formatDuration(queryDetail.p99_duration)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Max Duration</div>
              <div className="stat-value">{formatDuration(queryDetail.max_duration)}</div>
            </div>
          </div>

          {queryDetail.example_query && (
            <div className="query-example">
              <h2>Example Query</h2>
              <SqlQueryViewer query={queryDetail.example_query} />
            </div>
          )}

          {queryDetail.performance_trends && queryDetail.performance_trends.length > 0 && (
            <div className="performance-trends">
              <h2>Performance Trends</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={queryDetail.performance_trends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="avg_duration" stroke="#8884d8" name="Avg Duration (ms)" />
                  <Line type="monotone" dataKey="p95_duration" stroke="#82ca9d" name="P95 Duration (ms)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Query list view
  return (
    <div className="sql-analysis">
      <div className="sql-analysis-header">
        <h1>SQL Query Analysis <HelpIcon text="Analyze SQL query performance and execution patterns. View query fingerprints, execution counts, and duration statistics." position="right" /></h1>
        <ShareButton />
      </div>

      <div className="sql-analysis-filters">
        <div className="filter-group">
          <label>Time Range:</label>
          <TimeRangePicker value={timeRange} onChange={setTimeRange} />
        </div>
        <div className="filter-group filter-group-full">
          <label>Filter:</label>
          <FilterBuilder
            value={filter}
            onChange={(newFilter) => {
              setFilter(newFilter)
              // Extract service from filter if present
              const serviceMatch = newFilter.match(/service:(\w+)/i)
              if (serviceMatch) {
                const newService = serviceMatch[1]
                if (newService !== service) {
                  setService(newService)
                }
              } else if (service) {
                setService('')
              }
            }}
            placeholder="e.g., service:api, sql.duration_ms:>1000, (service:api AND sql.duration_ms:>100)"
          />
        </div>
        {refreshing && <span className="refresh-indicator">🔄 Refreshing...</span>}
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="sql-queries-list">
        <div className="sql-queries-header">
          <h2>SQL Queries <HelpIcon text="List of SQL queries with performance metrics. Click on a query to view detailed analysis." position="right" /></h2>
          <div className="sql-queries-info">
            Showing {queries.length} of {total} quer{total !== 1 ? 'ies' : 'y'}
            {total > 0 && (
              <span className="page-range">
                {' '}({offset + 1}-{Math.min(offset + queries.length, total)})
              </span>
            )}
          </div>
        </div>
        {queries.length === 0 && !loading ? (
          <div className="empty-state">No SQL queries found</div>
        ) : (
          <>
            <div className="queries-table-container">
              <table className="queries-table">
                <thead>
                  <tr>
                    <th>Query Fingerprint</th>
                    <th onClick={() => handleSort('execution_count')} className="sortable" style={{ cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>Executions</span>
                        {sortBy === 'execution_count' && (
                          sortOrder === 'asc' ? <FiArrowUp /> : <FiArrowDown />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort('avg_duration')} className="sortable" style={{ cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>Avg Duration</span>
                        {sortBy === 'avg_duration' && (
                          sortOrder === 'asc' ? <FiArrowUp /> : <FiArrowDown />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort('p95_duration')} className="sortable" style={{ cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>P95 Duration</span>
                        {sortBy === 'p95_duration' && (
                          sortOrder === 'asc' ? <FiArrowUp /> : <FiArrowDown />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort('p99_duration')} className="sortable" style={{ cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>P99 Duration</span>
                        {sortBy === 'p99_duration' && (
                          sortOrder === 'asc' ? <FiArrowUp /> : <FiArrowDown />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort('max_duration')} className="sortable" style={{ cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>Max Duration</span>
                        {sortBy === 'max_duration' && (
                          sortOrder === 'asc' ? <FiArrowUp /> : <FiArrowDown />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort('last_created_at')} className="sortable" style={{ cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>Last Created</span>
                        {sortBy === 'last_created_at' && (
                          sortOrder === 'asc' ? <FiArrowUp /> : <FiArrowDown />
                        )}
                      </div>
                    </th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queries.map((query, idx) => (
                    <tr key={idx}>
                      <td className="fingerprint-cell">
                        <code>{query.fingerprint || query.query_fingerprint}</code>
                      </td>
                      <td>{query.execution_count?.toLocaleString() || 0}</td>
                      <td>{formatDuration(query.avg_duration)}</td>
                      <td>{formatDuration(query.p95_duration)}</td>
                      <td>{formatDuration(query.p99_duration)}</td>
                      <td>{formatDuration(query.max_duration)}</td>
                      <td style={{ fontSize: '0.85em' }}>
                        {query.last_created_at ? new Date(query.last_created_at).toLocaleString() : 'N/A'}
                      </td>
                      <td>
                        <button
                          className="view-details-btn"
                          onClick={() => navigate(`/sql/${encodeURIComponent(query.fingerprint || query.query_fingerprint)}`)}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

export default SqlAnalysis

