import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { FiMap, FiPlay, FiUpload, FiRefreshCw } from 'react-icons/fi'
import { Panel, StatusPill } from '../components/ui'
import { apiUrl } from '../utils/apiBase'
import { useApi } from '../hooks/useApi'

const CONTEXT_OPTS = [
  { id: 'discovery', label: 'Feature planning (discovery)' },
  { id: 'competitor', label: 'Competitor analysis' },
  { id: 'audience', label: 'Audience targeting' },
  { id: 'features', label: 'Roadmap features / phases' },
]

/** Dashboard → Roadmap generator (OPA AI Orchestrator). */
export default function Roadmap() {
  const connectors = useApi('/api/connectors', {}, { noRange: true })
  const watched = useApi('/api/scm/settings', {}, { noRange: true })
  const [connectorId, setConnectorId] = useState('')
  const [repo, setRepo] = useState('')
  const [contexts, setContexts] = useState(['discovery', 'features'])
  const [competitors, setCompetitors] = useState('')
  const [audience, setAudience] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [runId, setRunId] = useState('')
  const [runDetail, setRunDetail] = useState(null)
  const [permHealth, setPermHealth] = useState(null)
  const [prefs, setPrefs] = useState(null)
  const [prefsBusy, setPrefsBusy] = useState(false)

  const connectorList = useMemo(() => {
    const raw = connectors.data?.connectors || connectors.data || []
    return Array.isArray(raw) ? raw : []
  }, [connectors.data])

  const repoOptions = useMemo(() => {
    const watches = watched.data?.watched || watched.data?.repos || []
    if (Array.isArray(watches) && watches.length) {
      return watches.map((w) => w.repo_full_name || w.repo || w).filter(Boolean)
    }
    return []
  }, [watched.data])

  useEffect(() => {
    if (!connectorId && connectorList.length) {
      setConnectorId(connectorList[0].id || '')
    }
  }, [connectorList, connectorId])

  useEffect(() => {
    if (!repo && repoOptions.length) setRepo(repoOptions[0])
  }, [repoOptions, repo])

  const loadPerms = useCallback(async (id) => {
    if (!id) {
      setPermHealth(null)
      return
    }
    try {
      const { data } = await axios.get(apiUrl(`/api/connectors/${encodeURIComponent(id)}/permissions`))
      setPermHealth(data?.permissions || data)
    } catch (e) {
      setPermHealth({ ok: false, notes: [e.response?.data || e.message || 'probe failed'] })
    }
  }, [])

  useEffect(() => {
    loadPerms(connectorId)
  }, [connectorId, loadPerms])

  const loadPrefs = useCallback(async () => {
    try {
      const { data } = await axios.get(apiUrl('/api/agents/prefs'), {
        params: { level: 'repo', repo, connector_id: connectorId, scope_key: repo },
      })
      setPrefs(data)
    } catch {
      setPrefs(null)
    }
  }, [repo, connectorId])

  useEffect(() => {
    if (repo) loadPrefs()
  }, [repo, loadPrefs])

  const toggleContext = (id) => {
    setContexts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const pollRun = useCallback(async (id) => {
    const { data } = await axios.get(apiUrl(`/api/scm/roadmap/runs/${encodeURIComponent(id)}`))
    setRunDetail(data)
    return data
  }, [])

  useEffect(() => {
    if (!runId) return undefined
    let active = true
    const tick = async () => {
      try {
        const data = await pollRun(runId)
        const st = data?.run?.status
        if (active && st && !['completed', 'failed', 'error', 'cancelled', 'completed_with_errors', 'skipped'].includes(st)) {
          setTimeout(tick, 2000)
        }
      } catch {
        /* ignore poll errors */
      }
    }
    tick()
    return () => { active = false }
  }, [runId, pollRun])

  const generate = async (publishAfter) => {
    setBusy(true)
    setErr(null)
    try {
      const body = {
        repo_full_name: repo,
        connector_id: connectorId || undefined,
        contexts,
        competitors: competitors.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
        audience_notes: audience,
        publish: !!publishAfter,
      }
      const { data } = await axios.post(apiUrl('/api/scm/roadmap/generate'), body)
      setRunId(data.job_id)
      await pollRun(data.job_id)
    } catch (e) {
      setErr(e.response?.data || e.message || 'Generate failed')
    } finally {
      setBusy(false)
    }
  }

  const publish = async () => {
    if (!runId) return
    setBusy(true)
    setErr(null)
    try {
      const { data } = await axios.post(apiUrl('/api/scm/roadmap/publish'), {
        job_id: runId,
        connector_id: connectorId || undefined,
        repo_full_name: repo,
      })
      setRunDetail((prev) => ({
        ...prev,
        run: {
          ...(prev?.run || {}),
          summary: { ...(prev?.run?.summary || {}), publish: data.publish },
        },
      }))
    } catch (e) {
      setErr(e.response?.data || e.message || 'Publish failed')
    } finally {
      setBusy(false)
    }
  }

  const saveIssuePrefs = async (patch) => {
    setPrefsBusy(true)
    setErr(null)
    try {
      await axios.put(apiUrl('/api/agents/prefs'), {
        level: 'repo',
        scope_key: repo,
        repo,
        connector_id: connectorId,
        prefs: patch,
      })
      await loadPrefs()
    } catch (e) {
      setErr(e.response?.data || e.message || 'Prefs save failed')
    } finally {
      setPrefsBusy(false)
    }
  }

  const effective = prefs?.effective || {}
  const roadmap = runDetail?.artifacts?.['roadmap.json'] || runDetail?.run?.summary?.roadmap
  const discovery = runDetail?.artifacts?.['roadmap_discovery.json'] || runDetail?.run?.summary?.discovery
  const competitor = runDetail?.artifacts?.['competitor_analysis.json'] || runDetail?.run?.summary?.competitor_analysis
  const publishResult = runDetail?.run?.summary?.publish

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <h1 className="opa-page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FiMap size={22} /> Roadmap
        </h1>
        <div className="opa-page-sub">
          Generate phased roadmaps (discovery, competitor, audience) and publish GitHub milestones + AI-labelled Issues.
          Requires OPA-AI-Orchestrator. See{' '}
          <Link to="/security?tab=ops&mode=watch">Repo Watch</Link>
          {' '}·{' '}
          <Link to="/settings/connectors">Connectors</Link>.
        </div>
      </div>

      {err && (
        <div className="opa-banner" role="alert" style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 8 }}>
          {typeof err === 'string' ? err : JSON.stringify(err)}
        </div>
      )}

      <Panel title="GitHub App permissions" icon={<FiRefreshCw />}>
        {!connectorId && <div className="opa-muted">Select a connector.</div>}
        {permHealth && (
          <div className="opa-stack" style={{ gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <StatusPill tone={permHealth.ok ? 'ok' : 'error'}>{permHealth.ok ? 'OK' : 'Missing'}</StatusPill>
              <span>{permHealth.ok ? 'Required grants OK for AI Issues / milestones' : 'Missing required App permissions'}</span>
            </div>
            {!!permHealth.missing?.length && (
              <div className="opa-muted" style={{ fontSize: 13 }}>Missing: {permHealth.missing.join(', ')}</div>
            )}
            {!!permHealth.optional_missing?.length && (
              <div className="opa-muted" style={{ fontSize: 13 }}>
                Projects v2 optional missing: {permHealth.optional_missing.join(', ')}
              </div>
            )}
            {!!permHealth.notes?.length && (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {permHealth.notes.map((n) => <li key={n}>{n}</li>)}
              </ul>
            )}
            <button type="button" className="opa-btn ghost" onClick={() => loadPerms(connectorId)}>Re-probe</button>
          </div>
        )}
      </Panel>

      <Panel title="Repo & contexts" icon={<FiPlay />}>
        <div className="opa-stack" style={{ gap: 12 }}>
          <label className="opa-field">
            <span>Connector</span>
            <select value={connectorId} onChange={(e) => setConnectorId(e.target.value)}>
              <option value="">—</option>
              {connectorList.map((c) => (
                <option key={c.id} value={c.id}>{c.account_login || c.id} ({c.kind})</option>
              ))}
            </select>
          </label>
          <label className="opa-field">
            <span>Watched repo</span>
            <input list="roadmap-repos" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" />
            <datalist id="roadmap-repos">
              {repoOptions.map((r) => <option key={r} value={r} />)}
            </datalist>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {CONTEXT_OPTS.map((c) => (
              <label key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                <input type="checkbox" checked={contexts.includes(c.id)} onChange={() => toggleContext(c.id)} />
                {c.label}
              </label>
            ))}
          </div>
          <label className="opa-field">
            <span>Competitors (comma or newline)</span>
            <textarea rows={2} value={competitors} onChange={(e) => setCompetitors(e.target.value)} placeholder="Aperant, Cursor Bugbot" />
          </label>
          <label className="opa-field">
            <span>Audience notes</span>
            <textarea rows={2} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Solo founders shipping products…" />
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="opa-btn" disabled={busy || !repo} onClick={() => generate(false)}>
              Run generator
            </button>
            <button type="button" className="opa-btn ghost" disabled={busy || !repo} onClick={() => generate(true)}>
              Generate + auto-publish
            </button>
            <button type="button" className="opa-btn ghost" disabled={busy || !runId} onClick={publish}>
              <FiUpload size={14} /> Publish milestones + Issues
            </button>
          </div>
        </div>
      </Panel>

      <Panel title="AI Issues prefs (this repo)">
        {!repo && <div className="opa-muted">Pick a repo to edit prefs.</div>}
        {repo && (
          <div className="opa-stack" style={{ gap: 8, fontSize: 13 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={!!effective.ai_issues_enabled}
                disabled={prefsBusy}
                onChange={(e) => saveIssuePrefs({ ai_issues_enabled: e.target.checked })}
              />
              AI Issues enabled
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={!!effective.issue_auto_implement}
                disabled={prefsBusy}
                onChange={(e) => saveIssuePrefs({ issue_auto_implement: e.target.checked })}
              />
              Auto-implement after plan (still no auto-merge)
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={effective.require_human_before_coding !== false}
                disabled={prefsBusy}
                onChange={(e) => saveIssuePrefs({ require_human_before_coding: e.target.checked })}
              />
              Require human before coding
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={!!effective.roadmap_projects_v2}
                disabled={prefsBusy || (permHealth && !permHealth.projects_ok)}
                onChange={(e) => saveIssuePrefs({ roadmap_projects_v2: e.target.checked })}
              />
              Publish to Projects v2 (needs organization_projects write)
            </label>
            <div className="opa-muted">
              Gate labels: {(effective.ai_issue_labels || ['AI']).join(', ')}
            </div>
          </div>
        )}
      </Panel>

      {runId && (
        <Panel title={`Run ${runId}`} icon={<FiRefreshCw />}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <StatusPill tone={['completed', 'skipped'].includes(runDetail?.run?.status) ? 'ok' : (['failed', 'error'].includes(runDetail?.run?.status) ? 'error' : 'neutral')}>
              {runDetail?.run?.status || 'queued'}
            </StatusPill>
            <Link to={`/security/jobs/${encodeURIComponent(runId)}`}>Open job</Link>
          </div>
          {discovery && (
            <details open>
              <summary>Discovery</summary>
              <pre style={{ fontSize: 12, overflow: 'auto' }}>{JSON.stringify(discovery, null, 2)}</pre>
            </details>
          )}
          {competitor && (
            <details>
              <summary>Competitor analysis</summary>
              <pre style={{ fontSize: 12, overflow: 'auto' }}>{JSON.stringify(competitor, null, 2)}</pre>
            </details>
          )}
          {roadmap && (
            <details open>
              <summary>Roadmap</summary>
              <pre style={{ fontSize: 12, overflow: 'auto' }}>{JSON.stringify(roadmap, null, 2)}</pre>
            </details>
          )}
          {publishResult && (
            <details open>
              <summary>Publish result</summary>
              <pre style={{ fontSize: 12, overflow: 'auto' }}>{JSON.stringify(publishResult, null, 2)}</pre>
            </details>
          )}
        </Panel>
      )}
    </div>
  )
}
