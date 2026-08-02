import React, { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { FiCloud, FiCpu, FiGitPullRequest, FiRefreshCw, FiShield, FiCheckCircle } from 'react-icons/fi'
import { Panel, Badge, StatusPill, DataTable } from '../ui'
import { connectorLabel } from '../../hooks/useConnectors'
import { apiUrl } from '../../utils/apiBase'
import TriStateSelect from './TriStateSelect'
import PrefRow from './PrefRow'
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

const DOMAINS = [
  {
    id: 'bugbot',
    label: 'Bugbot',
    icon: FiGitPullRequest,
    blurb: 'AI code review on pull requests — findings, summaries, and incremental re-review.',
    fields: [
      'trigger_mode', 'review_draft_prs', 'pr_summaries', 'post_pr_risk_score',
      'incremental_review', 'context_aware_analysis', 'ai_reviewer_aware', 'bugbot_max_units',
    ],
  },
  {
    id: 'security',
    label: 'Security',
    icon: FiShield,
    blurb: 'Secrets, SAST-lite, and gate checks — separate from Bugbot so scanners always run.',
    fields: ['security_auto_pr_reviews', 'inline_findings', 'repository_rules', 'learned_rules'],
  },
  {
    id: 'approval',
    label: 'Approval',
    icon: FiCheckCircle,
    blurb: 'Deterministic approve / comment from the shared findings ledger — never from model confidence alone.',
    fields: ['auto_approve', 'reviewer_routing', 'policy_file_path'],
  },
  {
    id: 'cloud',
    label: 'Cloud',
    icon: FiCloud,
    blurb: 'Autofix proposals and optional fix branches — gated patch, never trusts the agent working tree.',
    fields: ['cloud_enabled', 'autofix_mode', 'autofix_severity_threshold', 'cloud_run_tests', 'checkup_enabled'],
  },
]

function storedTri(prefs, field) {
  if (!prefs || !(field in prefs)) return null
  const v = prefs[field]
  if (v === null || v === undefined) return null
  return v
}

function domainPulse(id, effective) {
  if (id === 'bugbot') {
    return { on: true, tone: 'ok', detail: effective.trigger_mode || 'pr_open' }
  }
  if (id === 'security') {
    const on = !!effective.security_auto_pr_reviews
    return { on, tone: on ? 'ok' : 'warn', detail: effective.inline_findings ? 'inline' : 'summary' }
  }
  if (id === 'approval') {
    const on = !!effective.auto_approve
    return { on, tone: on ? 'warn' : 'info', detail: on ? 'auto' : 'manual' }
  }
  if (id === 'cloud') {
    const on = !!effective.cloud_enabled
    return { on, tone: on ? 'warn' : 'neutral', detail: effective.autofix_mode || 'off' }
  }
  return { on: false, tone: 'neutral', detail: '' }
}

function overrideCount(domain, draft) {
  return domain.fields.filter((f) => {
    if (!(f in draft)) return false
    const v = draft[f]
    return v !== null && v !== undefined
  }).length
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
  const [domainId, setDomainId] = useState('bugbot')

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
  const activeDomain = DOMAINS.find((d) => d.id === domainId) || DOMAINS[0]
  const ActiveIcon = activeDomain.icon
  const pulse = domainPulse(activeDomain.id, effective)

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

  const domainFields = (() => {
    if (activeDomain.id === 'bugbot') {
      return (
        <>
          <PrefRow label="Trigger Mode" hint="When Bugbot starts relative to PR activity on watched repos.">
            {stringSelect('trigger_mode', TRIGGER_OPTS)}
          </PrefRow>
          <PrefRow
            label="Review Draft PRs"
            hint="Include draft pull requests in automatic Bugbot runs."
            on={!!effective.review_draft_prs}
            effectOn="Draft PRs enqueue Bugbot like ready PRs."
            effectOff="Drafts are skipped until marked ready for review."
          >
            {boolSelect('review_draft_prs')}
          </PrefRow>
          <PrefRow
            label="PR Summaries"
            hint="Post a résumé comment summarizing findings and gate status."
            on={!!effective.pr_summaries}
            effectOn="A summary comment is updated on each completed run."
            effectOff="Only check runs / inline comments (if enabled) are used."
          >
            {boolSelect('pr_summaries')}
          </PrefRow>
          <PrefRow
            label="Post PR risk score"
            hint="Publish the numeric risk score on the check summary and résumé."
            on={!!effective.post_pr_risk_score}
            effectOn="Risk score and factors are visible on the PR check."
            effectOff="Score stays internal to the Dashboard job detail."
          >
            {boolSelect('post_pr_risk_score')}
          </PrefRow>
          <PrefRow
            label="Incremental Review"
            hint="Re-review only files changed since the last successful Bugbot SHA."
            on={!!effective.incremental_review}
            effectOn="Faster follow-up pushes — prior clean files are skipped."
            effectOff="Every synchronize re-analyzes the full PR diff."
          >
            {boolSelect('incremental_review')}
          </PrefRow>
          <PrefRow
            label="Context-Aware Analysis"
            hint="Pull related symbols/files beyond the raw diff for higher-signal findings."
            on={!!effective.context_aware_analysis}
            effectOn="Uses extra context units from the review budget."
            effectOff="Review stays strictly within the PR patch."
          >
            {boolSelect('context_aware_analysis')}
          </PrefRow>
          <PrefRow
            label="AI Reviewer Aware"
            hint="Treat existing AI review comments as context to avoid duplicate noise."
            on={!!effective.ai_reviewer_aware}
            effectOn="Dedupes against prior OPA / bot threads on the PR."
            effectOff="May restate findings already discussed on the PR."
          >
            {boolSelect('ai_reviewer_aware')}
          </PrefRow>
          <PrefRow label="Max review units" hint="Soft budget per Bugbot run (not a billing meter).">
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
        </>
      )
    }
    if (activeDomain.id === 'security') {
      return (
        <>
          <PrefRow
            label="Automated PR Reviews"
            hint="Run the Security / AppSec gate child on watched PR events."
            on={!!effective.security_auto_pr_reviews}
            effectOn="Prepare → security gate runs on each eligible PR job."
            effectOff="Security child is skipped — only AI/manual paths remain."
          >
            {boolSelect('security_auto_pr_reviews')}
          </PrefRow>
          <PrefRow
            label="Inline Findings"
            hint="Post line comments on the real GitHub PR (off by default)."
            on={!!effective.inline_findings}
            effectOn="Findings appear as review comments at file:line."
            effectOff="Findings stay in Dashboard + check summary only."
          >
            {boolSelect('inline_findings')}
          </PrefRow>
          <PrefRow
            label="Repository Rules — project"
            hint="Apply project-authored reviewer context / policy rules."
            on={!!effective.repository_rules}
            effectOn="Promoted context rules influence routing and severity."
            effectOff="Only built-in scanners and Bugbot heuristics apply."
          >
            {boolSelect('repository_rules')}
          </PrefRow>
          <PrefRow
            label="Repository Rules — automatic learned"
            hint="Allow auto-learned candidate rules (still need promote to activate)."
            on={!!effective.learned_rules}
            effectOn="Candidates can be suggested from recurring findings."
            effectOff="No automatic learning — only manually authored rules."
          >
            {boolSelect('learned_rules')}
          </PrefRow>
        </>
      )
    }
    if (activeDomain.id === 'approval') {
      return (
        <>
          <PrefRow
            label="Automated PR Approval"
            hint="Let the approval child auto-approve when score and policy allow."
            on={!!effective.auto_approve}
            effectOn="Eligible PRs complete approval without a human click."
            effectOff="Approval stays waiting / blocked for an operator."
          >
            {boolSelect('auto_approve')}
          </PrefRow>
          <PrefRow
            label="Reviewer Routing"
            hint="Route to human reviewer groups from linked contexts when policy asks."
            on={!!effective.reviewer_routing}
            effectOn="Matching groups are requested on GitHub when needed."
            effectOff="No automatic human reviewer requests from OPA."
          >
            {boolSelect('reviewer_routing')}
          </PrefRow>
          <PrefRow label="Policy-Aware Decisions" hint="Path on the base ref for the approval policy document.">
            <input
              className="opa-input"
              type="text"
              disabled={busy || loading}
              placeholder={effective.policy_file_path || '.opa/approval-policy.json'}
              value={draft.policy_file_path ?? ''}
              onChange={(e) => setField('policy_file_path', e.target.value === '' ? null : e.target.value)}
            />
          </PrefRow>
          <PrefRow label="Zero Workflow Changes" hint="Hard guard: never edit .github workflows; keep legacy check names.">
            <Badge title="Enforced: legacy check names, .github/** deny, workflows never requested">
              Enforced
            </Badge>
          </PrefRow>
        </>
      )
    }
    return (
      <>
        <PrefRow
          label="Cloud enabled"
          hint="Capability flag — unset/inherit fails closed (no cloud child)."
          on={!!effective.cloud_enabled}
          effectOn="Cloud child may run after Bugbot when autofix mode allows."
          effectOff="Cloud/autofix actions are disabled for this scope."
        >
          {boolSelect('cloud_enabled')}
        </PrefRow>
        <PrefRow label="Autofix Mode" hint="off = never · suggest = proposal only · branch = open a fix PR.">
          {stringSelect('autofix_mode', AUTOFIX_OPTS)}
        </PrefRow>
        <PrefRow label="Autofix Severity Threshold" hint="Minimum finding severity that may trigger autofix work.">
          {stringSelect('autofix_severity_threshold', SEV_OPTS)}
        </PrefRow>
        <PrefRow
          label="Run tests before land"
          hint="Execute project tests in the docker sandbox before proposing a land."
          on={!!effective.cloud_run_tests}
          effectOn="Autofix waits on sandbox tests — slower, safer."
          effectOff="Patches proposed without the extra test gate."
        >
          {boolSelect('cloud_run_tests')}
        </PrefRow>
        <PrefRow
          label="Checkup enabled"
          hint="Allow AI-planned repository health tests (separate from PR autofix)."
          on={!!effective.checkup_enabled}
          effectOn="Checkup jobs can be scheduled for this scope."
          effectOff="No checkup planning runs."
        >
          {boolSelect('checkup_enabled')}
        </PrefRow>
      </>
    )
  })()

  return (
    <div className="opa-stack opa-agents-tab">
      {sandboxBanner ? (
        <div className={`opa-agents-killstrip${sandboxBanner ? ' hot' : ''}`} role="status">
          <strong>Sandbox required</strong>
          <span>
            Cloud / checkup / branch autofix need <code>OPA_JOB_SANDBOX=docker</code>.
            Cap <code>SANDBOX_REQUIRED</code> is pinned for repo-code stages.
            Run graph kill-switch: <code>OPA_AGENTS_RUN_GRAPH=0</code> falls back to the legacy monolith.
          </span>
        </div>
      ) : (
        <div className="opa-agents-killstrip muted" role="status">
          <strong>Job sandbox</strong>
          <span>
            Set <code>OPA_JOB_SANDBOX=docker</code> when enabling Cloud or checkup.
            Disable the run graph with <code>OPA_AGENTS_RUN_GRAPH=0</code> (legacy path).
          </span>
        </div>
      )}

      <Panel
        title="Agent preferences"
        icon={<FiCpu />}
        loading={loading}
        actions={(
          <div className="opa-agents-panel-actions">
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
            <label className="opa-agents-filter opa-agents-filter-wide">
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
            <label className="opa-agents-filter opa-agents-filter-grow">
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
          <Badge>inherit · override</Badge>
        </div>

        {draftSkipReason ? (
          <p className="opa-agents-draft-note opa-muted">{draftSkipReason}</p>
        ) : null}

        <div className="opa-agents-split">
          <aside className="opa-agents-domain-rail" aria-label="Agent domains">
            {DOMAINS.map((d) => {
              const Icon = d.icon
              const p = domainPulse(d.id, effective)
              const overrides = overrideCount(d, draft)
              return (
                <button
                  key={d.id}
                  type="button"
                  className={`opa-agents-domain-item${domainId === d.id ? ' active' : ''}`}
                  onClick={() => setDomainId(d.id)}
                  aria-pressed={domainId === d.id}
                >
                  <span className="opa-agents-domain-top">
                    <StatusPill tone={p.tone}>{p.on ? 'on' : 'off'}</StatusPill>
                    <span className="opa-agents-domain-label">
                      <Icon size={13} aria-hidden="true" />
                      {d.label}
                    </span>
                  </span>
                  <span className="opa-agents-domain-meta">
                    <span className="opa-mono opa-agents-domain-detail">{p.detail}</span>
                    {overrides > 0 ? (
                      <Badge>{overrides} ov</Badge>
                    ) : (
                      <span className="opa-muted opa-agents-domain-inherit">inherit</span>
                    )}
                  </span>
                </button>
              )
            })}
          </aside>

          <div className="opa-agents-detail">
            <header className="opa-agents-detail-head">
              <div>
                <h3 className="opa-agents-detail-title">
                  <ActiveIcon size={14} aria-hidden="true" />
                  {activeDomain.label}
                </h3>
                <p className="opa-agents-detail-blurb opa-muted">{activeDomain.blurb}</p>
              </div>
              <Badge title={`Effective ${pulse.detail}`}>
                {pulse.on ? 'active' : 'quiet'} · {pulse.detail}
              </Badge>
            </header>
            <div className="opa-agents-detail-body">
              {domainFields}
            </div>
          </div>
        </div>

        <div className="opa-agents-effective-wrap">
          <button
            type="button"
            className="opa-btn ghost"
            onClick={() => setShowEffective((v) => !v)}
          >
            {showEffective ? 'Hide' : 'Show'} effective prefs
          </button>
          {showEffective ? (
            <div className="opa-agents-effective">
              <p className="opa-muted opa-agents-effective-lead">
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
                <div className="opa-agents-cand-actions">
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
