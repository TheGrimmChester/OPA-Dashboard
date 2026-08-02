import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'
import { FiLayout, FiPlus, FiSave, FiPlay } from 'react-icons/fi'
import { Panel, EmptyState, KpiTile, DataTable, Badge } from '../components/ui'
import TimeSeriesChart from '../components/ui/TimeSeriesChart'
import { useToast } from '../components/ui/Toast'
import { useApi } from '../hooks/useApi'

const API = import.meta.env.VITE_API_URL || ''

function WidgetCard({ widget, variables }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await axios.post(`${API}/api/dashboards/widgets/query`, {
          type: widget.type,
          query: widget.query,
          variables,
          options: widget.options || {},
        })
        if (alive) setData(res.data)
      } catch (e) {
        if (alive) setErr(e.response?.data || e.message)
      }
    })()
    return () => { alive = false }
  }, [widget.id, widget.query, widget.type, JSON.stringify(variables)])

  const rows = data?.rows || []
  const cols = (data?.columns || []).map((c) => ({
    key: c, header: c,
    render: (r) => <span className="opa-mono">{r[c] == null ? '—' : String(r[c])}</span>,
  }))

  return (
    <Panel title={widget.title || widget.type} icon={<FiLayout />} error={err ? String(err) : null}
      style={{ gridColumn: `span ${widget.w || 4}`, minHeight: (widget.h || 3) * 56 }}>
      {widget.type === 'bignum' && (
        <div className="opa-tnum" style={{ fontSize: 32 }}>{data?.value ?? '—'}</div>
      )}
      {(widget.type === 'table' || widget.type === 'toplist') && cols.length > 0 && (
        <DataTable columns={cols} rows={rows} rowKey={(_, i) => i} maxHeight={240} />
      )}
      {widget.type === 'timeseries' && (
        <TimeSeriesChart
          brushZoom
          data={rows.map((r) => {
            const raw = String(r.t || r.time || '')
            const timeMs = /^\d{4}-\d{2}-\d{2}/.test(raw)
              ? Date.parse(raw.replace(' ', 'T') + (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? '' : 'Z'))
              : Date.parse(raw)
            return { time: raw, timeMs: Number.isFinite(timeMs) ? timeMs : 0, value: Number(r.value ?? r.count ?? 0) }
          })}
          xKey="time"
          height={200}
          series={[{ key: 'value', name: widget.title || 'value', color: 'var(--accent)', type: 'area' }]}
        />
      )}
      {!data && !err && <div className="opa-muted">Loading…</div>}
    </Panel>
  )
}

export default function Dashboards() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const list = useApi('/api/dashboards', { user_id: 'me' }, { noRange: true })
  const templates = useApi('/api/dashboards/templates', {}, { noRange: true })
  const [draft, setDraft] = useState(null)
  const [name, setName] = useState('New dashboard')
  const [varService, setVarService] = useState('')

  useEffect(() => {
    if (!id) return
    axios.get(`${API}/api/dashboards/${encodeURIComponent(id)}`)
      .then((res) => {
        const d = res.data
        setName(d.name || 'Dashboard')
        setDraft(d.config?.version === 2 ? d.config : null)
      })
      .catch(() => toast.push('Failed to load dashboard', { tone: 'error' }))
  }, [id])

  const createFromTemplate = async (tpl) => {
    const config = tpl.config
    try {
      const res = await axios.post(`${API}/api/dashboards`, {
        name: tpl.name,
        description: 'Wave 14 template',
        config,
        user_id: 'me',
        is_shared: true,
      })
      toast.push('Dashboard created')
      navigate(`/dashboards/${res.data.id}`)
    } catch (e) {
      toast.push('Create failed', { tone: 'error' })
    }
  }

  const save = async () => {
    if (!draft) return
    try {
      if (id) {
        await axios.put(`${API}/api/dashboards/${encodeURIComponent(id)}`, {
          name, description: '', config: draft, is_shared: true,
        })
        toast.push('Saved')
      } else {
        const res = await axios.post(`${API}/api/dashboards`, {
          name, description: '', config: draft, user_id: 'me', is_shared: true,
        })
        toast.push('Created')
        navigate(`/dashboards/${res.data.id}`)
      }
    } catch {
      toast.push('Save failed', { tone: 'error' })
    }
  }

  // List view
  if (!id && !draft) {
    const rows = (list.data?.dashboards || []).filter((d) => d.config?.version === 2 || d.config?.widgets)
    return (
      <div className="opa-stack">
        <div className="opa-page-head">
          <div>
            <h1 className="opa-page-title">Dashboards</h1>
            <div className="opa-page-sub">Widget builder over TQL · templates + drag-grid layout</div>
          </div>
          <button type="button" className="opa-btn" onClick={() => setDraft({
            version: 2, layout: { cols: 12 }, variables: { service: '' },
            widgets: [{
              id: 'w1', type: 'bignum', title: 'Spans', x: 0, y: 0, w: 3, h: 2,
              query: "SELECT count() FROM spans SINCE 1h",
            }],
          })}>
            <FiPlus size={14} /> Blank
          </button>
        </div>

        <Panel title="Templates" icon={<FiLayout />}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(templates.data?.templates || []).map((tpl) => (
              <button key={tpl.id} type="button" className="opa-btn ghost" onClick={() => createFromTemplate(tpl)}>
                {tpl.name}
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Your dashboards" icon={<FiLayout />} loading={list.loading} error={list.error}
          empty={!list.loading && rows.length === 0} emptyText="No v2 dashboards yet — start from a template">
          <div className="opa-grid cols-3">
            {rows.map((d) => (
              <Link key={d.id} to={`/dashboards/${d.id}`} className="opa-card" style={{ padding: 12, textDecoration: 'none' }}>
                <div className="cell-strong">{d.name}</div>
                <div className="opa-muted" style={{ fontSize: 12 }}>{d.description || d.id}</div>
                <Badge>{(d.config?.widgets || []).length} widgets</Badge>
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    )
  }

  const cfg = draft || { version: 2, layout: { cols: 12 }, widgets: [] }
  const vars = { service: varService }

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <input className="opa-input" value={name} onChange={(e) => setName(e.target.value)} style={{ fontSize: 20, fontWeight: 600 }} />
          <div className="opa-page-sub">Dashboard builder · variable substitution {'{{service}}'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="opa-input" placeholder="service variable" value={varService} onChange={(e) => setVarService(e.target.value)} style={{ width: 140 }} />
          <button type="button" className="opa-btn" onClick={save}><FiSave size={14} /> Save</button>
          <button type="button" className="opa-btn ghost" onClick={() => { setDraft(null); navigate('/dashboards') }}>Back</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 12 }}>
        {(cfg.widgets || []).map((w) => (
          <div key={w.id} style={{ gridColumn: `span ${Math.min(12, Math.max(2, w.w || 4))}` }}>
            <WidgetCard widget={w} variables={vars} />
          </div>
        ))}
      </div>

      {(cfg.widgets || []).length === 0 && (
        <EmptyState icon={<FiPlay />} title="No widgets" hint="Add a template or blank widget to begin." />
      )}
    </div>
  )
}
