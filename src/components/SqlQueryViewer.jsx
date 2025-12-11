import React, { useMemo } from 'react'
import { format } from 'sql-formatter'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import './SqlQueryViewer.css'

function SqlQueryViewer({ query, language = 'sql' }) {
  // Extract metadata from query object
  const metadata = useMemo(() => {
    if (!query || typeof query !== 'object') return null
    
    const meta = {}
    if (query.duration_ms !== undefined) {
      meta.duration = query.duration_ms
    } else if (query.duration !== undefined) {
      meta.duration = query.duration * 1000 // Convert seconds to ms
    }
    
    if (query.rows_affected !== undefined && query.rows_affected !== null) {
      meta.rowsAffected = query.rows_affected
    }
    
    if (query.rows_returned !== undefined && query.rows_returned !== null) {
      meta.rowsReturned = query.rows_returned
    }
    
    if (query.query_type) {
      meta.queryType = query.query_type
    } else if (query.type) {
      meta.queryType = query.type
    }
    
    if (query.db_system) {
      meta.dbSystem = query.db_system
    }
    
    if (query.db_host) {
      meta.dbHost = query.db_host
    }
    
    if (query.db_dsn) {
      meta.dbDsn = query.db_dsn
    }
    
    return Object.keys(meta).length > 0 ? meta : null
  }, [query])

  // Extract and clean SQL query string
  const cleanSql = useMemo(() => {
    if (!query) return ''

    // Extract query string if it's an object
    let queryString = query
    if (typeof query === 'object') {
      if (query.query) {
        queryString = query.query
      } else if (query.sql) {
        queryString = query.sql
      } else {
        queryString = JSON.stringify(query, null, 2)
      }
    }

    // Ensure queryString is a string
    if (typeof queryString !== 'string') {
      queryString = String(queryString)
    }

    // Decode HTML entities if present
    queryString = queryString
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")

    // Remove all HTML tags and malformed fragments
    queryString = queryString
      // Remove complete HTML tags
      .replace(/<span[^>]*>/gi, '')
      .replace(/<\/span>/gi, '')
      // Remove malformed HTML fragments like "sql-keyword">, 'sql-string'>, etc.
      .replace(/"sql-[^"]*"\s*>/gi, '')
      .replace(/'sql-[^']*'\s*>/gi, '')
      .replace(/sql-[a-z-]+\s*>/gi, '')
      // Remove orphaned fragments
      .replace(/\s+"\s*>\s*([A-Z])/g, ' $1')
      .replace(/\s+'\s*>\s*([A-Z])/g, " $1")
      // Clean up whitespace
      .replace(/\s+/g, ' ')
      .trim()

    // Format SQL if it's a SQL query
    if (language === 'sql' && queryString) {
      try {
        // Use sql-formatter to beautify the SQL
        return format(queryString, {
          language: 'sql',
          indent: '  ',
          keywordCase: 'upper',
          functionCase: 'upper',
        })
      } catch (error) {
        // If formatting fails, return the cleaned query as-is
        console.warn('SQL formatting error:', error)
        return queryString
      }
    }

    return queryString
  }, [query, language])

  if (!query || !cleanSql) {
    return <div className="sql-query-empty">No query available</div>
  }

  const formatDuration = (ms) => {
    if (ms === undefined || ms === null) return null
    if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
    if (ms < 1000) return `${ms.toFixed(2)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  return (
    <div className="sql-query-viewer">
      {metadata && (
        <div className="sql-query-metadata">
          {metadata.duration !== undefined && (
            <span className="sql-meta-item">
              <span className="sql-meta-label">Duration:</span>
              <span className="sql-meta-value">{formatDuration(metadata.duration)}</span>
            </span>
          )}
          {metadata.rowsReturned !== undefined && metadata.rowsReturned !== null && (
            <span className="sql-meta-item">
              <span className="sql-meta-label">Rows Returned:</span>
              <span className="sql-meta-value">{metadata.rowsReturned}</span>
            </span>
          )}
          {metadata.rowsAffected !== undefined && metadata.rowsAffected !== null && metadata.rowsAffected >= 0 && (
            <span className="sql-meta-item">
              <span className="sql-meta-label">Rows Affected:</span>
              <span className="sql-meta-value">{metadata.rowsAffected}</span>
            </span>
          )}
          {metadata.queryType && (
            <span className="sql-meta-item">
              <span className="sql-meta-label">Type:</span>
              <span className="sql-meta-value">{metadata.queryType}</span>
            </span>
          )}
          {metadata.dbSystem && (
            <span className="sql-meta-item">
              <span className="sql-meta-label">DB System:</span>
              <span className="sql-meta-value">{metadata.dbSystem}</span>
            </span>
          )}
          {metadata.dbHost && (
            <span className="sql-meta-item">
              <span className="sql-meta-label">Host:</span>
              <span className="sql-meta-value">{metadata.dbHost}</span>
            </span>
          )}
          {metadata.dbDsn && (
            <span className="sql-meta-item" title={metadata.dbDsn}>
              <span className="sql-meta-label">DSN:</span>
              <span className="sql-meta-value" style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                {metadata.dbDsn}
              </span>
            </span>
          )}
        </div>
      )}
      <SyntaxHighlighter
        language="sql"
        style={vscDarkPlus}
        customStyle={{
          margin: 0,
          padding: 'var(--spacing-md)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-primary)',
        }}
        codeTagProps={{
          style: {
            fontFamily: 'var(--font-family-mono)',
            fontSize: 'var(--font-size-sm)',
          }
        }}
      >
        {cleanSql}
      </SyntaxHighlighter>
    </div>
  )
}

export default SqlQueryViewer

