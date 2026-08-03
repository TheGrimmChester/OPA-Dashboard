import React, { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Link, useParams } from 'react-router-dom'
import { FiChevronLeft, FiGitPullRequest, FiRefreshCw, FiShield, FiX } from 'react-icons/fi'
import { apiUrl } from '../utils/apiBase'
import { Panel, EntityHeader, StatusPill, Badge } from '../components/ui'
import { useToast } from '../components/ui/Toast'
import { scmJobHref } from '../utils/entityLinks'
import { agentKindLabel, sortRunChildren } from '../utils/scmRuns'
import './OPAReviewJob.css'

const SEV_RANK = { blocker: 5, critical: 4, high: 3, medium: 2, low: 1, info: 0 }

function sevTone(sev) {
  const v = String(sev || '').toLowerCase()
  if (v === 'blocker' || v === 'critical') return 'error'
  if (v === 'high') return 'alert'
  if (v === 'medium') return 'warn'
  if (v === 'info' || v === 'pass' || v === 'ok' || v === 'clean') return 'ok'
  if (v === 'low') return 'neutral'
  return 'neutral'
}

function statusTone(status) {
  switch (String(status || '').toLowerCase()) {
    case 'completed': return 'ok'
    case 'running': return 'warn'
    case 'queued': return 'info'
    case 'waiting':
    case 'cancelled': return 'neutral'
    case 'failed':
    case 'error': return 'error'
    default: return 'neutral'
  }
}

function githubWebOrigin(connector) {
  let meta = {}
  try {
    meta = typeof connector?.meta_json === 'string'
      ? JSON.parse(connector.meta_json || '{}')
      : (connector?.meta_json || {})
  } catch {
    meta = {}
  }
  const raw = String(meta.html_url_base || meta.github_host || meta.web_url || meta.base_url || meta.host || '').trim()
  if (!raw) return 'https://github.com'
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    const u = new URL(withScheme)
    if (u.hostname === 'api.github.com') return 'https://github.com'
    u.pathname = ''
    u.search = ''
    u.hash = ''
    return u.origin
  } catch {
    return 'https://github.com'
  }
}

function repoHref(job, connectors = []) {
  const direct = job?.repo_url || job?.summary?.repo_url || job?.summary?.html_repo_url
  if (direct) return String(direct)
  const repo = String(job?.repo_full_name || '').trim()
  if (!repo || !repo.includes('/')) return ''
  const conn = connectors.find((c) => c.id === job.connector_id)
  return `${githubWebOrigin(conn)}/${repo}`
}

function prHref(job, connectors = []) {
  const direct = job?.pr_url || job?.html_url || job?.summary?.pr_url || job?.summary?.html_url
  if (direct && /\/pull\/\d+/.test(String(direct))) return String(direct)
  const repo = String(job?.repo_full_name || '').trim()
  const pr = Number(job?.pr_number || 0)
  if (!repo || !repo.includes('/') || pr <= 0) return ''
  const conn = connectors.find((c) => c.id === job.connector_id)
  return `${githubWebOrigin(conn)}/${repo}/pull/${pr}`
}

function ExtLink({ href, children, className, title }) {
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" className={className} title={title || href}>{children}</a>
    : <span className={className}>{children}</span>
}

function findingKey(f, i) {
  return f?.finding_key || `${f?.file || ''}:${f?.line || i}`
}

function evidenceFromJob(job) {
  if (!job) return null
  if (job.evidence && typeof job.evidence === 'object') return job.evidence
  const sum = job.summary && typeof job.summary === 'object' ? job.summary : {}
  if (sum.evidence && typeof sum.evidence === 'object') return sum.evidence
  return null
}

function sectionFlags(ev) {
  const s = ev?.sections || {}
  return {
    context: !!(s.has_context || ev?.context?.checkout_path || ev?.context?.prefs || ev?.context?.brief_preview),
    chat: !!(s.has_chat || ev?.chat?.transcript || ev?.chat?.model || ev?.chat?.prompt_preview),
    results: !!(s.has_results || (ev?.results && Object.keys(ev.results).length > 1)),
    posts: !!(s.has_posts || (Array.isArray(ev?.posts) && ev.posts.length)),
  }
}

