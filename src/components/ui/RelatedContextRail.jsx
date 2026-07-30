import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { FiLink } from 'react-icons/fi'
import { Panel } from './index'

const API = import.meta.env.VITE_API_URL || ''

/** Wave 14-4: related-context rail for entity detail pages. */
export default function RelatedContextRail({ query, title = 'Related' }) {
  const [items, setItems] = useState([])
  useEffect(() => {
    if (!query || String(query).length < 2) { setItems([]); return undefined }
    let alive = true
    axios.get(`${API}/api/search`, { params: { q: query, limit: 8 } })
      .then((res) => { if (alive) setItems(res.data?.results || []) })
      .catch(() => { if (alive) setItems([]) })
    return () => { alive = false }
  }, [query])

  if (!items.length) return null
  return (
    <Panel title={title} icon={<FiLink />} style={{ marginTop: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((r) => (
          <Link key={`${r.kind}:${r.id}`} to={r.href} className="opa-mono" style={{ fontSize: 12, textDecoration: 'none' }}>
            <span className="opa-muted">{r.kind}</span> · {r.label}
          </Link>
        ))}
      </div>
    </Panel>
  )
}
