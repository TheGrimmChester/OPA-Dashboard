import React, { useState } from 'react'
import { FiDownload } from 'react-icons/fi'
import axios from 'axios'
import './ExportButton.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function ExportButton({ filters = {}, label = 'Export' }) {
  const [exporting, setExporting] = useState(false)
  const [format, setFormat] = useState('json')

  const handleExport = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      Object.keys(filters).forEach(key => {
        if (filters[key]) {
          params.append(key, filters[key])
        }
      })
      params.append('format', format)
      
      const response = await axios.get(`${API_URL}/api/export/traces?${params.toString()}`, {
        responseType: 'blob',
      })
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      const filename = `traces_export_${new Date().toISOString().slice(0, 10)}.${format}`
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Error exporting:', err)
      alert('Failed to export data')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="ExportButton">
      <select
        value={format}
        onChange={(e) => setFormat(e.target.value)}
        className="format-select"
        disabled={exporting}
      >
        <option value="json">JSON</option>
        <option value="csv">CSV</option>
        <option value="ndjson">NDJSON</option>
      </select>
      <button
        className="btn btn-secondary export-btn"
        onClick={handleExport}
        disabled={exporting}
      >
        <FiDownload />
        {exporting ? 'Exporting...' : label}
      </button>
    </div>
  )
}

export default ExportButton

