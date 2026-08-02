import React, { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { FiCloud, FiCpu, FiGitPullRequest, FiRefreshCw, FiShield, FiCheckCircle } from 'react-icons/fi'
import { Panel, Badge, StatusPill, DataTable } from '../ui'
import { connectorLabel } from '../../hooks/useConnectors'
import { apiUrl } from '../../utils/apiBase'
import TriStateSelect from './TriStateSelect'
import { inheritOptionLabel } from '../../utils/scmRuns'

const LEVELS = [
  { value: 'org', label: 'Organization' },
  { value: 'installation', label: 'Installation' },
  { value: 'repo', label: 'Repository' },
]

const TRIGGER_OPTS = [
  { value: '', label: 'Inherit' },
  { value: 'every_push', label: 'Every push' },
  { value: 'pr_open', label: 'PR open' },
  { value: 'on_demand', label: 'On demand' },
  { value: 'cron', label: 'Cron' },
]

const AUTOFIX_OPTS = [
  { value: '', label: 'Inherit' },
  { value: 'off', label: 'Off' },
  { value: 'suggest', label: 'Suggest' },
  { value: 'branch', label: 'Branch' },
]

const SEV_OPTS = [
  { value: '', label: 'Inherit' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

function PrefRow({ label, hint, children }) {
  return (
    <label className="opa-agents-pref-row">
      <span className="opa-agents-pref-label">
        <span className="cell-strong">{label}</span>
        {hint ? <span className="opa-muted" style={{ fontSize: 11 }}>{hint}</span> : null}
      </span>
      <span className="opa-agents-pref-control">{children}</span>
    </label>
  )
}

function storedTri(prefs, field) {
  if (!prefs || !(field in prefs)) return null
  const v = prefs[field]
  if (v === null || v === undefined) return null
  return v
}

export default function AgentsTab({
  connectors = [],
  toast,
  activeConnector = '',
  onConnectorChange,
}) {
  const [level, setLevel] = useState('repo')
  const [connectorId, setConnectorId] = useState(activeConnector || '')
  const [repo, setRepo] = useState('')
  const [watchedRepos, setWatchedRepos] = useState([])
  const [payload, setPayload] = useState(null)
  const [draft, setDraft] = useState({})
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showEffective, setShowEffective] = useState(false)
  const [candidates, setCandidates] = useState([])
  const [candBusy, setCandBusy] = useState('')

  useEffect(() => {
    if (activeConnector && !connectorId) setConnectorId(activeConnector)
  }, [activeConnector, connectorId])

  const loadWatched = useCallback(async () => {
    const cid = connectorId || activeConnector
    if (!cid) {
      setWatchedRepos([])
      return
    }
    try {
      const { data } = await axios.get(apiUrl(`/api/connectors/${encodeURIComponent(cid)}/watched`))
      const rows = data?.watched || data?.repos || []
      setWatchedRepos(Array.isArray(rows) ? rows : [])
    } catch {
      setWatchedRepos([])
    }
  }, [connectorId, activeConnector])

  useEffect(() => { loadWatched() }, [loadWatched])

  const loadPrefs = useCallback(async () => {
    setLoading(true)
    try {
      const params = { level }
      if (level === 'installation' || level === 'repo') {
        params.connector_id = connectorId || activeConnector || ''
      }
      if (level === 'repo') params.repo = repo
      if (level === 'org') {
        /* scope from tenant headers */
      }
      const { data } = await axios.get(apiUrl('/api/agents/prefs'), { params })
      setPayload(data)
      setDraft(data?.prefs && typeof data.prefs === 'object' ? { ...data.prefs } : {})
    } catch (e) {
      setPayload(null)
      setDraft({})
      toast?.push?.(
        typeof e.response?.data === 'string' ? e.response.data : (e.message || 'Failed to load agent prefs'),
        { tone: 'error' },
      )
    } finally {
      setLoading(false)
    }
  }, [level, connectorId, activeConnector, repo, toast])

  useEffect(() => { loadPrefs() }, [loadPrefs])

  const loadCandidates = useCallback(async () => {
    try {
      const params = repo ? { repo_full_name: repo } : {}
      const { data } = await axios.get(apiUrl('/api/scm/contexts'), { params })
      const list = (data?.contexts || []).filter((c) => String(c.status || '').toLowerCase() === 'candidate')
      setCandidates(list)
    } catch {
      setCandidates([])
    }
  }, [repo])

  useEffect(() => { loadCandidates() }, [loadCandidates])

  const setField = (field, value) => {
    setDraft((prev) => {
      const next = { ...prev }
      if (value === null || value === undefined) delete next[field]
      else next[field] = value
      return next
    })
  }

  const save = async () => {
    setBusy(true)
    try {
      const prefs = {}
      // Send all known fields: present values + null for cleared (vs prior payload)
      const prior = payload?.prefs && typeof payload.prefs === 'object' ? payload.prefs : {}
      const keys = new Set([...Object.keys(prior), ...Object.keys(draft)])
      for (const k of keys) {
        if (k in draft) prefs[k] = draft[k]
        else prefs[k] = null
      }
      const body = {
        level,
        prefs,
        connector_id: connectorId || activeConnector || '',
        repo: repo || '',
      }
      if (level === 'installation') body.scope_key = body.connector_id
      if (level === 'repo') body.scope_key = repo
      const { data } = await axios.put(apiUrl('/api/agents/prefs'), body)
      setPayload((p) => ({
        ...(p || {}),
        prefs: data.prefs || draft,
        effective: data.effective || p?.effective,
        sources: data.sources || p?.sources,
      }))
      setDraft(data.prefs && typeof data.prefs === 'object' ? { ...data.prefs } : { ...draft })
      toast?.push?.('Agent preferences saved', { tone: 'neutral' })
    } catch (e) {
      toast?.push?.(
        typeof e.response?.data === 'string' ? e.response.data : (e.message || 'Save failed'),
        { tone: 'error' },
      )
    } finally {
      setBusy(false)
    }
  }

  const promoteReject = async (id, action) => {
    setCandBusy(`${id}:${action}`)
    try {
      await axios.post(apiUrl(`/api/scm/contexts/${encodeURIComponent(id)}/${action}`))
      toast?.push?.(action === 'promote' ? 'Rule promoted' : 'Candidate rejected', { tone: 'neutral' })
      await loadCandidates()
    } catch (e) {
      toast?.push?.(
        typeof e.response?.data === 'string' ? e.response.data : (e.message || `${action} failed`),
        { tone: 'error' },
      )
    } finally {
      setCandBusy('')
    }
  }

  const effective = payload?.effective || {}
  const sources = payload?.sources || {}
  const cloudOn = !!effective.cloud_enabled
  const checkupOn = !!effective.checkup_enabled
  const sandboxBanner = cloudOn || checkupOn || String(effective.autofix_mode || '') === 'branch'

  const stringSelect = (field, options) => {
    const inherit = inheritOptionLabel(field, effective, sources)
    const opts = options.map((o) => (
      o.value === '' ? { ...o, label: inherit } : o
    ))
    return (
      <TriStateSelect
        field={field}
        value={storedTri(draft, field)}
        onChange={(v) => setField(field, v)}
        effective={effective}
        sources={sources}
        disabled={busy || loading}
        options={opts}
      />
    )
  }

  const boolSelect = (field) => (
    <TriStateSelect
      field={field}
      value={storedTri(draft, field)}
      onChange={(v) => setField(field, v)}
      effective={effective}
      sources={sources}
      disabled={busy || loading}
    />
  )

  const draftSkipReason = useMemo(() => {
    if (effective.review_draft_prs) return null
    return 'Review Draft PRs is Off — Bugbot skips draft PRs (security still runs). Ready-for-review re-triggers.'
  }, [effective.review_draft_prs])

  return (
    <div className="opa-stack opa-agents-tab" style={{ gap: 14 }}>
      {sandboxBanner ? (
        <div className="opa-agents-killstrip" role="status">
          <strong>Sandbox required</strong>
          {' '}— Cloud / checkup / branch autofix need{' '}
          <code>OPA_JOB_SANDBOX=docker</code>. Cap <code>SANDBOX_REQUIRED</code> is pinned for repo-code stages.
          Run graph kill-switch: <code>OPA_AGENTS_RUN_GRAPH=0</code> falls back to the legacy monolith.
        </div>
      ) : (
        <div className="opa-agents-killstrip muted" role="status">
          Job sandbox: set <code>OPA_JOB_SANDBOX=docker</code> when enabling Cloud or checkup.
          Disable the run graph with <code>OPA_AGENTS_RUN_GRAPH=0</code> (legacy path).
        </div>
      )}

      <Panel
        title="Agent preferences"
        icon={<FiCpu />}
        loading={loading}
        actions={(
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="opa-btn ghost" onClick={loadPrefs} disabled={loading}>
              <FiRefreshCw size={12} /> Refresh
            </button>
            <button type="button" className="opa-btn primary" onClick={save} disabled={busy || loading}>
              Save
            </button>
          </div>
        )}
      >
        <div className="opa-agents-scope">
          <label className="opa-agents-filter">
            <span className="opa-muted">Scope</span>
            <select
              className="opa-select"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              aria-label="Preference scope"
            >
              {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </label>
          {(level === 'installation' || level === 'repo') ? (
            <label className="opa-agents-filter" style={{ minWidth: 220 }}>
              <span className="opa-muted">Installation</span>
              <select
                className="opa-select"
                value={connectorId || activeConnector || ''}
                onChange={(e) => {
                  const id = e.target.value
                  setConnectorId(id)
                  onConnectorChange?.(id)
                }}
                aria-label="Installation connector"
              >
                <option value="">— Select connector —</option>
                {connectors.map((c) => (
                  <option key={c.id} value={c.id}>{connectorLabel(c)}</option>
                ))}
              </select>
            </label>
          ) : null}
          {level === 'repo' ? (
            <label className="opa-agents-filter">
              <span className="opa-muted">Repository</span>
              <select
                className="opa-select"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                aria-label="Repository scope"
              >
                <option value="">Select repo…</option>
                {watchedRepos.map((r) => {
                  const name = r.repo_full_name || r.full_name || r.name || ''
                  return name ? <option key={name} value={name}>{name}</option> : null
                })}
              </select>
            </label>
          ) : null}
        </div>

        {draftSkipReason ? (
          <p className="opa-muted" style={{ fontSize: 12, margin: '8px 0 0' }}>{draftSkipReason}</p>
        ) : null}

        <div className="opa-agents-cards">
          <section className="opa-agents-card">
            <header><FiGitPullRequest size={14} /> Bugbot</header>
            <p className="opa-muted" style={{ fontSize: 12, marginTop: 0 }}>
              AI code review on pull requests — findings, summaries, and incremental re-review.
            </p>
            <PrefRow label="Trigger Mode" hint="When Bugbot runs on watched repos">
              {stringSelect('trigger_mode', TRIGGER_OPTS)}
            </PrefRow>
            <PrefRow label="Review Draft PRs">
              {boolSelect('review_draft_prs')}
            </PrefRow>
            <PrefRow label="PR Summaries">
              {boolSelect('pr_summaries')}
            </PrefRow>
            <PrefRow label="Post PR risk score">
              {boolSelect('post_pr_risk_score')}
            </PrefRow>
            <PrefRow label="Incremental Review">
              {boolSelect('incremental_review')}
            </PrefRow>
            <PrefRow label="Context-Aware Analysis">
              {boolSelect('context_aware_analysis')}
            </PrefRow>
            <PrefRow label="AI Reviewer Aware">
              {boolSelect('ai_reviewer_aware')}
            </PrefRow>
            <PrefRow label="Max review units" hint="Budget per run (not billing)">
              <input
                className="opa-input"
                type="number"
                min={1}
                max={50}
                disabled={busy || loading}
                placeholder={String(effective.bugbot_max_units ?? 10)}
                value={draft.bugbot_max_units ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setField('bugbot_max_units', v === '' ? null : Number(v))
                }}
              />
            </PrefRow>
          </section>

          <section className="opa-agents-card">
            <header><FiShield size={14} /> Security</header>
            <p className="opa-muted" style={{ fontSize: 12, marginTop: 0 }}>
              Secrets, SAST-lite, and gate checks — separate from Bugbot so scanners always run.
            </p>
            <PrefRow label="Automated PR Reviews">
              {boolSelect('security_auto_pr_reviews')}
            </PrefRow>
            <PrefRow label="Inline Findings" hint="Off by default — posts comments on real PRs">
              {boolSelect('inline_findings')}
            </PrefRow>
            <PrefRow label="Repository Rules — project">
              {boolSelect('repository_rules')}
            </PrefRow>
            <PrefRow label="Repository Rules — automatic learned" hint="Candidates only; promote to activate">
              {boolSelect('learned_rules')}
            </PrefRow>
          </section>

          <section className="opa-agents-card">
            <header><FiCheckCircle size={14} /> Approval</header>
            <p className="opa-muted" style={{ fontSize: 12, marginTop: 0 }}>
              Deterministic approve / comment from the shared findings ledger — never from model confidence alone.
            </p>
            <PrefRow label="Automated PR Approval">
              {boolSelect('auto_approve')}
            </PrefRow>
            <PrefRow label="Reviewer Routing">
              {boolSelect('reviewer_routing')}
            </PrefRow>
            <PrefRow label="Policy-Aware Decisions" hint="Base-ref policy path">
              <input
                className="opa-input"
                type="text"
                disabled={busy || loading}
                placeholder={effective.policy_file_path || '.opa/approval-policy.json'}
                value={draft.policy_file_path ?? ''}
                onChange={(e) => setField('policy_file_path', e.target.value === '' ? null : e.target.value)}
              />
            </PrefRow>
            <PrefRow label="Zero Workflow Changes">
              <Badge title="Enforced: legacy check names, .github/** deny, workflows never requested">
                Enforced
              </Badge>
            </PrefRow>
          </section>

          <section className="opa-agents-card">
            <header><FiCloud size={14} /> Cloud</header>
            <p className="opa-muted" style={{ fontSize: 12, marginTop: 0 }}>
              Autofix proposals and optional fix branches — gated patch, never trusts the agent working tree.
            </p>
            <PrefRow label="Cloud enabled" hint="Capability — inherit fails closed">
              {boolSelect('cloud_enabled')}
            </PrefRow>
            <PrefRow label="Autofix Mode">
              {stringSelect('autofix_mode', AUTOFIX_OPTS)}
            </PrefRow>
            <PrefRow label="Autofix Severity Threshold">
              {stringSelect('autofix_severity_threshold', SEV_OPTS)}
            </PrefRow>
            <PrefRow label="Run tests before land" hint="Requires docker sandbox">
              {boolSelect('cloud_run_tests')}
            </PrefRow>
            <PrefRow label="Checkup enabled" hint="AI-planned repo tests — capability">
              {boolSelect('checkup_enabled')}
            </PrefRow>
          </section>
        </div>

        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className="opa-btn ghost"
            onClick={() => setShowEffective((v) => !v)}
          >
            {showEffective ? 'Hide' : 'Show'} effective prefs
          </button>
          {showEffective ? (
            <div className="opa-agents-effective">
              <p className="opa-muted" style={{ fontSize: 12, marginTop: 8 }}>
                Resolved values and where each field came from — useful when Bugbot skips a draft PR.
              </p>
              <DataTable
                columns={[
                  { key: 'field', header: 'Field', render: (r) => <span className="opa-mono" style={{ fontSize: 11 }}>{r.field}</span> },
                  {
                    key: 'value', header: 'Effective',
                    render: (r) => (
                      <span className="opa-mono" style={{ fontSize: 11 }}>
                        {typeof r.value === 'boolean' ? (r.value ? 'On' : 'Off') : String(r.value ?? '—')}
                      </span>
                    ),
                  },
                  {
                    key: 'source', header: 'Source',
                    render: (r) => <Badge>{r.source || 'builtin'}</Badge>,
                  },
                ]}
                rows={Object.keys(effective).sort().map((field) => ({
                  field,
                  value: effective[field],
                  source: sources[field] || 'builtin',
                }))}
                rowKey={(r) => r.field}
                maxHeight={280}
              />
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel
        title="Repository Rules — learned candidates"
        icon={<FiShield />}
        empty={!candidates.length}
        emptyText={effective.learned_rules
          ? 'No learned candidates yet — high/critical findings can propose rules when learned rules are on.'
          : 'Turn on “Repository Rules — automatic learned” to mine candidates from review findings.'}
        actions={(
          <button type="button" className="opa-btn ghost" onClick={loadCandidates}>
            <FiRefreshCw size={12} /> Refresh
          </button>
        )}
      >
        <DataTable
          columns={[
            { key: 'title', header: 'Title', render: (r) => <span className="cell-strong">{r.title}</span> },
            { key: 'repo_full_name', header: 'Repo', render: (r) => <span className="opa-mono" style={{ fontSize: 11 }}>{r.repo_full_name || '—'}</span> },
            {
              key: 'kind', header: 'Kind',
              render: (r) => <Badge>{r.kind || 'should'}</Badge>,
            },
            {
              key: 'status', header: 'Status',
              render: (r) => <StatusPill tone="warn">{r.status || 'candidate'}</StatusPill>,
            },
            {
              key: 'actions', header: '',
              render: (r) => (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    className="opa-btn primary"
                    disabled={!!candBusy}
                    onClick={() => promoteReject(r.id, 'promote')}
                  >
                    Promote
                  </button>
                  <button
                    type="button"
                    className="opa-btn ghost"
                    disabled={!!candBusy}
                    onClick={() => promoteReject(r.id, 'reject')}
                  >
                    Reject
                  </button>
                </div>
              ),
            },
          ]}
          rows={candidates}
          rowKey={(r) => r.id}
          maxHeight={320}
        />
      </Panel>
    </div>
  )
}