function gateSummary(job) {
  const summary = job?.summary && typeof job.summary === 'object' ? job.summary : {}
  const gate = summary.gate && typeof summary.gate === 'object' ? summary.gate : {}
  const ai = summary.ai && typeof summary.ai === 'object' ? summary.ai : {}
  return {
    gateStatus: String(gate.status || '').toLowerCase(),
    minSeverity: String(gate.min_severity || '').toLowerCase(),
    scope: String(gate.scope || ''),
    aiStatus: String(ai.status || '').toLowerCase(),
  }
}

export default function OPAReviewJob() {
  const { jobId: rawId } = useParams()
  const jobId = decodeURIComponent(rawId || '')
  const toast = useToast()
  const [job, setJob] = useState(null)
  const [connectors, setConnectors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [findingSev, setFindingSev] = useState('')
  const [findingQ, setFindingQ] = useState('')
  const [liveLog, setLiveLog] = useState('')
  const [agentMsg, setAgentMsg] = useState('')
  const liveLogRef = React.useRef(null)

  const load = useCallback(async ({ soft = false } = {}) => {
    if (!jobId) return
    if (!soft) {
      setLoading(true)
      setError('')
    }
    try {
      const [{ data }, connRes] = await Promise.all([
        axios.get(apiUrl(`/api/scm/jobs/${encodeURIComponent(jobId)}`)),
        soft
          ? Promise.resolve({ data: null })
          : axios.get(apiUrl('/api/connectors')).catch(() => ({ data: null })),
      ])
      setJob(data)
      if (!soft) {
        const list = connRes?.data?.connectors || connRes?.data || []
        setConnectors(Array.isArray(list) ? list : [])
      }
    } catch (e) {
      if (!soft) {
        setError(typeof e.response?.data === 'string'
          ? e.response.data
          : (e.response?.data?.error || e.message || 'failed to load job'))
        setJob(null)
      }
    } finally {
      if (!soft) setLoading(false)
    }
  }, [jobId])

  useEffect(() => { load() }, [load])

  const jobActive = ['queued', 'waiting', 'running'].includes(String(job?.status || '').toLowerCase())

  useEffect(() => {
    if (!jobId || !jobActive) return undefined
    const t = setInterval(() => { load({ soft: true }) }, 2000)
    return () => clearInterval(t)
  }, [jobId, jobActive, load])

  const findings = useMemo(() => {
    if (!job) return []
    if (Array.isArray(job.findings)) return job.findings
    return Array.isArray(job.summary?.ai?.findings) ? job.summary.ai.findings : []
  }, [job])

  const filteredFindings = useMemo(() => {
    const q = findingQ.trim().toLowerCase()
    return findings.filter((f) => {
      const sev = String(f?.severity || '').toLowerCase()
      if (findingSev === 'blocker|critical') {
        if (sev !== 'blocker' && sev !== 'critical') return false
      } else if (findingSev && sev !== findingSev) {
        return false
      }
      if (q) {
        const hay = [f?.file, f?.line, f?.rule, f?.problem, f?.message, f?.finding_key]
          .map((x) => String(x ?? '').toLowerCase())
          .join(' ')
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [findings, findingSev, findingQ])

  const findingFiltersActive = !!(findingSev || findingQ.trim())

  const autoFixes = useMemo(() => {
    if (!job) return []
    const fixes = job.auto_fixes || job.summary?.auto_fixes || []
    return Array.isArray(fixes) ? fixes : []
  }, [job])

  const analyzedSha = job?.analyzed_sha || job?.summary?.analyzed_sha || job?.commit_sha || ''
  const prevSha = job?.previous_analyzed_sha || job?.summary?.previous_analyzed_sha || ''
  const gate = gateSummary(job)
  const canFix = findings.length > 0
    && ['completed', 'failed', 'running'].includes(String(job?.status || '').toLowerCase())

  const maxSev = useMemo(() => {
    let best = ''
    let rank = -1
    for (const f of findings) {
      const s = String(f?.severity || '').toLowerCase()
      const r = SEV_RANK[s] ?? -1
      if (r > rank) {
        rank = r
        best = s
      }
    }
    return best
  }, [findings])

  const enqueueAutoFix = async ({ findingKeys = null, createPr = true } = {}) => {
    if (!jobId || busy) return
    setBusy(true)
    try {
      const keys = Array.isArray(findingKeys) && findingKeys.length
        ? findingKeys
        : findings
          .map((f) => f?.finding_key || f?.key || '')
          .map((k) => String(k || '').trim())
          .filter(Boolean)
      if (!keys.length) {
        toast.push('Auto-fix needs finding keys on this job', { tone: 'error' })
        return
      }
      const body = { create_pr: !!createPr, finding_keys: keys }
      const { data } = await axios.post(apiUrl(`/api/scm/jobs/${encodeURIComponent(jobId)}/auto-fix`), body)
      const detail = data?.auto_fix_id || data?.honesty || ''
      toast.push(
        detail
          ? `${createPr ? 'Create fix PR queued' : 'Auto-fix queued'}: ${detail}`
          : (createPr ? 'Create fix PR queued' : 'Auto-fix queued'),
        { tone: 'neutral' },
      )
      await load()
    } catch (e) {
      const detail = typeof e.response?.data === 'string'
        ? e.response.data
        : (e.response?.data?.error || e.message || 'request failed')
      toast.push(`Auto-fix failed: ${detail}`, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const repo = job?.repo_full_name || (loading ? '…' : '—')
  const prNum = job?.pr_number
  const rHref = repoHref(job, connectors)
  const pHref = prHref(job, connectors)

  const children = useMemo(() => {
    const list = job?.children
    return Array.isArray(list) ? list : []
  }, [job])
  const childStatus = job?.child_status || job?.summary?.child_status || {}
  const childrenEvidence = Array.isArray(job?.children_evidence) ? job.children_evidence : []
  const runKind = String(job?.kind || job?.summary?.kind || '')
  const isRunCentric = !!(runKind || children.length || job?.run_id)
  const frozenPrefs = job?.summary?.prefs || null
  const prefsSources = job?.summary?.prefs_sources || {}
  const ledger = Array.isArray(job?.summary?.ledger) ? job.summary.ledger : []
  const riskScore = job?.summary?.risk_score
  const riskFactors = Array.isArray(job?.summary?.risk_factors) ? job.summary.risk_factors : []
  const approvalReasons = Array.isArray(job?.summary?.approval_reasons) ? job.summary.approval_reasons : []
  const approvalHonesty = job?.summary?.approval_honesty || ''
  const degraded = Array.isArray(job?.summary?.degraded) ? job.summary.degraded : []
  const evidence = useMemo(() => evidenceFromJob(job), [job])
  const [selectedStageId, setSelectedStageId] = useState('')
  const [stagePinned, setStagePinned] = useState(false)

  useEffect(() => {
    setSelectedStageId('')
    setStagePinned(false)
    setLiveLog('')
  }, [jobId])

  const dagRows = useMemo(() => {
    let rows = []
    if (children.length) {
      rows = children.map((c) => ({
        id: c.id,
        kind: c.kind,
        status: c.status,
        attempt: c.attempt,
        started_at: c.started_at,
        finished_at: c.finished_at,
      }))
    } else {
      rows = Object.keys(childStatus).map((k) => ({
        id: k,
        kind: k,
        status: childStatus[k],
        attempt: '',
      }))
    }
    // Merge compact evidence section flags from parent view.
    const byId = new Map(childrenEvidence.map((e) => [String(e.id), e]))
    rows = rows.map((r) => {
      const ce = byId.get(String(r.id))
      return {
        ...r,
        sections: ce?.sections || null,
        skip_reason: ce?.skip_reason || '',
      }
    })
    return sortRunChildren(rows)
  }, [children, childStatus, childrenEvidence])

  useEffect(() => {
    if (!dagRows.length) return
    const running = dagRows.find((r) => String(r.status || '').toLowerCase() === 'running')
    // Follow the running stage unless the operator pinned another stage.
    if (running && !stagePinned) {
      const id = String(running.id || '')
      if (id && id !== selectedStageId) setSelectedStageId(id)
      return
    }
    if (!selectedStageId) {
      setSelectedStageId(String(dagRows[0].id || ''))
    }
  }, [dagRows, selectedStageId, stagePinned])

  const displayEvidence = useMemo(() => {
    // When viewing a parent run, prefer selected child's evidence if embedded;
    // otherwise show parent/self evidence.
    if (selectedStageId && children.length) {
      const child = children.find((c) => String(c.id) === String(selectedStageId))
      const childEv = evidenceFromJob(child)
      if (childEv) return childEv
    }
    return evidence
  }, [selectedStageId, children, evidence])

  const flags = sectionFlags(displayEvidence)

  const liveTarget = useMemo(() => {
    if (selectedStageId && children.length) {
      const child = children.find((c) => String(c.id) === String(selectedStageId))
      if (child) return child
    }
    return job
  }, [selectedStageId, children, job])

  const liveMeta = useMemo(() => {
    const sum = liveTarget?.summary && typeof liveTarget.summary === 'object' ? liveTarget.summary : {}
    return sum.live && typeof sum.live === 'object' ? sum.live : null
  }, [liveTarget])

  const liveTargetActive = ['queued', 'waiting', 'running'].includes(
    String(liveTarget?.status || '').toLowerCase(),
  )
  const liveArtifactJobId = String(liveTarget?.id || jobId || '')

  useEffect(() => {
    if (!liveArtifactJobId) return undefined
    setLiveLog('')
    let cancelled = false
    const pull = async () => {
      if (!liveMeta?.artifact && !liveTargetActive) {
        // Fall back to summary tail only when terminal and no artifact yet.
        if (liveMeta?.tail) setLiveLog(String(liveMeta.tail))
        return
      }
      try {
        const name = liveMeta?.artifact || 'live.log'
        const { data } = await axios.get(
          apiUrl(`/api/scm/jobs/${encodeURIComponent(liveArtifactJobId)}/artifacts/${encodeURIComponent(name)}`),
          { responseType: 'text', transformResponse: [(d) => d] },
        )
        if (!cancelled && typeof data === 'string') setLiveLog(data)
      } catch {
        if (!cancelled && liveMeta?.tail) setLiveLog(String(liveMeta.tail))
      }
    }
    pull()
    if (!liveTargetActive) return () => { cancelled = true }
    const t = setInterval(pull, 2000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [liveArtifactJobId, liveTargetActive, liveMeta?.artifact, liveMeta?.tail, liveMeta?.updated_at])

  useEffect(() => {
    const el = liveLogRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [liveLog])

  const activityKind = agentKindLabel(
    liveTarget?.kind || liveTarget?.summary?.kind || runKind || 'job',
  )
  const showActivity = !!(liveLog || liveMeta || liveTargetActive)

  return (
    <div className="opa-stack opa-review-job">
      <EntityHeader
        title={repo}
        mono={false}
        subtitle={
          <span className="opa-review-job-crumb">
            <Link to="/security?tab=ops&mode=jobs">Security</Link>
            <span className="opa-muted"> / </span>
            <Link to="/security?tab=ops&mode=jobs">PR Jobs</Link>
            <span className="opa-muted"> / </span>
            <span className="opa-mono">{jobId ? String(jobId).slice(0, 18) : '—'}</span>
          </span>
        }
        badges={
          <>
            {job?.status ? <StatusPill tone={statusTone(job.status)}>{job.status}</StatusPill> : null}
            {maxSev ? <StatusPill tone={sevTone(maxSev)}>{maxSev}</StatusPill> : null}
            {gate.gateStatus === 'fail' || gate.gateStatus === 'pass' ? (
              <StatusPill tone={gate.gateStatus === 'pass' ? 'ok' : 'error'}>gate {gate.gateStatus}</StatusPill>
            ) : null}
            {gate.aiStatus && gate.aiStatus !== 'findings' ? (
              <StatusPill tone={gate.aiStatus === 'skipped' ? 'neutral' : 'ok'}>{gate.aiStatus}</StatusPill>
            ) : null}
            {runKind ? <Badge>{agentKindLabel(runKind)}</Badge> : <Badge>OPA Review</Badge>}
            {typeof riskScore === 'number' ? <Badge title="Risk score">risk {riskScore}</Badge> : null}
          </>
        }
        meta={
          <div className="opa-review-job-meta">
            {prNum ? (
              <ExtLink href={pHref} className="opa-mono">PR #{prNum}</ExtLink>
            ) : <span className="opa-muted">No PR</span>}
            {analyzedSha ? (
              <span className="opa-muted">
                SHA <span className="opa-mono" title={prevSha ? `${analyzedSha} (prev ${prevSha})` : analyzedSha}>
                  {String(analyzedSha).slice(0, 12)}
                </span>
              </span>
            ) : null}
          </div>
        }
        actions={
          <div className="opa-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="opa-btn ghost" disabled={loading || busy} onClick={load}>
              <FiRefreshCw size={12} /> Refresh
            </button>
            <Link to="/security?tab=ops&mode=jobs" className="opa-row" style={{ gap: 4, fontSize: 'var(--fs-12)', color: 'var(--text-secondary)' }}>
              <FiChevronLeft size={13} /> Jobs
            </Link>
          </div>
        }
      />

      <div className="opa-review-job-summary">
        <div className="opa-review-job-summary-row">
          <span className="opa-muted">Repo</span>
          <ExtLink href={rHref} className="opa-mono">{repo}</ExtLink>
        </div>
        <div className="opa-review-job-summary-row">
          <span className="opa-muted">PR</span>
          {prNum
            ? <ExtLink href={pHref} className="opa-mono">#{prNum}</ExtLink>
            : <span>—</span>}
        </div>
        <div className="opa-review-job-summary-row">
          <span className="opa-muted">Analyzed</span>
          <span className="opa-mono">{analyzedSha ? String(analyzedSha).slice(0, 16) : '—'}</span>
        </div>
        <div className="opa-review-job-summary-row">
          <span className="opa-muted">Gate</span>
          <span>
            {gate.gateStatus || '—'}
            {gate.minSeverity ? ` · min ${gate.minSeverity}` : ''}
            {gate.scope ? ` · ${gate.scope}` : ''}
          </span>
        </div>
        <div className="opa-review-job-summary-row">
          <span className="opa-muted">Findings</span>
          <span className="opa-mono">{findings.length}</span>
        </div>
      </div>

      {isRunCentric && dagRows.length > 0 ? (
        <Panel title="Stage timeline" icon={<FiShield />} empty={false}>
          <div className="opa-review-run-dag opa-review-stage-timeline">
            {dagRows.map((c) => {
              const active = String(c.id) === String(selectedStageId)
              const sec = c.sections || {}
              return (
                <button
                  type="button"
                  key={c.id}
                  className={`opa-review-run-node opa-review-stage-node${active ? ' active' : ''}`}
                  onClick={() => {
                    setStagePinned(true)
                    setSelectedStageId(String(c.id))
                  }}
                >
                  <Badge>{agentKindLabel(c.kind)}</Badge>
                  <StatusPill tone={statusTone(c.status)}>{c.status || '—'}</StatusPill>
                  {c.id && c.id !== c.kind ? (
                    <Link
                      to={scmJobHref(c.id)}
                      className="opa-mono"
                      style={{ fontSize: 11 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {String(c.id).slice(0, 16)}
                    </Link>
                  ) : null}
                  {c.attempt ? <span className="opa-muted" style={{ fontSize: 11 }}>attempt {c.attempt}</span> : null}
                  <span className="opa-review-section-badges">
                    {['has_context', 'has_chat', 'has_results', 'has_posts'].map((k) => (
                      <span key={k} className={`opa-review-sec${sec[k] ? ' on' : ''}`}>
                        {k.replace('has_', '')}
                      </span>
                    ))}
                  </span>
                </button>
              )
            })}
          </div>
        </Panel>
      ) : null}

      {displayEvidence || showActivity ? (
        <div className="opa-review-evidence-grid">
          {showActivity ? (
            <Panel
              className="opa-review-activity-panel"
              title="Agent activity"
              icon={<FiShield />}
              empty={!liveLog && !liveMeta}
              emptyText={liveTargetActive ? 'Waiting for agent output…' : 'No live log for this stage'}
            >
              <div className="opa-review-activity-status">
                <span className="cell-strong">{activityKind}</span>
                {liveMeta?.phase ? <Badge>{liveMeta.phase}</Badge> : null}
                {liveMeta?.unit ? <span className="opa-mono" style={{ fontSize: 11 }}>{liveMeta.unit}</span> : null}
                {liveTargetActive ? <StatusPill tone="warn">live</StatusPill> : null}
                {liveMeta?.updated_at ? (
                  <span className="opa-muted" style={{ fontSize: 11 }}>
                    {String(liveMeta.updated_at).replace('T', ' ').slice(0, 19)} UTC
                  </span>
                ) : null}
              </div>
              <pre ref={liveLogRef} className="opa-review-activity-log">
                {liveLog || liveMeta?.tail || (liveTargetActive ? '…' : '')}
              </pre>
              <div className="opa-review-activity-stub" title="Coming soon — live watch only">
                <textarea
                  className="opa-review-activity-input"
                  rows={2}
                  disabled
                  placeholder="Message agent… (coming soon)"
                  value={agentMsg}
                  onChange={(e) => setAgentMsg(e.target.value)}
                />
                <button type="button" className="opa-btn ghost" disabled title="Coming soon — live watch only">
                  Send to agent
                </button>
              </div>
            </Panel>
          ) : null}
          <Panel title="Context" icon={<FiShield />} empty={!flags.context} emptyText="No context captured">
            {displayEvidence?.context?.brief_preview ? (
              <pre className="opa-review-evidence-pre">{displayEvidence.context.brief_preview}</pre>
            ) : null}
            {displayEvidence?.context?.review_contexts ? (
              <p className="opa-muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
                Review contexts applied
              </p>
            ) : null}
            {displayEvidence?.context?.checkout_path ? (
              <div className="opa-mono" style={{ fontSize: 11 }}>{displayEvidence.context.checkout_path}</div>
            ) : null}
            {displayEvidence?.context?.prefs ? (
              <ul className="opa-review-prefs-list">
                {Object.keys(displayEvidence.context.prefs).slice(0, 12).map((field) => (
                  <li key={field}>
                    <span className="opa-mono">{field}</span>
                    <span>{String(displayEvidence.context.prefs[field] ?? '—')}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>
          <Panel title="Chat" icon={<FiShield />} empty={!flags.chat} emptyText="No agent chat on this stage">
            {displayEvidence?.chat?.model ? (
              <div style={{ marginBottom: 8 }}>
                Model <span className="opa-mono cell-strong">{displayEvidence.chat.model}</span>
              </div>
            ) : null}
            {displayEvidence?.chat?.prompt_preview ? (
              <details className="opa-review-evidence-details">
                <summary>Brief / prompt</summary>
                <pre className="opa-review-evidence-pre">{displayEvidence.chat.prompt_preview}</pre>
              </details>
            ) : null}
            {displayEvidence?.chat?.transcript ? (
              <details className="opa-review-evidence-details" open>
                <summary>Transcript</summary>
                <pre className="opa-review-evidence-pre">{displayEvidence.chat.transcript}</pre>
              </details>
            ) : null}
            {Array.isArray(displayEvidence?.chat?.parts) && displayEvidence.chat.parts.length ? (
              <ul className="opa-review-prefs-list">
                {displayEvidence.chat.parts.map((p, i) => (
                  <li key={p.unit_id || i}>
                    <span className="opa-mono">{p.unit_id || p.kind || 'part'}</span>
                    <span>{p.error || p.summary || '—'}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>
          <Panel title="Results" icon={<FiShield />} empty={!flags.results} emptyText="No structured results">
            <pre className="opa-review-evidence-pre">
              {JSON.stringify(displayEvidence?.results || {}, null, 2)}
            </pre>
          </Panel>
          <Panel
            title="Posted messages"
            icon={<FiShield />}
            empty={!flags.posts}
            emptyText="No GitHub posts recorded"
          >
            <ul className="opa-review-posts">
              {(displayEvidence?.posts || []).map((p, i) => (
                <li key={`${p.type}-${p.github_id || i}`}>
                  <div className="opa-review-post-head">
                    <Badge>{p.type || 'post'}</Badge>
                    <StatusPill tone="neutral">{p.status || '—'}</StatusPill>
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="opa-mono" style={{ fontSize: 11 }}>
                        view
                      </a>
                    ) : null}
                    {p.github_id ? <span className="opa-muted opa-mono" style={{ fontSize: 11 }}>#{p.github_id}</span> : null}
                  </div>
                  <pre className="opa-review-evidence-pre">{p.body_preview || p.body || '—'}</pre>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : null}

      {degraded.length > 0 ? (
        <div className="opa-review-degraded" role="status">
          <strong>Degraded</strong>
          {' — '}
          {degraded.join('; ')}
        </div>
      ) : null}

      {(frozenPrefs || riskFactors.length || approvalReasons.length || ledger.length) ? (
        <div className="opa-review-run-meta-grid">
          {frozenPrefs ? (
            <Panel title="Frozen prefs" icon={<FiShield />}>
              <ul className="opa-review-prefs-list">
                {Object.keys(frozenPrefs).sort().map((field) => (
                  <li key={field}>
                    <span className="opa-mono">{field}</span>
                    <span>
                      {typeof frozenPrefs[field] === 'boolean'
                        ? (frozenPrefs[field] ? 'On' : 'Off')
                        : String(frozenPrefs[field] ?? '—')}
                    </span>
                    {prefsSources[field] ? <Badge>{prefsSources[field]}</Badge> : null}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          {(typeof riskScore === 'number' || riskFactors.length > 0) ? (
            <Panel title="Risk" icon={<FiShield />}>
              {typeof riskScore === 'number' ? (
                <div style={{ marginBottom: 8 }}>
                  Score <span className="opa-mono cell-strong">{riskScore}</span>
                </div>
              ) : null}
              {riskFactors.length ? (
                <ul className="opa-review-prefs-list">
                  {riskFactors.map((f, i) => (
                    <li key={i}>
                      <span>{typeof f === 'string' ? f : (f?.name || f?.factor || JSON.stringify(f))}</span>
                      {f?.points != null ? <Badge>{f.points}</Badge> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Panel>
          ) : null}
          {(approvalReasons.length || approvalHonesty) ? (
            <Panel title="Approval" icon={<FiShield />}>
              {approvalHonesty ? <p className="opa-muted" style={{ fontSize: 12, marginTop: 0 }}>{approvalHonesty}</p> : null}
              {approvalReasons.length ? (
                <ul className="opa-review-prefs-list">
                  {approvalReasons.map((r, i) => (
                    <li key={i}><span>{String(r)}</span></li>
                  ))}
                </ul>
              ) : null}
            </Panel>
          ) : null}
          {ledger.length ? (
            <Panel title="Findings ledger" icon={<FiShield />}>
              <ul className="opa-review-prefs-list">
                {ledger.slice(0, 40).map((f, i) => (
                  <li key={f.key || f.finding_key || i}>
                    <StatusPill tone={sevTone(f.severity)}>{f.severity || '—'}</StatusPill>
                    <span className="opa-mono" style={{ fontSize: 11 }}>{f.source || f.agent || ''}</span>
                    <span>{f.rule || f.message || f.key || '—'}</span>
                  </li>
                ))}
              </ul>
              {ledger.length > 40 ? (
                <p className="opa-muted" style={{ fontSize: 11 }}>+{ledger.length - 40} more</p>
              ) : null}
            </Panel>
          ) : null}
        </div>
      ) : null}

      <div className="opa-review-job-actions">
        <button
          type="button"
          className="opa-btn ghost"
          disabled={!canFix || busy}
          title="Experimental — requires OPA-AI-Orchestrator (/api/scm/jobs/…/auto-fix)"
          onClick={() => enqueueAutoFix({ createPr: false })}
        >
          Auto-fix all
        </button>
        <button
          type="button"
          className="opa-btn primary"
          disabled={!canFix || busy}
          title="Experimental — requires OPA-AI-Orchestrator (/api/scm/jobs/…/auto-fix)"
          onClick={() => enqueueAutoFix({ createPr: true })}
        >
          <FiGitPullRequest size={14} /> Create fix PR
        </button>
      </div>
      <p className="opa-muted" style={{ margin: '0 0 12px', fontSize: 12 }}>
        Auto-fix / Create fix PR are <strong>experimental</strong> and require{' '}
        <strong>OPA-AI-Orchestrator</strong> (<code>POST /api/scm/jobs/{'{id}'}/auto-fix</code>).
        Agent returns 410 for <code>/api/scm/*</code> after the service extract — point{' '}
        <code>VITE_ORCHESTRATOR_URL</code> (or smoke nginx) at Orchestrator.
      </p>

      <Panel
        title="Findings"
        icon={<FiShield />}
        loading={loading}
        error={error}
        empty={!loading && !error && findings.length === 0}
        emptyText="No findings on this job"
        actions={findings.length ? (
          <span className="opa-muted" style={{ fontSize: 12 }}>
            {findingFiltersActive
              ? `${filteredFindings.length} of ${findings.length}`
              : `${findings.length} finding${findings.length === 1 ? '' : 's'}`}
          </span>
        ) : null}
      >
        {findings.length > 0 ? (
          <div className="opa-review-findings-filters">
            <label className="opa-review-filter">
              <span className="opa-muted">Severity</span>
              <select
                className="opa-select"
                value={findingSev}
                onChange={(e) => setFindingSev(e.target.value)}
                aria-label="Filter findings by severity"
              >
                <option value="">All</option>
                <option value="blocker|critical">blocker / critical</option>
                <option value="high">high</option>
                <option value="medium">medium</option>
                <option value="low">low</option>
                <option value="info">info</option>
              </select>
            </label>
            <label className="opa-review-filter opa-review-filter-search">
              <span className="opa-muted">Search</span>
              <input
                className="opa-input"
                type="search"
                value={findingQ}
                onChange={(e) => setFindingQ(e.target.value)}
                placeholder="File, rule, message…"
                aria-label="Search findings"
                spellCheck={false}
              />
            </label>
            {findingFiltersActive ? (
              <button
                type="button"
                className="opa-btn ghost"
                onClick={() => { setFindingSev(''); setFindingQ('') }}
              >
                <FiX size={12} /> Clear
              </button>
            ) : null}
          </div>
        ) : null}
        {findings.length > 0 && filteredFindings.length === 0 ? (
          <div className="opa-review-findings-empty opa-muted">
            No findings match these filters.
            <button
              type="button"
              className="opa-btn ghost"
              onClick={() => { setFindingSev(''); setFindingQ('') }}
            >
              Clear filters
            </button>
          </div>
        ) : (
        <ul className="opa-review-findings">
          {filteredFindings.map((f, i) => {
            const key = findingKey(f, i)
            const sev = String(f.severity || '').toLowerCase() || 'info'
            const loc = `${f.file || '—'}${f.line ? `:${f.line}` : ''}`
            return (
              <li key={key} className="opa-review-finding">
                <div className="opa-review-finding-main">
                  <StatusPill tone={sevTone(sev)}>{sev}</StatusPill>
                  <code className="opa-mono opa-review-finding-loc" title={loc}>{loc}</code>
                  {f.rule ? <Badge title="Rule">{f.rule}</Badge> : null}
                </div>
                <p className="opa-review-finding-msg">{f.problem || f.message || '—'}</p>
                <div className="opa-review-finding-actions">
                  <button
                    type="button"
                    className="opa-btn ghost"
                    disabled={!canFix || busy}
                    onClick={() => enqueueAutoFix({ findingKeys: [f.finding_key || key], createPr: false })}
                  >
                    Auto-fix
                  </button>
                  <button
                    type="button"
                    className="opa-btn ghost"
                    disabled={!canFix || busy}
                    onClick={() => enqueueAutoFix({ findingKeys: [f.finding_key || key], createPr: true })}
                  >
                    Create fix PR
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
        )}
      </Panel>

      <Panel
        title="Auto-fix status"
        icon={<FiGitPullRequest />}
        loading={loading}
        empty={!loading && autoFixes.length === 0}
        emptyText="No Auto-fix runs yet"
      >
        <ul className="opa-review-fixes">
          {[...autoFixes].reverse().map((fx, i) => {
            const f = typeof fx === 'object' && fx ? fx : {}
            return (
              <li key={f.id || i} className="opa-review-fix">
                <StatusPill tone={statusTone(f.status)}>{f.status || '—'}</StatusPill>
                <span className="opa-mono">{String(f.id || '').slice(0, 18)}</span>
                {f.pr_url ? <a href={f.pr_url} target="_blank" rel="noopener noreferrer">Open PR</a> : null}
                {f.branch ? <span className="opa-muted opa-mono">{f.branch}</span> : null}
                {f.error ? <span className="opa-review-fix-err">{String(f.error)}</span> : null}
                {f.honesty ? <span className="opa-muted">{f.honesty}</span> : null}
              </li>
            )
          })}
        </ul>
      </Panel>
    </div>
  )
}
