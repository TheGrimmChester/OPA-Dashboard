import React, { useState } from 'react'
import axios from 'axios'
import {
  FiBookOpen, FiGlobe, FiMessageSquare, FiFileText, FiPlus, FiPlay,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, StatusPill, Badge } from '../components/ui'
import { fmtNum, fmtAgo } from '../theme/format'
import { useI18n } from '../contexts/I18nContext'

const API = import.meta.env.VITE_API_URL || ''

const TABS = [
  { value: 'notebooks', labelKey: 'collab.notebooks', icon: <FiBookOpen size={13} /> },
  { value: 'status', labelKey: 'collab.status', icon: <FiGlobe size={13} /> },
  { value: 'comments', labelKey: 'collab.comments', icon: <FiMessageSquare size={13} /> },
  { value: 'reports', labelKey: 'collab.reports', icon: <FiFileText size={13} /> },
]

function Tabs({ tabs = [], value, onChange, t }) {
  return (
    <div className="opa-tabs">
      {tabs.map((tab) => (
        <button key={tab.value} className={`opa-tab ${value === tab.value ? 'active' : ''}`} onClick={() => onChange(tab.value)}>
          {tab.icon}{t(tab.labelKey)}
        </button>
      ))}
    </div>
  )
}

/** Wave 26: Collaboration & stakeholder surfaces. */
export default function Collaborate() {
  const { t } = useI18n()
  const [tab, setTab] = useState('notebooks')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [nbTitle, setNbTitle] = useState('Incident investigation')
  const [pageSlug, setPageSlug] = useState('production')
  const [pageTitle, setPageTitle] = useState('Production status')
  const [comment, setComment] = useState({ anchor_type: 'trace', anchor_id: '', body: '', deep_link: window.location.href })
  const [reportName, setReportName] = useState('Weekly exec summary')
  const [viewer, setViewer] = useState(null)
  const [execOut, setExecOut] = useState(null)

  const notebooks = useApi('/api/notebooks', {}, { noRange: true })
  const pages = useApi('/api/status/pages', {}, { noRange: true })
  const comments = useApi('/api/comments', {}, { noRange: true })
  const reports = useApi('/api/reports', {}, { noRange: true })
  const runs = useApi('/api/reports/runs', {}, { noRange: true })

  const nbs = notebooks.data?.notebooks || []
  const pageRows = pages.data?.pages || []
  const cmtRows = comments.data?.comments || []
  const rptRows = reports.data?.reports || []
  const runRows = runs.data?.runs || []

  const createNotebook = async () => {
    setBusy(true); setMsg(null)
    try {
      const { data } = await axios.post(`${API}/api/notebooks`, {
        title: nbTitle,
        description: 'Wave 26 notebook',
        cells: [
          { type: 'prose', body: '## Context\nWhat we know so far…' },
          { type: 'tql', query: 'SELECT count() FROM spans SINCE 1h' },
        ],
      })
      setMsg(data)
      notebooks.reload?.()
    } catch (e) {
      setMsg({ error: e.response?.data || e.message })
    } finally {
      setBusy(false)
    }
  }

  const openNotebook = async (id) => {
    setBusy(true); setExecOut(null)
    try {
      const { data } = await axios.get(`${API}/api/notebooks/${id}`)
      setViewer(data)
    } catch (e) {
      setMsg({ error: e.response?.data || e.message })
    } finally {
      setBusy(false)
    }
  }

  const runNotebook = async (id) => {
    setBusy(true); setExecOut(null)
    try {
      const { data } = await axios.post(`${API}/api/notebooks/${id}/execute`, {})
      setExecOut(data)
    } catch (e) {
      setExecOut({ error: e.response?.data || e.message })
    } finally {
      setBusy(false)
    }
  }

  const createPage = async () => {
    setBusy(true); setMsg(null)
    try {
      const { data } = await axios.post(`${API}/api/status/pages`, {
        slug: pageSlug,
        title: pageTitle,
        public: true,
        components: [
          { name: 'API', status: 'operational' },
          { name: 'Web', status: 'operational' },
        ],
      })
      setMsg(data)
      pages.reload?.()
    } catch (e) {
      setMsg({ error: e.response?.data || e.message })
    } finally {
      setBusy(false)
    }
  }

  const postComment = async () => {
    setBusy(true); setMsg(null)
    try {
      const { data } = await axios.post(`${API}/api/comments`, comment)
      setMsg(data)
      comments.reload?.()
    } catch (e) {
      setMsg({ error: e.response?.data || e.message })
    } finally {
      setBusy(false)
    }
  }

  const createReport = async () => {
    setBusy(true); setMsg(null)
    try {
      const { data } = await axios.post(`${API}/api/reports`, {
        name: reportName, cadence: 'weekly', channel: 'log',
        sections: [{ type: 'slos' }, { type: 'errors' }],
      })
      setMsg(data)
      reports.reload?.()
    } catch (e) {
      setMsg({ error: e.response?.data || e.message })
    } finally {
      setBusy(false)
    }
  }

  const runNow = async () => {
    setBusy(true); setMsg(null)
    try {
      const { data } = await axios.post(`${API}/api/reports/run-now`, {})
      setMsg(data)
      runs.reload?.()
    } catch (e) {
      setMsg({ error: e.response?.data || e.message })
    } finally {
      setBusy(false)
    }
  }

  const nbCols = [
    { key: 'title', header: 'Title', render: (r) => <span className="cell-strong">{r.title}</span> },
    { key: 'created_by', header: 'Author', render: (r) => r.created_by || '—' },
    { key: 'updated_at', header: 'Updated', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.updated_at)}</span> },
    { key: 'actions', header: '', render: (r) => (
      <span style={{ display: 'inline-flex', gap: 6 }}>
        <button className="opa-btn" disabled={busy} onClick={() => openNotebook(r.id)}>{t('collab.open')}</button>
        <button className="opa-btn" disabled={busy} onClick={() => runNotebook(r.id)} title={t('collab.runTql')}><FiPlay size={14} /></button>
      </span>
    ) },
  ]

  const pageCols = [
    { key: 'title', header: 'Title', render: (r) => <span className="cell-strong">{r.title}</span> },
    { key: 'slug', header: 'Slug', render: (r) => (
      <a className="opa-mono" href={`/status/${r.slug}`} target="_blank" rel="noreferrer">{r.slug}</a>
    ) },
    { key: 'public', header: 'Public', render: (r) => (Number(r.public) ? <StatusPill tone="ok">yes</StatusPill> : <Badge>private</Badge>) },
  ]

  const cmtCols = [
    { key: 'anchor_type', header: 'Type', render: (r) => <Badge>{r.anchor_type}</Badge> },
    { key: 'anchor_id', header: 'Anchor', render: (r) => <span className="opa-mono">{r.anchor_id}</span> },
    { key: 'body', header: 'Comment', render: (r) => r.body },
    { key: 'author', header: 'Author', render: (r) => r.author || '—' },
    { key: 'created_at', header: 'When', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.created_at)}</span> },
  ]

  const rptCols = [
    { key: 'name', header: 'Name', render: (r) => <span className="cell-strong">{r.name}</span> },
    { key: 'cadence', header: 'Cadence', render: (r) => <Badge>{r.cadence}</Badge> },
    { key: 'enabled', header: 'On', render: (r) => (Number(r.enabled) ? <StatusPill tone="ok">yes</StatusPill> : <StatusPill tone="warn">no</StatusPill>) },
    { key: 'last_run_at', header: 'Last run', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.last_run_at)}</span> },
  ]

  const runCols = [
    { key: 'report_id', header: 'Report', render: (r) => <span className="opa-mono">{r.report_id}</span> },
    { key: 'summary_json', header: 'Summary', render: (r) => <span className="opa-mono" style={{ fontSize: 11 }}>{String(r.summary_json || '').slice(0, 80)}</span> },
    { key: 'created_at', header: 'When', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.created_at)}</span> },
  ]

  const cells = Array.isArray(viewer?.cells) ? viewer.cells : []

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">{t('collab.title')}</h1>
          <div className="opa-page-sub">{t('collab.subtitle')}</div>
        </div>
      </div>

      <div className="opa-grid cols-4">
        <KpiTile label={t('collab.notebooks')} icon={<FiBookOpen size={12} />} value={fmtNum(nbs.length)} status="neutral" />
        <KpiTile label={t('collab.status')} icon={<FiGlobe size={12} />} value={fmtNum(pageRows.length)} status="neutral" />
        <KpiTile label={t('collab.comments')} icon={<FiMessageSquare size={12} />} value={fmtNum(cmtRows.length)} status="neutral" />
        <KpiTile label={t('collab.reports')} icon={<FiFileText size={12} />} value={fmtNum(runRows.length)} status="neutral" />
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} t={t} />

      {msg && (
        <Panel title="Result">
          <pre className="opa-mono" style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(msg, null, 2)}</pre>
        </Panel>
      )}

      {tab === 'notebooks' && (
        <>
          <Panel title="New notebook">
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="opa-input" style={{ flex: 1 }} value={nbTitle} onChange={(e) => setNbTitle(e.target.value)} />
              <button className="opa-btn" disabled={busy} onClick={createNotebook}><FiPlus size={14} /> Create</button>
            </div>
          </Panel>
          <Panel title={t('collab.notebooks')} icon={<FiBookOpen />} flush loading={notebooks.loading} error={notebooks.error}
            empty={!notebooks.loading && nbs.length === 0} emptyText="No notebooks yet">
            <DataTable columns={nbCols} rows={nbs} rowKey={(r) => r.id} maxHeight={360} />
          </Panel>
          {viewer && (
            <Panel title={`${viewer.title || viewer.id}`}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button className="opa-btn" disabled={busy} onClick={() => runNotebook(viewer.id)}>
                  <FiPlay size={14} /> {t('collab.runTql')}
                </button>
                <button className="opa-btn" onClick={() => { setViewer(null); setExecOut(null) }}>Close</button>
              </div>
              {cells.map((c, i) => (
                <div key={i} style={{ marginBottom: 12, padding: 10, border: '1px solid var(--opa-border, #2a3348)', borderRadius: 6 }}>
                  <Badge>{c.type || 'cell'}</Badge>
                  {c.type === 'tql' ? (
                    <pre className="opa-mono" style={{ margin: '8px 0 0', fontSize: 12 }}>{c.query || c.q || ''}</pre>
                  ) : (
                    <pre style={{ margin: '8px 0 0', fontSize: 12, whiteSpace: 'pre-wrap' }}>{c.body || JSON.stringify(c, null, 2)}</pre>
                  )}
                </div>
              ))}
              {execOut && (
                <pre className="opa-mono" style={{ marginTop: 12, fontSize: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(execOut, null, 2)}</pre>
              )}
            </Panel>
          )}
        </>
      )}

      {tab === 'status' && (
        <>
          <Panel title="New status page">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input className="opa-input" placeholder="slug" value={pageSlug} onChange={(e) => setPageSlug(e.target.value)} />
              <input className="opa-input" placeholder="title" style={{ flex: 1 }} value={pageTitle} onChange={(e) => setPageTitle(e.target.value)} />
              <button className="opa-btn" disabled={busy} onClick={createPage}><FiPlus size={14} /> Create</button>
            </div>
          </Panel>
          <Panel title="Pages" icon={<FiGlobe />} flush loading={pages.loading} error={pages.error}
            empty={!pages.loading && pageRows.length === 0} emptyText="No status pages">
            <DataTable columns={pageCols} rows={pageRows} rowKey={(r) => r.id} maxHeight={360} />
          </Panel>
        </>
      )}

      {tab === 'comments' && (
        <>
          <Panel title="Add comment">
            <div style={{ display: 'grid', gap: 8 }}>
              <input className="opa-input" placeholder="anchor_type" value={comment.anchor_type}
                onChange={(e) => setComment({ ...comment, anchor_type: e.target.value })} />
              <input className="opa-input" placeholder="anchor_id" value={comment.anchor_id}
                onChange={(e) => setComment({ ...comment, anchor_id: e.target.value })} />
              <input className="opa-input" placeholder="deep_link" value={comment.deep_link}
                onChange={(e) => setComment({ ...comment, deep_link: e.target.value })} />
              <textarea className="opa-input" rows={3} placeholder="comment" value={comment.body}
                onChange={(e) => setComment({ ...comment, body: e.target.value })} />
              <button className="opa-btn" disabled={busy || !comment.anchor_id || !comment.body} onClick={postComment}>Post</button>
            </div>
          </Panel>
          <Panel title="Threads" icon={<FiMessageSquare />} flush loading={comments.loading} error={comments.error}
            empty={!comments.loading && cmtRows.length === 0} emptyText="No comments">
            <DataTable columns={cmtCols} rows={cmtRows} rowKey={(r) => r.id} maxHeight={360} />
          </Panel>
        </>
      )}

      {tab === 'reports' && (
        <>
          <Panel title="Scheduled reports">
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input className="opa-input" style={{ flex: 1 }} value={reportName} onChange={(e) => setReportName(e.target.value)} />
              <button className="opa-btn" disabled={busy} onClick={createReport}><FiPlus size={14} /> Create</button>
              <button className="opa-btn" disabled={busy} onClick={runNow}>Run now</button>
            </div>
            <DataTable columns={rptCols} rows={rptRows} rowKey={(r) => r.id} maxHeight={240} />
          </Panel>
          <Panel title="Runs" icon={<FiFileText />} flush loading={runs.loading}
            empty={!runs.loading && runRows.length === 0} emptyText="No report runs yet">
            <DataTable columns={runCols} rows={runRows} rowKey={(r) => r.id} maxHeight={280} />
          </Panel>
        </>
      )}
    </div>
  )
}
