import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { FiPlay, FiSave, FiCode, FiTerminal } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, EmptyState, DataTable, Badge } from '../components/ui'

const API = import.meta.env.VITE_API_URL || ''

// Prefer filters that match typical smoke / demo traffic so Example N → Run shows rows.
const EXAMPLES = [
  `SELECT count(), avg(duration_ms) FROM spans GROUP BY service SINCE 1h`,
  `SELECT count() FROM logs GROUP BY level, service SINCE 24h`,
  `SELECT count() FROM rum GROUP BY route SINCE 24h LIMIT 25`,
  `SELECT avg(value) FROM metrics WHERE metric_name = 'nodejs.eventloop.utilization' GROUP BY service SINCE 1h`,
]

export default function QueryExplorer() {
  const [q, setQ] = useState(EXAMPLES[0])
  const [result, setResult] = useState({ data: null, loading: false, error: null })
  const [saveName, setSaveName] = useState('')
  const saved = useApi('/api/tql/saved', {}, { noRange: true })
  const attrs = useApi('/api/tql/attrs', {}, { noRange: true })

  useEffect(() => {
    // Warm attribute catalog on mount; ignore failures when agent is offline.
  }, [])

  const run = async (asDry) => {
    setResult((s) => ({ ...s, loading: true, error: null }))
    try {
      const res = await axios.post(`${API}/api/tql/query`, { query: q, dry_run: !!asDry })
      setResult({ data: res.data, loading: false, error: null })
    } catch (e) {
      setResult({
        data: null,
        loading: false,
        error: e.response?.data || e.message || 'Request failed',
      })
    }
  }

  const save = async () => {
    if (!saveName.trim() || !q.trim()) return
    try {
      await axios.post(`${API}/api/tql/saved`, { name: saveName.trim(), query: q })
      setSaveName('')
      saved.reload?.()
    } catch { /* ignore */ }
  }

  const rows = result.data?.rows || []
  const cols = (result.data?.columns || Object.keys(rows[0] || {})).map((c) => ({
    key: c,
    header: c,
    render: (r) => <span className="oui-mono">{r[c] == null ? '—' : String(r[c])}</span>,
  }))
  // Guard null/undefined: JSON.stringify(null) === "null" would fake an error state in Panel.
  const errText = result.error == null
    ? null
    : typeof result.error === 'string'
      ? result.error
      : (result.error?.error || JSON.stringify(result.error))

  return (
    <div className="oui-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Query</h1>
          <div className="opa-page-sub">Cross-signal TQL · compiles to safe ClickHouse SQL</div>
        </div>
      </div>

      <Panel title="Editor" icon={<FiTerminal />}>
        <textarea
          className="opa-input"
          style={{ width: '100%', minHeight: 110, fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 13 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          spellCheck={false}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="opa-btn" onClick={() => run(false)}><FiPlay size={14} /> Run</button>
          <button type="button" className="opa-btn ghost" onClick={() => run(true)}><FiCode size={14} /> Dry run</button>
          <input
            className="opa-input"
            placeholder="Saved name"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            style={{ width: 160 }}
          />
          <button type="button" className="opa-btn ghost" onClick={save}><FiSave size={14} /> Save</button>
          {EXAMPLES.map((ex, i) => (
            <button type="button" key={i} className="opa-btn ghost" onClick={() => setQ(ex)} style={{ fontSize: 12 }}>
              Example {i + 1}
            </button>
          ))}
        </div>
      </Panel>

      <div className="opa-grid cols-2">
        <Panel title="Result" icon={<FiPlay />} loading={result.loading} error={errText}
          empty={!result.loading && !result.data && !result.error}
          emptyText="Run a query to see rows">
          {result.data?.sql && (
            <pre className="oui-mono oui-text-muted" style={{ fontSize: 11, whiteSpace: 'pre-wrap', marginBottom: 12 }}>
              {result.data.sql}
              {result.data.elapsed_ms != null ? `\n/* ${result.data.elapsed_ms} ms · ${result.data.row_count || 0} rows · ${result.data.signal} */` : ''}
            </pre>
          )}
          {cols.length > 0 && rows.length > 0 ? (
            <DataTable columns={cols} rows={rows} rowKey={(_, i) => i} maxHeight={420} />
          ) : (
            result.data?.sql && !rows.length
              ? <Badge>{result.data.dry_run ? 'Dry run' : 'No matching rows'}</Badge>
              : null
          )}
        </Panel>

        <Panel title="Attributes & saved" icon={<FiSave />} loading={attrs.loading || saved.loading}>
          <div style={{ marginBottom: 12 }}>
            {['spans', 'metrics', 'logs', 'rum'].map((sig) => (
              <div key={sig} style={{ marginBottom: 8 }}>
                <div className="oui-text-muted" style={{ fontSize: 11, marginBottom: 4 }}>{sig}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(attrs.data?.[sig] || []).map((a) => (
                    <Badge key={a}>{a}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="oui-text-muted" style={{ fontSize: 12, marginBottom: 6 }}>Saved queries</div>
          {(saved.data?.queries || []).length === 0 ? (
            <span className="oui-text-muted">None yet</span>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {(saved.data.queries || []).map((s, i) => (
                <li key={i}>
                  <button type="button" className="opa-btn ghost" style={{ fontSize: 12 }} onClick={() => setQ(s.query_text || s.query || '')}>
                    {s.name || s.query_id}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!cols.length && !result.data && (
            <EmptyState icon={<FiTerminal />} title="Tips" hint="SELECT … FROM spans|metrics|logs|rum WHERE … GROUP BY … SINCE 1h" />
          )}
        </Panel>
      </div>
    </div>
  )
}
