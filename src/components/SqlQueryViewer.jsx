import React, { useState, useEffect } from 'react'
import './SqlQueryViewer.css'

function SqlQueryViewer({ query, language = 'sql' }) {
  const [highlighted, setHighlighted] = useState('')

  useEffect(() => {
    if (!query) return

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

    // Simple SQL highlighting
    if (language === 'sql' && typeof queryString === 'string') {
      const keywords = [
        'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP',
        'ALTER', 'TABLE', 'INDEX', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER',
        'ON', 'AS', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS', 'NULL',
        'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'DISTINCT',
        'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'
      ]
      
      let highlightedQuery = queryString
      keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi')
        highlightedQuery = highlightedQuery.replace(regex, `<span class="sql-keyword">${keyword.toUpperCase()}</span>`)
      })
      
      // Highlight strings
      highlightedQuery = highlightedQuery.replace(/'([^']*)'/g, `<span class="sql-string">'$1'</span>`)
      highlightedQuery = highlightedQuery.replace(/"([^"]*)"/g, `<span class="sql-string">"$1"</span>`)
      
      // Highlight numbers
      highlightedQuery = highlightedQuery.replace(/\b(\d+\.?\d*)\b/g, `<span class="sql-number">$1</span>`)
      
      setHighlighted(highlightedQuery)
    } else {
      setHighlighted(queryString)
    }
  }, [query, language])

  if (!query) {
    return <div className="sql-query-empty">No query available</div>
  }

  return (
    <div className="sql-query-viewer">
      <pre className="sql-query-content">
        <code dangerouslySetInnerHTML={{ __html: highlighted || query }} />
      </pre>
    </div>
  )
}

export default SqlQueryViewer

