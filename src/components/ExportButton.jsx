import React, { useState } from 'react'
import { FiDownload } from 'react-icons/fi'
import axios from 'axios'
import { Button, Row, Select } from '@open-family/ui'

const API_URL = import.meta.env.VITE_API_URL || ''

const FORMATS = [
  { value: 'json', label: 'JSON' },
  { value: 'csv', label: 'CSV' },
  { value: 'ndjson', label: 'NDJSON' },
]

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
    <Row>
      <Select
        value={format}
        onChange={(e) => setFormat(e.target.value)}
        options={FORMATS}
        disabled={exporting}
        aria-label="Export format"
      />
      <Button icon={<FiDownload />} loading={exporting} onClick={handleExport}>
        {exporting ? 'Exporting…' : label}
      </Button>
    </Row>
  )
}

export default ExportButton
