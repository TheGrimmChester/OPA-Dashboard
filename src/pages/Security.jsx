import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Link, useSearchParams } from 'react-router-dom'
import {
  FiShield, FiAlertTriangle, FiEye, FiEyeOff, FiCrosshair, FiKey, FiSliders,
  FiCode, FiServer, FiCheckCircle, FiPlay, FiRefreshCw, FiX, FiGitPullRequest,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { apiUrl } from '../utils/apiBase'
import { Panel, KpiTile, DataTable, StatusPill, Badge } from '../components/ui'
import { useToast } from '../components/ui/Toast'
import { ConnectorPicker } from '../components/connectors'
import AgentsTab from '../components/security/AgentsTab'
import CheckWithHint from '../components/security/CheckWithHint'
import JobEvidencePanel, { findingsFromJob } from '../components/security/JobEvidencePanel'
import PrefRow from '../components/security/PrefRow'
import { useTenant } from '../contexts/TenantContext'
import { fmtNum, fmtAgo } from '../theme/format'
import { securityRunHref, serviceHref, scmJobHref } from '../utils/entityLinks'
import { agentKindLabel, groupScmJobsForDisplay } from '../utils/scmRuns'
import './Security.css'

const SEV_KEY = 'opa.security.min_severity'

/** Web host for GitHub links (public or enterprise) from connector meta. */
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
    // api.github.com / github.example/api/v3 → web origin
    if (u.hostname === 'api.github.com') return 'https://github.com'
    u.pathname = ''
    u.search = ''
    u.hash = ''
    return u.origin
  } catch {
    return 'https://github.com'
  }
}

function scmJobRepoHref(job, connectorList = []) {
  const direct = job?.repo_url || job?.summary?.repo_url || job?.summary?.html_repo_url
  if (direct) return String(direct)
  const repo = String(job?.repo_full_name || '').trim()
  if (!repo || !repo.includes('/')) return ''
  const conn = connectorList.find((c) => c.id === job.connector_id)
  return `${githubWebOrigin(conn)}/${repo}`
}

function scmJobPrHref(job, connectorList = []) {
  const direct = job?.pr_url || job?.html_url || job?.summary?.pr_url || job?.summary?.html_url
  if (direct && /\/pull\/\d+/.test(String(direct))) return String(direct)
  const repo = String(job?.repo_full_name || '').trim()
  const pr = Number(job?.pr_number || 0)
  if (!repo || !repo.includes('/') || pr <= 0) return ''
  const conn = connectorList.find((c) => c.id === job.connector_id)
  return `${githubWebOrigin(conn)}/${repo}/pull/${pr}`
}

const SEV_RANK = { blocker: 5, critical: 4, high: 3, medium: 2, low: 1, info: 0 }

/** Map severity → StatusPill tone (color-coded, not emoji-only). */
function sevTone(sev) {
  const v = String(sev || '').toLowerCase()
  if (v === 'blocker' || v === 'critical') return 'error'
  if (v === 'high') return 'alert'
  if (v === 'medium') return 'warn'
  if (v === 'info' || v === 'pass' || v === 'ok' || v === 'clean') return 'ok'
  if (v === 'low') return 'neutral'
  return 'neutral'
}

function scmWebhookOutcomeTone(outcome) {
  switch (String(outcome || '').toLowerCase()) {
    case 'queued': case 'ok': return 'ok'
    case 'ping': return 'neutral'
    case 'skipped': case 'ignored': case 'duplicate': return 'warn'
    case 'error': return 'error'
    default: return 'neutral'
  }
}

function scmJobStatusTone(status) {
  switch (String(status || '').toLowerCase()) {
    case 'completed': return 'ok'
    case 'running': return 'warn'
    case 'queued': return 'info'
    case 'waiting': return 'neutral'
    case 'cancelled': return 'neutral'
    case 'failed':
    case 'error': return 'error'
    default: return 'neutral'
  }
}

function scmJobKindLabel(job) {
  const kind = String(job?.kind || job?.summary?.kind || '').toLowerCase()
  if (kind) return agentKindLabel(kind)
  const ev = String(job?.event || '').toLowerCase()
  if (ev.includes('ai_only') || ev.includes('ai_review') || ev.includes('opa_review')) return 'OPA Review'
  if (ev.includes('simulate')) return 'Simulate'
  if (ev.includes('pull_request') || ev.includes('check_suite') || ev.includes('push')) return 'Repo Watch'
  if (!ev) return ''
  return String(job.event).replace(/^manual\./, '').replace(/_/g, ' ')
}

/** Scan aids for Jobs rows: kind · max severity · rule/category (was plain “OPA Review · high · security”). */
function scmJobResultMeta(job) {
  const summary = job?.summary && typeof job.summary === 'object' ? job.summary : {}
  const ai = summary.ai && typeof summary.ai === 'object' ? summary.ai : {}
  const gate = summary.gate && typeof summary.gate === 'object' ? summary.gate : {}
  const findings = Array.isArray(ai.findings) ? ai.findings : []

  let maxSev = ''
  let topRule = ''
  let maxRank = -1
  for (const f of findings) {
    const s = String(f?.severity || '').toLowerCase()
    const r = SEV_RANK[s] ?? -1
    if (r > maxRank) {
      maxRank = r
      maxSev = s
      topRule = String(f?.rule || '').trim()
    }
  }
  if (!maxSev && ai.status === 'findings') {
    maxSev = String(ai.confidence_label || '').toLowerCase()
    if (!SEV_RANK[maxSev] && maxSev !== 'info') maxSev = ''
  }
  if (!maxSev && gate.min_severity) {
    maxSev = String(gate.min_severity).toLowerCase()
  }
  if (!topRule) {
    const scope = String(gate.scope || '').toLowerCase()
    if (scope.includes('security')) topRule = 'security'
    else if (String(ai.status || '') === 'findings') topRule = 'security'
  }

  return {
    kind: scmJobKindLabel(job),
    severity: maxSev,
    rule: topRule,
    gateStatus: String(gate.status || '').toLowerCase(),
    aiStatus: String(ai.status || '').toLowerCase(),
  }
}

const SCANNER_OPTS = [
  { id: 'secrets', label: 'Secrets (gitleaks|lite)', mode: 'gitleaks' },
  { id: 'sast', label: 'SAST (lite)', mode: 'lite' },
  { id: 'iac', label: 'IaC (stub)', mode: 'stub' },
  { id: 'container', label: 'Container (stub)', mode: 'stub' },
  { id: 'sbom', label: 'SBOM / vulns (lite)', mode: 'lite' },
]

const PROFILE_HINTS = {
  auto: 'Detect scanners from workspace files',
  php: 'Secrets + SAST + SBOM (IAST is runtime-only)',
  node: 'Secrets + SAST + SBOM',
  container: 'Container stub + IaC Dockerfile heuristics',
  iac: 'Terraform / Dockerfile lite scan + secrets',
  full: 'All lite/stub scanners',
}

/** Tabs where a `run=` deep-link filters findings / shows run detail. */
const RUN_CONTEXT_TABS = new Set(['scans', 'secrets', 'sast', 'iac'])

/** PR Jobs table URL filters (`?tab=jobs&status=…&severity=…&repo=…&q=…`). */
const JOB_FILTER_KEYS = ['status', 'severity', 'repo', 'q']
const JOB_STATUS_FILTERS = new Set(['running', 'queued', 'waiting', 'completed', 'failed', 'cancelled'])
const JOB_SEV_FILTERS = new Set(['blocker|critical', 'high', 'medium', 'low', 'none'])

function resolveJobStatusFilter(params) {
  const v = String(params.get('status') || '').toLowerCase()
  return JOB_STATUS_FILTERS.has(v) ? v : ''
}

function resolveJobSeverityFilter(params) {
  const v = String(params.get('severity') || '').toLowerCase()
  return JOB_SEV_FILTERS.has(v) ? v : ''
}

function jobMatchesSeverityFilter(metaSeverity, filter) {
  const sev = String(metaSeverity || '').toLowerCase()
  if (!filter) return true
  if (filter === 'none') return !sev
  if (filter === 'blocker|critical') return sev === 'blocker' || sev === 'critical'
  return sev === filter
}

function jobMatchesStatusFilter(status, filter) {
  const st = String(status || '').toLowerCase()
  if (!filter) return true
  if (filter === 'failed') return st === 'failed' || st === 'error'
  return st === filter
}

function resolveSecurityTab(params) {
  const tabQ = params.get('tab')
  if (tabQ) return tabQ
  // Bare `?run=` links open Scans; never invent a tab that steals Repo Watch.
  if (params.get('run')) return 'scans'
  return 'vulns'
}

function resolveSecurityRunId(params, tab) {
  const runQ = params.get('run') || ''
  if (!runQ) return ''
  // Explicit non-run tabs (e.g. tab=watch&run=…) keep the tab; ignore run context.
  if (!RUN_CONTEXT_TABS.has(tab)) return ''
  return runQ
}

/** Compact Select all / Clear controls for checkbox multi-selects. */
function MultiSelectActions({ onSelectAll, onClear, disabled = false, selectLabel = 'Select all', clearLabel = 'Clear' }) {
  return (
    <span className="opa-multiselect-actions">
      <button type="button" className="opa-btn ghost opa-btn-compact" disabled={disabled} onClick={onSelectAll}>
        {selectLabel}
      </button>
      <button type="button" className="opa-btn ghost opa-btn-compact" disabled={disabled} onClick={onClear}>
        {clearLabel}
      </button>
    </span>
  )
}

/** Wave 19 + Wave 30 + Wave 33: Vulns / IAST / Secrets / SAST / IaC / Scans / Inventory / Policies / PR-check. */
export default function Security() {
  const toast = useToast()
  const { organizationId } = useTenant()
  const orgAll = !organizationId || organizationId === 'all'
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState(() => resolveSecurityTab(searchParams))
  const [minSev, setMinSev] = useState(() => localStorage.getItem(SEV_KEY) || 'high')
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState(null)
  const [activeRunId, setActiveRunId] = useState(() => (
    resolveSecurityRunId(searchParams, resolveSecurityTab(searchParams))
  ))
  const [runDetail, setRunDetail] = useState(null)
  const [runFindings, setRunFindings] = useState(null)
  const [form, setForm] = useState({
    service: 'node-smoke',
    profile: 'auto',
    scanners: [],
    target_path: '',
    image: '',
  })

  const runFilter = activeRunId && RUN_CONTEXT_TABS.has(tab)
    ? { security_run_id: activeRunId }
    : {}

  const summary = useApi('/api/vulns/summary', { hours: 168 }, { noRange: true })
  const findings = useApi('/api/vulns/findings', { limit: 100 }, { noRange: true })
  const inventory = useApi('/api/vulns/inventory', { limit: 100 }, { noRange: true })
  const iastSum = useApi('/api/iast/summary', { hours: 24 }, { noRange: true })
  const iast = useApi('/api/iast/findings', { limit: 100 }, { noRange: true })
  const secrets = useApi('/api/security/secrets', { limit: 100, ...runFilter }, {
    noRange: true,
    skip: tab !== 'secrets' && tab !== 'policies' && tab !== 'pr' && tab !== 'scans',
  })
  const sast = useApi('/api/security/sast', { limit: 100, ...runFilter }, {
    noRange: true,
    skip: tab !== 'sast' && tab !== 'pr' && tab !== 'scans',
  })
  const iac = useApi('/api/security/iac', { limit: 100, ...runFilter }, {
    noRange: true,
    skip: tab !== 'iac' && tab !== 'pr' && tab !== 'scans',
  })
  const policies = useApi('/api/security/policies', {}, { noRange: true, skip: tab !== 'policies' })
  const prCheck = useApi('/api/security/pr-check', {}, { noRange: true, skip: tab !== 'pr' })
  const runs = useApi('/api/security/runs', { limit: 50 }, { noRange: true, skip: tab !== 'scans' && !activeRunId })
  const profiles = useApi('/api/security/profiles', {}, { noRange: true, skip: tab !== 'scans' })
  const services = useApi('/api/services', {}, { noRange: true, skip: tab !== 'scans' })
  const connectors = useApi('/api/connectors', {}, { noRange: true, skip: tab !== 'watch' && tab !== 'jobs' && tab !== 'agents' })
  const scmJobs = useApi('/api/scm/jobs', { limit: 200 }, { noRange: true, skip: tab !== 'jobs' && tab !== 'watch' })
  const scmWebhooks = useApi('/api/scm/webhooks', { limit: 200 }, { noRange: true, skip: tab !== 'webhooks' })
  const scmSettings = useApi('/api/scm/settings', {}, { noRange: true, skip: tab !== 'watch' && tab !== 'pr' && tab !== 'jobs' && tab !== 'webhooks' && tab !== 'agents' })
  const [webhookDetailId, setWebhookDetailId] = useState('')
  const [selectedJobId, setSelectedJobId] = useState('')
  const [selectedJobDetail, setSelectedJobDetail] = useState(null)
  const [selectedJobDetailLoading, setSelectedJobDetailLoading] = useState(false)
  const [jobActionBusy, setJobActionBusy] = useState(false)
  const [extraRepos, setExtraRepos] = useState('')
  const [watchedRows, setWatchedRows] = useState([])
  const [availableRepos, setAvailableRepos] = useState([])
  const [repoPick, setRepoPick] = useState({})
  const [reposLoading, setReposLoading] = useState(false)
  const [reposMeta, setReposMeta] = useState({ error: '', note: '', mock: false })
  const [watchPolicy, setWatchPolicy] = useState({
    checks: { secrets: true, sast: true, iac: true, sbom: true, ai_review: true },
    ai_blocking: false,
    auto_request_reviewer: true,
    auto_approve_min_score: 70,
  })
  const [activeConnector, setActiveConnector] = useState(() => searchParams.get('connector') || '')
  const [watchRefresh, setWatchRefresh] = useState(0)
  const [aiReviewForm, setAiReviewForm] = useState({ force: true, ai_only: false, preview_url: '' })
  const [reviewRepos, setReviewRepos] = useState({}) // repo -> bool
  const [reviewPrs, setReviewPrs] = useState({}) // `${repo}#${pr}` -> bool
  const [pullsByRepo, setPullsByRepo] = useState({}) // repo -> pulls[]
  const [pullsLoading, setPullsLoading] = useState(false)
  const [appliedContexts, setAppliedContexts] = useState([])
  const [lastAiJobId, setLastAiJobId] = useState('')
  const [lastStackId, setLastStackId] = useState('')
  const [stackStatus, setStackStatus] = useState(null)
  const [contexts, setContexts] = useState([])
  const [ctxForm, setCtxForm] = useState({ title: '', body_markdown: '', repo_full_name: '', tags_design: false })
  const [ctxEditingId, setCtxEditingId] = useState('')
  const [linkPick, setLinkPick] = useState({})
  const [genDraft, setGenDraft] = useState(null)

  useEffect(() => {
    if (!activeConnector || tab !== 'watch') {
      setWatchedRows([])
      setAvailableRepos([])
      setRepoPick({})
      setReposMeta({ error: '', note: '', mock: false })
      return undefined
    }
    let cancelled = false
    setReposLoading(true)
    Promise.all([
      axios.get(apiUrl(`/api/connectors/${encodeURIComponent(activeConnector)}/watched`)),
      axios.get(apiUrl(`/api/connectors/${encodeURIComponent(activeConnector)}/repos`)),
    ]).then(([watchedRes, reposRes]) => {
      if (cancelled) return
      const watched = watchedRes.data?.watched || []
      const repos = reposRes.data?.repos || []
      setWatchedRows(watched)
      setAvailableRepos(repos)
      setReposMeta({
        error: reposRes.data?.error || '',
        note: reposRes.data?.note || reposRes.data?.honesty || '',
        mock: !!reposRes.data?.mock,
      })
      const pick = {}
      for (const r of repos) {
        const name = r.full_name || r.repo_full_name
        if (name) pick[name] = false
      }
      for (const w of watched) {
        if (w.repo_full_name) pick[w.repo_full_name] = !!w.enabled
      }
      setRepoPick(pick)
      if (watched.length) {
        const sample = watched.find((w) => w.enabled) || watched[0]
        setWatchPolicy((p) => ({
          ...p,
          ai_blocking: !!sample.ai_blocking,
          auto_request_reviewer: sample.auto_request_reviewer !== undefined ? !!sample.auto_request_reviewer : p.auto_request_reviewer,
          auto_approve_min_score: sample.auto_approve_min_score !== undefined && sample.auto_approve_min_score !== null
            ? Number(sample.auto_approve_min_score) || 0
            : p.auto_approve_min_score,
        }))
      }
    }).catch((e) => {
      if (cancelled) return
      setWatchedRows([])
      setAvailableRepos([])
      setRepoPick({})
      setReposMeta({
        error: e.response?.data?.error || e.message || 'failed to load repos',
        note: e.response?.data?.note || '',
        mock: false,
      })
    }).finally(() => {
      if (!cancelled) setReposLoading(false)
    })
    return () => { cancelled = true }
  }, [activeConnector, tab, watchRefresh])

  useEffect(() => {
    if (tab !== 'watch') return undefined
    let cancelled = false
    axios.get(apiUrl('/api/scm/contexts')).then((res) => {
      if (!cancelled) setContexts(res.data?.contexts || [])
    }).catch(() => {
      if (!cancelled) setContexts([])
    })
    return () => { cancelled = true }
  }, [tab, watchRefresh])

  const selectedReviewRepos = useMemo(
    () => Object.keys(reviewRepos).filter((r) => reviewRepos[r]),
    [reviewRepos],
  )

  useEffect(() => {
    if (tab !== 'watch' || !activeConnector || !selectedReviewRepos.length) {
      setPullsByRepo({})
      setAppliedContexts([])
      return undefined
    }
    let cancelled = false
    setPullsLoading(true)
    Promise.all(selectedReviewRepos.map((repo) => Promise.all([
      axios.get(apiUrl(`/api/connectors/${encodeURIComponent(activeConnector)}/pulls`), { params: { repo } })
        .then((res) => [repo, res.data?.pulls || []])
        .catch(() => [repo, []]),
      axios.get(apiUrl('/api/scm/contexts'), { params: { for_repo: repo } })
        .then((res) => res.data?.summary || [])
        .catch(() => []),
    ]))).then((rows) => {
      if (cancelled) return
      const next = {}
      let contexts = []
      rows.forEach(([pullPair, summary]) => {
        const [repo, pulls] = pullPair
        next[repo] = pulls
        contexts = contexts.concat(summary || [])
      })
      setPullsByRepo(next)
      setAppliedContexts(contexts)
    }).finally(() => {
      if (!cancelled) setPullsLoading(false)
    })
    return () => { cancelled = true }
  }, [tab, activeConnector, selectedReviewRepos.join('|'), watchRefresh])

  useEffect(() => {
    if (!lastStackId || tab !== 'watch') return undefined
    let cancelled = false
    const tick = () => {
      axios.get(apiUrl(`/api/scm/opa-review/stacks/${encodeURIComponent(lastStackId)}`))
        .then((res) => { if (!cancelled) setStackStatus(res.data) })
        .catch(() => {})
    }
    tick()
    const id = setInterval(tick, 4000)
    return () => { cancelled = true; clearInterval(id) }
  }, [lastStackId, tab])

  // Keep PR Jobs fresh while a stack drain is in flight (running/queued/waiting).
  useEffect(() => {
    if (tab !== 'jobs') return undefined
    const id = setInterval(() => { scmJobs.reload?.() }, 4000)
    return () => clearInterval(id)
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== 'webhooks') return undefined
    const id = setInterval(() => { scmWebhooks.reload?.() }, 8000)
    return () => clearInterval(id)
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep tab / run / connector in sync with the URL (and strip stale run= on Watch).
  useEffect(() => {
    const nextTab = resolveSecurityTab(searchParams)
    const nextRun = resolveSecurityRunId(searchParams, nextTab)
    const nextConnector = searchParams.get('connector') || ''
    if (nextTab !== tab) setTab(nextTab)
    if (nextRun !== activeRunId) setActiveRunId(nextRun)
    if (nextConnector && nextConnector !== activeConnector) setActiveConnector(nextConnector)

    // Mangled deep links like ?run=…&tab=watch&connector=… — honor watch, drop run.
    if (searchParams.get('tab') === 'watch' && searchParams.get('run')) {
      const p = new URLSearchParams(searchParams)
      p.delete('run')
      setSearchParams(p, { replace: true })
      return
    }
    // Drop PR Jobs filters when another tab is active (keeps shared URL clean).
    if (nextTab !== 'jobs' && JOB_FILTER_KEYS.some((k) => searchParams.has(k))) {
      const p = new URLSearchParams(searchParams)
      for (const k of JOB_FILTER_KEYS) p.delete(k)
      setSearchParams(p, { replace: true })
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select a live connector when the watch tab opens (skip if URL named one).
  useEffect(() => {
    if (tab !== 'watch' || activeConnector) return
    if (searchParams.get('connector')) return
    const list = connectors.data?.connectors || []
    if (!list.length) return
    const preferred = list.find((x) => x.has_token) || list[0]
    if (preferred?.id) setActiveConnector(preferred.id)
  }, [tab, activeConnector, connectors.data, searchParams])

  const s = summary.data || {}
  const is = iastSum.data || {}
  const vulnRows = findings.data?.findings || []
  const pkgRows = inventory.data?.packages || []
  const iastRows = iast.data?.findings || []
  const secretRows = secrets.data?.findings || []
  const sastRows = sast.data?.findings || []
  const iacRows = iac.data?.findings || []
  const runRows = runs.data?.runs || []
  const serviceNames = useMemo(() => {
    const raw = services.data?.services || services.data || []
    const names = Array.isArray(raw)
      ? raw.map((x) => (typeof x === 'string' ? x : x.name || x.service)).filter(Boolean)
      : []
    const uniq = [...new Set(names)]
    if (!uniq.includes('node-smoke')) uniq.unshift('node-smoke')
    if (!uniq.includes('php-smoke')) uniq.unshift('php-smoke')
    return uniq
  }, [services.data])

  const sevRank = { critical: 4, high: 3, medium: 2, low: 1 }
  const filteredSecrets = useMemo(() => {
    const min = sevRank[minSev] || 3
    return secretRows.filter((r) => (sevRank[String(r.severity || '').toLowerCase()] || 0) >= min)
  }, [secretRows, minSev])

  const saveSev = (v) => {
    setMinSev(v)
    localStorage.setItem(SEV_KEY, v)
  }

  const selectTab = (next) => {
    setTab(next)
    const p = new URLSearchParams(searchParams)
    p.set('tab', next)
    if (RUN_CONTEXT_TABS.has(next) && activeRunId) {
      p.set('run', activeRunId)
    } else {
      p.delete('run')
      if (!RUN_CONTEXT_TABS.has(next)) setActiveRunId('')
    }
    if (next !== 'watch') p.delete('connector')
    else if (activeConnector) p.set('connector', activeConnector)
    if (next !== 'jobs') {
      for (const k of JOB_FILTER_KEYS) p.delete(k)
    }
    setSearchParams(p, { replace: true })
  }

  const setJobFilter = (key, value) => {
    const p = new URLSearchParams(searchParams)
    p.set('tab', 'jobs')
    if (value) p.set(key, value)
    else p.delete(key)
    setSearchParams(p, { replace: true })
  }

  const clearJobFilters = () => {
    const p = new URLSearchParams(searchParams)
    p.set('tab', 'jobs')
    for (const k of JOB_FILTER_KEYS) p.delete(k)
    setSearchParams(p, { replace: true })
  }

  const selectRun = (id) => {
    setActiveRunId(id || '')
    const p = new URLSearchParams(searchParams)
    if (id) {
      p.set('run', id)
      p.set('tab', 'scans')
      p.delete('connector')
      setTab('scans')
    } else {
      p.delete('run')
    }
    setSearchParams(p, { replace: true })
  }

  const flash = (tone, title, detail) => {
    setBanner({ tone, title, detail })
    toast.push(title, { tone: tone === 'error' ? 'error' : 'neutral' })
  }

  const toggleScanner = (id) => {
    setForm((f) => {
      const has = f.scanners.includes(id)
      return {
        ...f,
        scanners: has ? f.scanners.filter((x) => x !== id) : [...f.scanners, id],
      }
    })
  }

  const startScan = async () => {
    setBusy(true)
    try {
      const body = {
        service: form.service || 'workspace-scan',
        profile: form.profile || 'auto',
        target_path: form.target_path || undefined,
        image: form.image || undefined,
        dispatch: true,
      }
      if (form.scanners.length) body.scanners = form.scanners
      const { data } = await axios.post(apiUrl('/api/security/runs'), body)
      const rid = data.security_run_id || data.id
      if (rid) {
        setActiveRunId(rid)
        selectTab('scans')
        const p = new URLSearchParams(searchParams)
        p.set('tab', 'scans')
        p.set('run', rid)
        setSearchParams(p, { replace: true })
      }
      flash(
        data.dispatch?.dispatched === false ? 'warn' : 'ok',
        data.dispatch?.dispatched ? 'Scan started' : 'Run created',
        data.honesty || rid,
      )
      runs.reload?.()
    } catch (e) {
      flash('error', 'Start scan failed', e.response?.data || e.message)
    } finally {
      setBusy(false)
    }
  }

  const selectConnector = (id) => {
    setActiveConnector(id)
    setTab('watch')
    setActiveRunId('')
    const p = new URLSearchParams(searchParams)
    p.set('tab', 'watch')
    p.delete('run')
    if (id) p.set('connector', id)
    else p.delete('connector')
    setSearchParams(p, { replace: true })
  }

  const toggleRepoPick = (fullName) => {
    setRepoPick((prev) => ({ ...prev, [fullName]: !prev[fullName] }))
  }

  const setAllAvailableRepos = (on) => {
    setRepoPick((prev) => {
      const next = { ...prev }
      for (const r of availableRepos) {
        const name = r.full_name || r.repo_full_name
        if (name) next[name] = on
      }
      return next
    })
  }

  const setAllReviewRepos = (on) => {
    const next = {}
    for (const r of watchedRows) {
      if (r.repo_full_name) next[r.repo_full_name] = on
    }
    setReviewRepos(next)
    if (!on) setReviewPrs({})
  }

  const setReviewPrsForRepos = (repos, on) => {
    setReviewPrs((prev) => {
      const next = { ...prev }
      for (const repo of repos) {
        for (const p of (pullsByRepo[repo] || [])) {
          next[`${repo}#${p.number}`] = on
        }
      }
      return next
    })
  }

  const setAllLinkPick = (on) => {
    const next = {}
    for (const r of watchedRows) {
      if (r.repo_full_name) next[r.repo_full_name] = on
    }
    setLinkPick(next)
  }

  const toggleWatchedEnabled = (fullName) => {
    setWatchedRows((rows) => rows.map((r) => (
      r.repo_full_name === fullName ? { ...r, enabled: !r.enabled } : r
    )))
    setRepoPick((prev) => {
      const row = watchedRows.find((r) => r.repo_full_name === fullName)
      const nextOn = !(row?.enabled)
      return { ...prev, [fullName]: nextOn }
    })
  }

  const saveWatched = async () => {
    if (!activeConnector) {
      flash('warn', 'Select a connector first')
      return
    }
    const checks = Object.entries(watchPolicy.checks).filter(([, on]) => on).map(([id]) => id)
    const defaultChecks = checks.length ? checks : ['secrets', 'sast', 'iac', 'sbom', 'ai_review']
    const byName = {}
    for (const w of watchedRows) {
      if (!w.repo_full_name) continue
      byName[w.repo_full_name] = {
        repo_full_name: w.repo_full_name,
        repo_id: w.repo_id || '',
        enabled: !!w.enabled,
        service_name: w.service_name || '',
        profile: w.profile || form.profile || 'auto',
        checks: defaultChecks,
        min_severity: w.min_severity || minSev,
        ai_blocking: !!watchPolicy.ai_blocking,
        auto_request_reviewer: !!watchPolicy.auto_request_reviewer,
        auto_approve_min_score: Number(watchPolicy.auto_approve_min_score) || 0,
      }
    }
    for (const [name, on] of Object.entries(repoPick)) {
      if (!name) continue
      if (on) {
        const avail = availableRepos.find((r) => (r.full_name || r.repo_full_name) === name)
        byName[name] = {
          ...(byName[name] || {}),
          repo_full_name: name,
          repo_id: avail?.id || byName[name]?.repo_id || '',
          enabled: true,
          profile: form.profile || 'auto',
          checks: defaultChecks,
          min_severity: minSev,
          ai_blocking: !!watchPolicy.ai_blocking,
          auto_request_reviewer: !!watchPolicy.auto_request_reviewer,
          auto_approve_min_score: Number(watchPolicy.auto_approve_min_score) || 0,
        }
      } else if (byName[name]) {
        byName[name].enabled = false
      }
    }
    for (const name of extraRepos.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)) {
      byName[name] = {
        ...(byName[name] || {}),
        repo_full_name: name,
        enabled: true,
        profile: form.profile || 'auto',
        checks: defaultChecks,
        min_severity: minSev,
        ai_blocking: !!watchPolicy.ai_blocking,
        auto_request_reviewer: !!watchPolicy.auto_request_reviewer,
        auto_approve_min_score: Number(watchPolicy.auto_approve_min_score) || 0,
      }
    }
    const payload = Object.values(byName)
    if (!payload.length) {
      flash('warn', 'Select at least one repository')
      return
    }
    setBusy(true)
    try {
      const { data } = await axios.put(apiUrl(`/api/connectors/${encodeURIComponent(activeConnector)}/watched`), {
        repos: payload,
      })
      setWatchedRows(data.watched || [])
      flash('ok', 'Watched repos updated', `${(data.watched || []).length} repos`)
      setWatchRefresh((n) => n + 1)
    } catch (e) {
      flash('error', 'Watch update failed', e.response?.data || e.message)
    } finally {
      setBusy(false)
    }
  }

  const simulateJob = async () => {
    setBusy(true)
    try {
      const { data } = await axios.post(apiUrl('/api/scm/simulate'), {
        repo: extraRepos.split(/[\s,]+/).filter(Boolean)[0] || 'local/smoke-repo',
        pr: 1,
        service: form.service || 'node-smoke',
        profile: form.profile || 'auto',
      })
      flash('ok', 'Simulated SCM job', data.job_id)
      selectTab('jobs')
      scmJobs.reload?.()
    } catch (e) {
      flash('error', 'Simulate failed', e.response?.data || e.message)
    } finally {
      setBusy(false)
    }
  }

  const retryJob = async (id) => {
    try {
      await axios.post(apiUrl(`/api/scm/jobs/${encodeURIComponent(id)}/retry`))
      flash('ok', 'Job re-queued', id)
      scmJobs.reload?.()
    } catch (e) {
      flash('error', 'Retry failed', e.response?.data || e.message)
    }
  }

  const cancelJob = async (id) => {
    if (!window.confirm(`Cancel job ${String(id).slice(0, 18)}…? Waiting/queued jobs stop immediately; running work is interrupted best-effort.`)) {
      return
    }
    try {
      await axios.post(apiUrl(`/api/scm/jobs/${encodeURIComponent(id)}/cancel`))
      flash('ok', 'Job cancelled', id)
      scmJobs.reload?.()
    } catch (e) {
      flash('error', 'Cancel failed', e.response?.data || e.message)
    }
  }

  const runAiReview = async () => {
    const items = []
    selectedReviewRepos.forEach((repo) => {
      Object.keys(reviewPrs).forEach((key) => {
        if (!reviewPrs[key] || !key.startsWith(`${repo}#`)) return
        const pr = Number(key.slice(repo.length + 1))
        if (pr > 0) items.push({ repo_full_name: repo, pr_number: pr, connector_id: activeConnector || undefined })
      })
    })
    if (!items.length) {
      flash('error', 'Select at least one repo and PR')
      return
    }
    if (!scmSettings.data?.cursor_key_set && !scmSettings.data?.skip_cursor_ai) {
      const who = scmSettings.data?.user_id || 'current user'
      const org = scmSettings.data?.organization_id || 'selected org'
      flash(
        'error',
        'No CLI agent API key',
        scmSettings.data?.honesty ||
          `No key for ${who} in ${org}. Save personal (same username) or org key under Account — keys are not shared across usernames.`,
      )
    }
    setBusy(true)
    try {
      const { data } = await axios.post(apiUrl('/api/scm/opa-review/stack'), {
        items,
        force: !!aiReviewForm.force,
        ai_only: !!aiReviewForm.ai_only,
        preview_url: String(aiReviewForm.preview_url || '').trim() || undefined,
      })
      setLastStackId(data.stack_id || '')
      setStackStatus(data)
      setLastAiJobId((data.job_ids || [])[0] || '')
      const note = data.note ? ` · ${data.note}` : ''
      flash('ok', 'OPA Review stack queued', `${data.stack_id || ''} · ${(data.job_ids || []).length} job(s)${note}`)
      selectTab('jobs')
      scmJobs.reload?.()
    } catch (e) {
      const raw = e.response?.data
      const detail = typeof raw === 'string'
        ? raw
        : (raw?.error ? `${raw.error}${raw.count != null ? ` (selected ${raw.count}${raw.max != null ? `, max ${raw.max}` : ''})` : ''}` : (e.message || 'request failed'))
      flash('error', 'OPA Review stack failed', detail)
    } finally {
      setBusy(false)
    }
  }

  const rerunAiOnly = async (job) => {
    if (!job?.id || !job.pr_number) return
    setJobActionBusy(true)
    try {
      const { data } = await axios.post(apiUrl(`/api/scm/jobs/${encodeURIComponent(job.id)}/ai-review`), {
        force: true,
        ai_only: true,
      })
      setLastAiJobId(data.job_id || '')
      flash('ok', 'Bugbot re-run queued', data.job_id || data.honesty || '')
      scmJobs.reload?.()
    } catch (e) {
      flash('error', 'Bugbot re-run failed', e.response?.data || e.message)
    } finally {
      setJobActionBusy(false)
    }
  }

  const rerunFullReview = async (job) => {
    if (!job?.id || !job.pr_number) return
    setJobActionBusy(true)
    try {
      const { data } = await axios.post(apiUrl(`/api/scm/jobs/${encodeURIComponent(job.id)}/ai-review`), {
        force: true,
        ai_only: false,
      })
      setLastAiJobId(data.job_id || '')
      flash('ok', 'Full OPA Review queued', data.job_id || '')
      scmJobs.reload?.()
    } catch (e) {
      flash('error', 'Full OPA Review failed', e.response?.data || e.message)
    } finally {
      setJobActionBusy(false)
    }
  }

  const requestCloudAutofix = async (job, { createPr = true } = {}) => {
    if (!job?.id) return
    setJobActionBusy(true)
    try {
      let detail = selectedJobDetail && String(selectedJobDetail.id) === String(job.id)
        ? selectedJobDetail
        : null
      if (!detail) {
        const { data } = await axios.get(apiUrl(`/api/scm/jobs/${encodeURIComponent(job.id)}`))
        detail = data
        setSelectedJobDetail(data || null)
      }
      const findings = findingsFromJob(detail || job)
      const keys = findings
        .map((f) => f.finding_key || f.key || '')
        .map((k) => String(k || '').trim())
        .filter(Boolean)
      if (!keys.length) {
        flash('error', 'Cloud autofix needs finding keys', 'Open the job page or wait for findings to hydrate on the detail GET.')
        return
      }
      const { data } = await axios.post(apiUrl(`/api/scm/jobs/${encodeURIComponent(job.id)}/auto-fix`), {
        finding_keys: keys,
        create_pr: !!createPr,
      })
      flash('ok', createPr ? 'Cloud fix PR queued' : 'Cloud autofix queued', data.auto_fix_id || data.honesty || '')
      scmJobs.reload?.()
    } catch (e) {
      const raw = e.response?.data
      const detail = typeof raw === 'string' ? raw : (raw?.error || e.message)
      flash('error', 'Cloud autofix failed', detail)
    } finally {
      setJobActionBusy(false)
    }
  }

  const resumeStalledJobs = async () => {
    setJobActionBusy(true)
    try {
      const { data } = await axios.post(apiUrl('/api/scm/jobs/resume'))
      flash(
        'ok',
        'Resume kicked',
        `${data.stacks_resumed ?? 0} stack(s) · ${data.queued_dispatched ?? 0} queued · ${data.honesty || ''}`,
      )
      scmJobs.reload?.()
    } catch (e) {
      flash('error', 'Resume failed', e.response?.data || e.message)
    } finally {
      setJobActionBusy(false)
    }
  }

  const cancelReviewStack = async () => {
    if (!lastStackId) return
    if (!window.confirm(`Cancel OPA Review stack ${String(lastStackId).slice(0, 18)}…?`)) return
    setJobActionBusy(true)
    try {
      const { data } = await axios.post(apiUrl(`/api/scm/opa-review/stacks/${encodeURIComponent(lastStackId)}/cancel`))
      setStackStatus(data)
      flash('ok', 'Stack cancel requested', `${data.cancelled ?? 0} job(s) cancelled`)
      scmJobs.reload?.()
    } catch (e) {
      flash('error', 'Stack cancel failed', e.response?.data || e.message)
    } finally {
      setJobActionBusy(false)
    }
  }

  const saveContext = async () => {
    const title = String(ctxForm.title || '').trim()
    const repo = String(ctxForm.repo_full_name || selectedReviewRepos[0] || '').trim()
    if (!title || !repo) {
      flash('error', 'Context needs title and repo')
      return
    }
    setBusy(true)
    try {
      if (ctxEditingId) {
        await axios.patch(apiUrl(`/api/scm/contexts/${encodeURIComponent(ctxEditingId)}`), {
          title,
          body_markdown: ctxForm.body_markdown,
          repo_full_name: repo,
          tags: ctxForm.tags_design ? ['design', 'ui'] : [],
        })
        flash('ok', 'Context updated')
      } else {
        await axios.post(apiUrl('/api/scm/contexts'), {
          title,
          body_markdown: ctxForm.body_markdown,
          repo_full_name: repo,
          connector_id: activeConnector || undefined,
          tags: ctxForm.tags_design ? ['design', 'ui'] : [],
        })
        flash('ok', 'Context created')
      }
      setCtxForm({ title: '', body_markdown: '', repo_full_name: repo, tags_design: false })
      setCtxEditingId('')
      setWatchRefresh((n) => n + 1)
    } catch (e) {
      flash('error', 'Save context failed', e.response?.data || e.message)
    } finally {
      setBusy(false)
    }
  }

  const deleteContext = async (id) => {
    if (!id || !window.confirm('Delete this reviewer context?')) return
    try {
      await axios.delete(apiUrl(`/api/scm/contexts/${encodeURIComponent(id)}`))
      flash('ok', 'Context deleted')
      setWatchRefresh((n) => n + 1)
    } catch (e) {
      flash('error', 'Delete failed', e.response?.data || e.message)
    }
  }

  const generateContext = async () => {
    const repo = String(ctxForm.repo_full_name || selectedReviewRepos[0] || '').trim()
    if (!repo) {
      flash('error', 'Pick a repo for Generate')
      return
    }
    setBusy(true)
    try {
      const { data } = await axios.post(apiUrl('/api/scm/contexts/generate'), {
        repo_full_name: repo,
        connector_id: activeConnector || undefined,
        title: ctxForm.title || undefined,
      })
      if (data.status === 'skipped') {
        flash('error', 'Generate skipped', data.honesty || data.reason)
      } else {
        flash('ok', 'Draft generated', data.status)
      }
      const draft = data.draft || {}
      setGenDraft(draft)
      setCtxForm({
        title: draft.title || ctxForm.title || `Reviewer context — ${repo}`,
        body_markdown: draft.body_markdown || '',
        repo_full_name: repo,
        tags_design: Array.isArray(draft.tags) && draft.tags.some((t) => ['design', 'ui'].includes(String(t))),
      })
      setCtxEditingId('')
    } catch (e) {
      flash('error', 'Generate failed', e.response?.data || e.message)
    } finally {
      setBusy(false)
    }
  }

  const linkSelectedRepos = async (clear = false) => {
    const names = Object.entries(linkPick).filter(([, on]) => on).map(([n]) => n)
    if (!names.length) {
      flash('error', 'Select at least two watched repos to link')
      return
    }
    setBusy(true)
    try {
      const { data } = await axios.put(apiUrl('/api/scm/context-links'), {
        repo_full_names: names,
        clear: !!clear,
      })
      flash('ok', clear ? 'Link group cleared' : 'Repos linked', data.link_group_id || '')
      setWatchRefresh((n) => n + 1)
    } catch (e) {
      flash('error', 'Link failed', e.response?.data || e.message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!activeRunId || !RUN_CONTEXT_TABS.has(tab)) {
      setRunDetail(null)
      setRunFindings(null)
      return undefined
    }
    let cancelled = false
    const tick = async () => {
      try {
        const [d, f] = await Promise.all([
          axios.get(apiUrl(`/api/security/runs/${encodeURIComponent(activeRunId)}`)),
          axios.get(apiUrl(`/api/security/runs/${encodeURIComponent(activeRunId)}/findings`)),
        ])
        if (cancelled) return
        setRunDetail(d.data)
        setRunFindings(f.data)
        const st = String(d.data?.status || '')
        if (st === 'running' || st === '') {
          /* keep polling */
        } else {
          secrets.reload?.()
          sast.reload?.()
          iac.reload?.()
          runs.reload?.()
        }
      } catch {
        /* ignore transient */
      }
    }
    tick()
    const t = setInterval(tick, 2000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [activeRunId, tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const parseSummary = (r) => {
    try {
      return typeof r?.summary_json === 'string' ? JSON.parse(r.summary_json || '{}') : (r?.summary_json || {})
    } catch {
      return {}
    }
  }

  const scmJobStatusHint = (status) => {
    switch (String(status || '').toLowerCase()) {
      case 'running': return 'Actively processing'
      case 'queued': return 'Next to run — slot reserved / ready'
      case 'waiting': return 'Backlog — waiting for a free slot or prior stack item'
      case 'completed': return 'Finished successfully'
      case 'cancelled': return 'Cancelled before or during run'
      case 'failed':
      case 'error': return 'Finished with an error'
      default: return ''
    }
  }

  const scmJobStatusRank = (status) => {
    switch (String(status || '').toLowerCase()) {
      case 'running': return 0
      case 'queued': return 1
      case 'waiting': return 2
      case 'failed':
      case 'error': return 3
      case 'cancelled': return 4
      case 'completed': return 5
      default: return 6
    }
  }

  const scmJobRows = useMemo(() => {
    const raw = [...(scmJobs.data?.jobs || [])]
    raw.sort((a, b) => {
      const ra = scmJobStatusRank(a.status)
      const rb = scmJobStatusRank(b.status)
      if (ra !== rb) return ra - rb
      return String(b.started_at || '').localeCompare(String(a.started_at || ''))
    })
    // Run-centric when kind/run_id present; legacy rows (no run_id) unchanged.
    return groupScmJobsForDisplay(raw)
  }, [scmJobs.data])

  const jobStatusFilter = tab === 'jobs' ? resolveJobStatusFilter(searchParams) : ''
  const jobSeverityFilter = tab === 'jobs' ? resolveJobSeverityFilter(searchParams) : ''
  const jobRepoFilter = tab === 'jobs' ? String(searchParams.get('repo') || '') : ''
  const jobQFilter = tab === 'jobs' ? String(searchParams.get('q') || '') : ''
  const jobFiltersActive = !!(jobStatusFilter || jobSeverityFilter || jobRepoFilter || jobQFilter)

  const scmJobRepos = useMemo(() => {
    const set = new Set()
    for (const j of scmJobRows) {
      const name = String(j.repo_full_name || '').trim()
      if (name) set.add(name)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [scmJobRows])

  const filteredScmJobRows = useMemo(() => {
    const q = jobQFilter.trim().toLowerCase()
    return scmJobRows.filter((j) => {
      if (!jobMatchesStatusFilter(j.status, jobStatusFilter)) return false
      if (!jobMatchesSeverityFilter(scmJobResultMeta(j).severity, jobSeverityFilter)) return false
      if (jobRepoFilter && String(j.repo_full_name || '') !== jobRepoFilter) return false
      if (q) {
        const hay = [
          j.id,
          j.repo_full_name,
          j.pr_number,
          j.summary?.stack_id,
          j.kind,
          j.run_id,
          ...(j._runChildren || []).map((c) => c.kind),
        ].map((x) => String(x ?? '').toLowerCase()).join(' ')
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [scmJobRows, jobStatusFilter, jobSeverityFilter, jobRepoFilter, jobQFilter])

  useEffect(() => {
    if (tab !== 'jobs') return undefined
    if (!filteredScmJobRows.length) {
      if (selectedJobId) setSelectedJobId('')
      return undefined
    }
    const stillVisible = filteredScmJobRows.some((r) => String(r.id) === String(selectedJobId))
    if (!selectedJobId || !stillVisible) {
      setSelectedJobId(String(filteredScmJobRows[0].id))
    }
    return undefined
  }, [tab, filteredScmJobRows, selectedJobId])

  useEffect(() => {
    if (tab !== 'jobs' || !selectedJobId) {
      setSelectedJobDetail(null)
      setSelectedJobDetailLoading(false)
      return undefined
    }
    let cancelled = false
    setSelectedJobDetailLoading(true)
    axios.get(apiUrl(`/api/scm/jobs/${encodeURIComponent(selectedJobId)}`))
      .then(({ data }) => {
        if (!cancelled) setSelectedJobDetail(data || null)
      })
      .catch(() => {
        if (!cancelled) setSelectedJobDetail(null)
      })
      .finally(() => {
        if (!cancelled) setSelectedJobDetailLoading(false)
      })
    return () => { cancelled = true }
  }, [tab, selectedJobId, scmJobs.data])

  const selectedJobRow = useMemo(() => {
    const listRow = filteredScmJobRows.find((r) => String(r.id) === String(selectedJobId))
      || scmJobRows.find((r) => String(r.id) === String(selectedJobId))
      || null
    if (!listRow) return selectedJobDetail
    if (!selectedJobDetail || String(selectedJobDetail.id) !== String(selectedJobId)) return listRow
    return {
      ...listRow,
      ...selectedJobDetail,
      summary: {
        ...(listRow.summary || {}),
        ...(selectedJobDetail.summary || {}),
      },
      _runChildren: listRow._runChildren || selectedJobDetail.children,
      findings: findingsFromJob(selectedJobDetail).length
        ? findingsFromJob(selectedJobDetail)
        : findingsFromJob(listRow),
    }
  }, [filteredScmJobRows, scmJobRows, selectedJobId, selectedJobDetail])

  const scmJobCounts = useMemo(() => {
    const fromApi = scmJobs.data?.counts
    if (fromApi && typeof fromApi === 'object') return fromApi
    const counts = {}
    for (const j of scmJobRows) {
      const st = j.status || 'unknown'
      counts[st] = (counts[st] || 0) + 1
    }
    return counts
  }, [scmJobs.data, scmJobRows])

  const scmJobTotal = scmJobs.data?.total ?? scmJobRows.length

  const scmWebhookRows = useMemo(() => {
    const rows = scmWebhooks.data?.webhooks || []
    return Array.isArray(rows) ? rows : []
  }, [scmWebhooks.data])
  const scmWebhookCounts = useMemo(() => {
    const c = { ...(scmWebhooks.data?.counts || {}) }
    if (Object.keys(c).length) return c
    const out = {}
    for (const w of scmWebhookRows) {
      const o = String(w.outcome || 'unknown')
      out[o] = (out[o] || 0) + 1
    }
    return out
  }, [scmWebhooks.data, scmWebhookRows])
  const scmWebhookTotal = scmWebhooks.data?.total ?? scmWebhookRows.length
  const webhookDetail = useMemo(
    () => scmWebhookRows.find((w) => w.id === webhookDetailId) || null,
    [scmWebhookRows, webhookDetailId],
  )

  const ExtLink = ({ href, children, className, style, title }) => (
    href
      ? <a href={href} target="_blank" rel="noopener noreferrer" className={className} style={style} title={title || href}>{children}</a>
      : <span className={className} style={style}>{children}</span>
  )

  const vulnCols = [
    { key: 'severity', header: 'Sev', render: (r) => <StatusPill tone={sevTone(r.severity)}>{r.severity}</StatusPill> },
    { key: 'advisory_id', header: 'Advisory', render: (r) => <span className="opa-mono cell-strong">{r.advisory_id}</span> },
    { key: 'package_name', header: 'Package', render: (r) => <span className="opa-mono">{r.package_name}@{r.version}</span> },
    { key: 'service', header: 'Service', render: (r) => (r.service ? <Link to={serviceHref(r.service)}>{r.service}</Link> : '—') },
    { key: 'reachability', header: 'Reachability', render: (r) => (
      r.reachability === 'observed'
        ? <StatusPill tone="error"><FiEye size={10} /> observed</StatusPill>
        : <StatusPill tone="neutral"><FiEyeOff size={10} /> not observed</StatusPill>
    ) },
    { key: 'path_hits', header: 'Hits', num: true, render: (r) => fmtNum(r.path_hits) },
    { key: 'summary', header: 'Summary', render: (r) => <span className="opa-muted">{r.summary}</span> },
  ]

  const invCols = [
    { key: 'service', header: 'Service', render: (r) => (r.service ? <Link to={serviceHref(r.service)}>{r.service}</Link> : '—') },
    { key: 'ecosystem', header: 'Eco', render: (r) => <Badge>{r.ecosystem || '—'}</Badge> },
    { key: 'package_name', header: 'Package', render: (r) => <span className="opa-mono">{r.package_name}</span> },
    { key: 'version', header: 'Version', render: (r) => <span className="opa-mono">{r.version}</span> },
    { key: 'release', header: 'Release' },
    { key: 'scraped_at', header: 'When', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.scraped_at)}</span> },
  ]

  const iastCols = [
    { key: 'sink', header: 'Sink', render: (r) => <Badge>{r.sink}</Badge> },
    { key: 'blocked', header: 'Blocked', render: (r) => (r.blocked === 1 || r.blocked === true || r.blocked === '1'
      ? <StatusPill tone="error">blocked</StatusPill>
      : <StatusPill tone="neutral">detect</StatusPill>) },
    { key: 'detector', header: 'Detector', render: (r) => <Badge>{r.detector || '—'}</Badge> },
    { key: 'service', header: 'Service', render: (r) => (r.service ? <Link to={serviceHref(r.service)}>{r.service}</Link> : '—') },
    { key: 'route', header: 'Route', render: (r) => <span className="opa-mono">{r.route || '—'}</span> },
    { key: 'evidence', header: 'Evidence', render: (r) => <span className="opa-mono" style={{ fontSize: 11 }}>{String(r.evidence || '').slice(0, 120)}</span> },
    { key: 'trace_id', header: 'Trace', render: (r) => <span className="opa-mono opa-muted">{r.trace_id ? String(r.trace_id).slice(0, 12) : '—'}</span> },
    { key: 'scraped_at', header: 'When', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.scraped_at)}</span> },
  ]

  const secretCols = [
    { key: 'severity', header: 'Sev', render: (r) => <StatusPill tone={sevTone(r.severity)}>{r.severity}</StatusPill> },
    { key: 'rule', header: 'Rule', render: (r) => <span className="opa-mono cell-strong">{r.rule || '—'}</span> },
    { key: 'file', header: 'File', render: (r) => <span className="opa-mono">{r.file || '—'}:{r.line || 0}</span> },
    { key: 'service', header: 'Service', render: (r) => (r.service ? <Link to={serviceHref(r.service)}>{r.service}</Link> : '—') },
    { key: 'detector', header: 'Detector', render: (r) => <Badge>{r.detector || '—'}</Badge> },
    { key: 'security_run_id', header: 'Run', render: (r) => (r.security_run_id
      ? <Link to={securityRunHref(r.security_run_id)} className="opa-mono" style={{ fontSize: 11 }}>{String(r.security_run_id).slice(0, 14)}</Link>
      : '—') },
    { key: 'snippet', header: 'Snippet', render: (r) => <span className="opa-mono opa-muted" style={{ fontSize: 11 }}>{String(r.snippet || '').slice(0, 80)}</span> },
    { key: 'scraped_at', header: 'When', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.scraped_at)}</span> },
  ]

  const sastCols = [
    { key: 'severity', header: 'Sev', render: (r) => <StatusPill tone={sevTone(r.severity)}>{r.severity}</StatusPill> },
    { key: 'rule', header: 'Rule', render: (r) => <span className="opa-mono cell-strong">{r.rule || '—'}</span> },
    { key: 'file', header: 'File', render: (r) => <span className="opa-mono">{r.file || '—'}:{r.line || 0}</span> },
    { key: 'service', header: 'Service', render: (r) => (r.service ? <Link to={serviceHref(r.service)}>{r.service}</Link> : '—') },
    { key: 'security_run_id', header: 'Run', render: (r) => (r.security_run_id
      ? <Link to={securityRunHref(r.security_run_id)} className="opa-mono" style={{ fontSize: 11 }}>{String(r.security_run_id).slice(0, 14)}</Link>
      : '—') },
    { key: 'message', header: 'Message', render: (r) => <span className="opa-muted" style={{ fontSize: 11 }}>{String(r.message || '').slice(0, 120)}</span> },
    { key: 'scraped_at', header: 'When', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.scraped_at)}</span> },
  ]

  const iacCols = [
    { key: 'severity', header: 'Sev', render: (r) => <StatusPill tone={sevTone(r.severity)}>{r.severity}</StatusPill> },
    { key: 'kind', header: 'Kind', render: (r) => <Badge>{r.kind || 'iac'}</Badge> },
    { key: 'rule', header: 'Rule', render: (r) => <span className="opa-mono cell-strong">{r.rule || '—'}</span> },
    { key: 'file', header: 'File', render: (r) => <span className="opa-mono">{r.file || '—'}</span> },
    { key: 'security_run_id', header: 'Run', render: (r) => (r.security_run_id
      ? <Link to={securityRunHref(r.security_run_id)} className="opa-mono" style={{ fontSize: 11 }}>{String(r.security_run_id).slice(0, 14)}</Link>
      : '—') },
    { key: 'message', header: 'Message', render: (r) => <span className="opa-muted" style={{ fontSize: 11 }}>{String(r.message || '').slice(0, 120)}</span> },
    { key: 'scraped_at', header: 'When', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.scraped_at)}</span> },
  ]

  const runCols = [
    {
      key: 'id', header: 'Run',
      render: (r) => (
        <button type="button" className="opa-btn ghost" style={{ padding: 0 }} onClick={() => selectRun(r.id)}>
          <span className="opa-mono cell-strong" style={{ fontSize: 11 }}>{String(r.id).slice(0, 18)}</span>
        </button>
      ),
    },
    { key: 'service', header: 'Service' },
    { key: 'profile', header: 'Profile', render: (r) => <Badge>{r.profile || 'auto'}</Badge> },
    {
      key: 'status', header: 'Status',
      render: (r) => (
        <StatusPill tone={r.status === 'completed' ? 'ok' : r.status?.includes('error') ? 'error' : 'neutral'}>
          {r.status || '—'}
        </StatusPill>
      ),
    },
    {
      key: 'summary', header: 'Counts',
      render: (r) => {
        const sm = parseSummary(r)
        const c = sm.counts || {}
        return <span className="opa-muted" style={{ fontSize: 11 }}>{Object.keys(c).length ? JSON.stringify(c) : (r.scanners_json || '—')}</span>
      },
    },
    { key: 'started_at', header: 'When', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.started_at)}</span> },
  ]

  const profileRows = profiles.data?.profiles || []
  const workspace = profiles.data?.workspace || runs.data?.workspace || '/workspace'
  const connectorList = connectors.data?.connectors || []
  const activeConnectorRow = connectorList.find((c) => c.id === activeConnector)
  const connectorMissing = !!activeConnector && !connectors.loading && !activeConnectorRow
  const connectorNeedsReconnect = !!activeConnector && (
    reposMeta.error === 'connector_not_in_memory'
    || reposMeta.error === 'connector_token_unavailable'
    || reposMeta.error === 'connector_token_missing'
    || reposMeta.error === 'connector_not_found'
    || (activeConnectorRow && activeConnectorRow.has_token === false)
  )

  return (
    <div className="opa-stack">
      <div className="opa-page-head" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h1 className="opa-page-title">Security</h1>
          <div className="opa-page-sub">CVE reachability · IAST · secrets (gitleaks|lite) · SAST-lite · IaC · scan runs · Repo Watch · AppSec Gate · OPA Review</div>
        </div>
        <button type="button" className="opa-btn primary" disabled={busy} onClick={() => selectTab('scans')}>
          <FiPlay size={12} /> Start scan
        </button>
      </div>

      {banner && (
        <div className="opa-banner" role="status" style={{
          display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2)',
        }}>
          <div>
            <div className="cell-strong">{banner.title}</div>
            {banner.detail && (
              <div className="opa-muted" style={{ fontSize: 12, marginTop: 4 }}>
                {typeof banner.detail === 'string' ? banner.detail : JSON.stringify(banner.detail)}
              </div>
            )}
          </div>
          <button type="button" className="opa-btn ghost" onClick={() => setBanner(null)}>Dismiss</button>
        </div>
      )}

      <div className="opa-tabs">
        <button type="button" className={`opa-tab ${tab === 'vulns' ? 'active' : ''}`} onClick={() => selectTab('vulns')}>Vulnerabilities</button>
        <button type="button" className={`opa-tab ${tab === 'iast' ? 'active' : ''}`} onClick={() => selectTab('iast')}>IAST</button>
        <button type="button" className={`opa-tab ${tab === 'secrets' ? 'active' : ''}`} onClick={() => selectTab('secrets')}>Secrets</button>
        <button type="button" className={`opa-tab ${tab === 'sast' ? 'active' : ''}`} onClick={() => selectTab('sast')}>SAST</button>
        <button type="button" className={`opa-tab ${tab === 'iac' ? 'active' : ''}`} onClick={() => selectTab('iac')}>IaC</button>
        <button type="button" className={`opa-tab ${tab === 'scans' ? 'active' : ''}`} onClick={() => selectTab('scans')}>Scans</button>
        <button type="button" className={`opa-tab ${tab === 'watch' ? 'active' : ''}`} onClick={() => selectTab('watch')}>Repo Watch</button>
        <button type="button" className={`opa-tab ${tab === 'jobs' ? 'active' : ''}`} onClick={() => selectTab('jobs')}>PR Jobs</button>
        <button type="button" className={`opa-tab ${tab === 'agents' ? 'active' : ''}`} onClick={() => selectTab('agents')}>Agents</button>
        <button type="button" className={`opa-tab ${tab === 'webhooks' ? 'active' : ''}`} onClick={() => selectTab('webhooks')}>Webhooks</button>
        <button type="button" className={`opa-tab ${tab === 'inventory' ? 'active' : ''}`} onClick={() => selectTab('inventory')}>Inventory</button>
        <button type="button" className={`opa-tab ${tab === 'policies' ? 'active' : ''}`} onClick={() => selectTab('policies')}>Policies</button>
        <button type="button" className={`opa-tab ${tab === 'pr' ? 'active' : ''}`} onClick={() => selectTab('pr')}>Gate</button>
      </div>

      {activeRunId && tab !== 'scans' && (tab === 'secrets' || tab === 'sast' || tab === 'iac') && (
        <div className="opa-muted" style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          Filtering by run <code className="opa-mono">{activeRunId}</code>
          <button type="button" className="opa-btn ghost" onClick={() => selectRun('')}>Clear</button>
          <Link to={securityRunHref(activeRunId)}>Open run</Link>
        </div>
      )}

      {tab === 'vulns' && (
        <>
          <div className="opa-grid cols-4">
            <KpiTile label="Findings" icon={<FiShield size={12} />} value={fmtNum(s.findings || 0)} status="neutral" />
            <KpiTile label="Critical / High" icon={<FiAlertTriangle size={12} />} value={fmtNum((Number(s.critical) || 0) + (Number(s.high) || 0))}
              status={Number(s.critical) || Number(s.high) ? 'error' : 'neutral'} />
            <KpiTile label="Observed in prod" icon={<FiEye size={12} />} value={fmtNum(s.observed || 0)}
              status={Number(s.observed) ? 'warn' : 'neutral'}
              footer={<span className="opa-muted" style={{ fontSize: 11 }}>not observed ≠ safe</span>} />
            <KpiTile label="Not observed" icon={<FiEyeOff size={12} />} value={fmtNum(s.not_observed || 0)} status="neutral" />
          </div>
          <Panel title="Findings (reachability-ranked)" icon={<FiShield />} flush loading={findings.loading} error={findings.error}
            empty={!findings.loading && vulnRows.length === 0} emptyText="POST a SBOM to /v1/sbom to seed inventory + match advisories">
            <DataTable columns={vulnCols} rows={vulnRows} rowKey={(r, i) => `${r.advisory_id}:${r.package_name}:${i}`} maxHeight={480} />
          </Panel>
        </>
      )}

      {tab === 'iast' && (
        <>
          <div className="opa-grid cols-4">
            <KpiTile label="Findings (24h)" icon={<FiCrosshair size={12} />} value={fmtNum(is.findings || 0)} status="neutral" />
            <KpiTile label="SQL" value={fmtNum(is.sql_sinks || 0)} status="neutral" />
            <KpiTile label="Command" value={fmtNum(is.command_sinks || 0)} status="neutral" />
            <KpiTile label="File / Deserialize" value={fmtNum((Number(is.file_sinks) || 0) + (Number(is.deserialize_sinks) || 0))} status="neutral" />
          </div>
          <Panel title="Runtime sink detections" icon={<FiCrosshair />} flush loading={iast.loading} error={iast.error}
            empty={!iast.loading && iastRows.length === 0} emptyText="No IAST findings — enable OPA_IAST=1 / opa.iast on PHP (block is opt-in via opa.iast_block). IAST is runtime-only and cannot be started from Scans.">
            <DataTable columns={iastCols} rows={iastRows} rowKey={(r, i) => `${r.sink}:${r.scraped_at}:${i}`} maxHeight={480} />
          </Panel>
        </>
      )}

      {tab === 'secrets' && (
        <Panel title="Secret findings" icon={<FiKey />} flush loading={secrets.loading} error={secrets.error}
          empty={!secrets.loading && filteredSecrets.length === 0}
          emptyText="Start a scan from the Scans tab, or POST to /v1/security/secrets"
          actions={
            <label className="opa-muted" style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
              Min sev
              <select value={minSev} onChange={(e) => saveSev(e.target.value)}>
                <option value="critical">critical</option>
                <option value="high">high</option>
                <option value="medium">medium</option>
                <option value="low">low</option>
              </select>
            </label>
          }>
          <div className="opa-muted" style={{ fontSize: 11, padding: '8px 12px 0' }}>
            Detector chip shows <Badge>gitleaks</Badge> when the Agent image has the CLI, otherwise <Badge>embedded-secret-scan</Badge> (lite regex).
          </div>
          <DataTable columns={secretCols} rows={filteredSecrets} rowKey={(r, i) => `${r.rule}:${r.file}:${i}`} maxHeight={480} />
        </Panel>
      )}

      {tab === 'sast' && (
        <Panel title="SAST-lite findings" icon={<FiCode />} flush loading={sast.loading} error={sast.error}
          empty={!sast.loading && sastRows.length === 0}
          emptyText="Start a lite SAST scan from Scans, or POST to /v1/security/sast — pattern scan, not a full SAST engine">
          <DataTable columns={sastCols} rows={sastRows} rowKey={(r, i) => `${r.rule}:${r.file}:${i}`} maxHeight={480} />
        </Panel>
      )}

      {tab === 'iac' && (
        <Panel title="IaC / container findings" icon={<FiServer />} flush loading={iac.loading} error={iac.error}
          empty={!iac.loading && iacRows.length === 0}
          emptyText="Start an IaC/container lite scan from Scans, or POST /v1/security/iac — stub heuristics">
          <DataTable columns={iacCols} rows={iacRows} rowKey={(r, i) => `${r.kind}:${r.rule}:${r.file}:${i}`} maxHeight={480} />
        </Panel>
      )}

      {tab === 'scans' && (
        <>
          <Panel title="Start security scan" icon={<FiPlay />}
            actions={
              <button type="button" className="opa-btn primary" disabled={busy} onClick={startScan}>
                <FiPlay size={12} /> {busy ? 'Starting…' : 'Start scan'}
              </button>
            }>
            <p className="opa-muted" style={{ marginTop: 0, fontSize: 13 }}>
              Runs workspace scanners against the Agent mount (<code>{workspace}</code>). Secrets use Gitleaks when installed, otherwise embedded lite regex; SAST/IaC/container remain lite/stub.
              IAST is runtime-only and is not started here. CI scripts can still POST <code>/v1/security/*</code> directly.
            </p>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                Service
                <select value={form.service} onChange={(e) => setForm((f) => ({ ...f, service: e.target.value }))}>
                  {serviceNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  <option value="workspace-scan">workspace-scan</option>
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                Profile
                <select value={form.profile} onChange={(e) => setForm((f) => ({ ...f, profile: e.target.value, scanners: [] }))}>
                  {(profileRows.length ? profileRows : [
                    { id: 'auto' }, { id: 'php' }, { id: 'node' }, { id: 'container' }, { id: 'iac' }, { id: 'full' },
                  ]).map((p) => (
                    <option key={p.id} value={p.id}>{p.label || p.id}</option>
                  ))}
                </select>
                <span className="opa-muted">{PROFILE_HINTS[form.profile] || ''}</span>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                Path (under workspace)
                <input
                  className="opa-mono"
                  placeholder="(default root)"
                  value={form.target_path}
                  onChange={(e) => setForm((f) => ({ ...f, target_path: e.target.value }))}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                Image (container stub)
                <input
                  className="opa-mono"
                  placeholder="app:latest"
                  value={form.image}
                  onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))}
                />
              </label>
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SCANNER_OPTS.map((sOpt) => (
                <label key={sOpt.id} style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={form.scanners.includes(sOpt.id)}
                    onChange={() => toggleScanner(sOpt.id)}
                  />
                  {sOpt.label}
                  <Badge>{sOpt.mode}</Badge>
                </label>
              ))}
            </div>
            <div className="opa-muted" style={{ fontSize: 11, marginTop: 8 }}>
              Leave scanners unchecked to use the profile defaults (or auto-detect from files).
            </div>
          </Panel>

          <div className="opa-grid cols-4">
            <KpiTile label="Runs" icon={<FiRefreshCw size={12} />} value={fmtNum(runRows.length)} status="neutral" />
            <KpiTile label="Active" value={runDetail?.status || (activeRunId ? '…' : '—')}
              status={String(runDetail?.status || '').includes('error') ? 'error' : runDetail?.status === 'completed' ? 'ok' : 'neutral'} />
            <KpiTile label="Secrets (run)" value={fmtNum(runFindings?.counts?.secrets || 0)} status="neutral" />
            <KpiTile label="SAST + IaC (run)" value={fmtNum((runFindings?.counts?.sast || 0) + (runFindings?.counts?.iac || 0))} status="neutral" />
          </div>

          {activeRunId && (
            <Panel title="Active run" icon={<FiShield />}
              actions={<button type="button" className="opa-btn ghost" onClick={() => selectRun('')}>Clear</button>}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                <span className="opa-mono" style={{ fontSize: 12 }}>{activeRunId}</span>
                <StatusPill tone="neutral">{runDetail?.status || '—'}</StatusPill>
                {runDetail?.service && <Link to={serviceHref(runDetail.service)}>{runDetail.service}</Link>}
                <button type="button" className="opa-btn ghost" onClick={() => { selectTab('secrets'); }}>View secrets</button>
                <button type="button" className="opa-btn ghost" onClick={() => { selectTab('sast'); }}>View SAST</button>
                <button type="button" className="opa-btn ghost" onClick={() => { selectTab('iac'); }}>View IaC</button>
              </div>
              <pre className="opa-mono" style={{ fontSize: 11, background: 'var(--surface-2)', padding: 12, overflow: 'auto' }}>
                {JSON.stringify({
                  status: runDetail?.status,
                  summary: parseSummary(runDetail),
                  findings: runFindings?.counts,
                  error: runDetail?.error,
                  honesty: parseSummary(runDetail)?.honesty || 'gitleaks|lite secrets; other scanners lite/stub',
                  secrets_detector: parseSummary(runDetail)?.secrets_detector,
                }, null, 2)}
              </pre>
            </Panel>
          )}

          <Panel title="Past runs" icon={<FiRefreshCw />} flush loading={runs.loading} error={runs.error}
            empty={!runs.loading && runRows.length === 0} emptyText="No security runs yet — start one above">
            <DataTable columns={runCols} rows={runRows} rowKey={(r) => r.id} maxHeight={360} />
          </Panel>
        </>
      )}

      {tab === 'inventory' && (
        <Panel title="Service dependencies" icon={<FiShield />} flush loading={inventory.loading} error={inventory.error}
          empty={!inventory.loading && pkgRows.length === 0} emptyText="No inventory yet — run an SBOM scan or POST /v1/sbom">
          <DataTable columns={invCols} rows={pkgRows} rowKey={(r, i) => `${r.service}:${r.package_name}:${r.version}:${i}`} maxHeight={520} />
        </Panel>
      )}

      {tab === 'policies' && (
        <Panel title="Policies" icon={<FiSliders />} loading={policies.loading}>
          <p className="opa-muted" style={{ marginTop: 0 }}>
            Local severity threshold is stored in <code>localStorage</code> (<code>{SEV_KEY}</code>).
            Agent env: <code>OPA_SECURITY_MIN_SEVERITY</code>, scanner auth via <code>OPA_SECURITY_INGEST_TOKEN</code>
            (optional <code>OPA_SECURITY_OIDC_REQUIRE=1</code>). PHP block: <code>opa.iast_block</code> (mysqli + PDO).
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <label>
              Dashboard min severity{' '}
              <select value={minSev} onChange={(e) => saveSev(e.target.value)}>
                <option value="critical">critical</option>
                <option value="high">high</option>
                <option value="medium">medium</option>
                <option value="low">low</option>
              </select>
            </label>
          </div>
          <pre className="opa-mono" style={{ fontSize: 12, background: 'var(--surface-2)', padding: 12 }}>
            {JSON.stringify(policies.data || { min_severity: minSev }, null, 2)}
          </pre>
        </Panel>
      )}

      {tab === 'pr' && (
        <Panel title="AppSec Gate" icon={<FiCheckCircle />} loading={prCheck.loading} error={prCheck.error}>
          <p className="opa-muted" style={{ marginTop: 0 }}>
            <strong>Tenant gate</strong> aggregates all findings (legacy CI). Prefer <strong>scoped</strong> checks with
            {' '}<code>security_run_id</code> from Repo Watch / Scans.
            CI: <code>POST /v1/security/pr-check</code> with <code>X-OPA-Security-Token</code>.
          </p>
          <pre className="opa-mono" style={{ fontSize: 11, background: 'var(--surface-2)', padding: 12, overflow: 'auto' }}>
{prCheck.data?.ci_snippet_scoped || prCheck.data?.ci_snippet || ''}
          </pre>
          <pre className="opa-mono" style={{ fontSize: 12, background: 'var(--surface-2)', padding: 12 }}>
            {JSON.stringify(prCheck.data || {}, null, 2)}
          </pre>
          <div className="opa-muted" style={{ fontSize: 12, marginTop: 8 }}>
            OPA Review API key set: {scmSettings.data?.cursor_key_set ? 'yes' : 'no'} · Webhook: {scmSettings.data?.webhook_url || '—'}
          </div>
        </Panel>
      )}

      {tab === 'watch' && (
        <>
          <Panel title="Repo Watch" icon={<FiShield />}
            loading={connectors.loading}
            error={connectors.error}
            actions={
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="opa-btn ghost" disabled={busy} onClick={simulateJob}>Simulate PR job</button>
                <button type="button" className="opa-btn ghost" onClick={() => { connectors.reload?.(); setWatchRefresh((n) => n + 1) }}>
                  <FiRefreshCw size={12} /> Refresh
                </button>
              </div>
            }>
            <p className="opa-muted" style={{ marginTop: 0, fontSize: 13 }}>
              Pick an SCM connector, then choose repositories to watch.
              Connect / edit / delete connectors under{' '}
              <Link to="/settings/connectors">Settings · Connectors</Link>.
              {' '}App configured: {connectors.data?.github_app_configured ? 'yes' : 'no'}.
            </p>

            <ConnectorPicker
              connectors={connectorList}
              loading={connectors.loading}
              value={activeConnector}
              onChange={selectConnector}
              onReload={() => { connectors.reload?.(); setWatchRefresh((n) => n + 1) }}
              missing={connectorMissing}
              needsReconnect={connectorNeedsReconnect}
              reconnectHint={
                connectorMissing || reposMeta.error === 'connector_not_found'
                  ? ' is not in Agent memory or ClickHouse.'
                  : reposMeta.error === 'connector_token_unavailable'
                    ? ' — stored token is not recoverable (legacy hash or decrypt failed). Replace the token on the Connectors page; new tokens are encrypted and survive Agent restarts.'
                    : ' — no decryptable PAT. Replace the token or reconnect on the Connectors page.'
              }
            />

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, marginBottom: 12, maxWidth: 420 }}>
              Extra repos (optional)
              <input
                className="opa-mono"
                value={extraRepos}
                onChange={(e) => setExtraRepos(e.target.value)}
                placeholder="org/name … if not in list"
              />
            </label>

            <div className="opa-watch-checks">
              <div className="opa-watch-checks-title">Checks included in each PR job</div>
              {[
                { id: 'secrets', label: 'Secrets', hint: 'Scan the PR diff for leaked credentials and API keys before merge.' },
                { id: 'sast', label: 'SAST', hint: 'Static analysis for common insecure patterns in changed files.' },
                { id: 'iac', label: 'IaC', hint: 'Check Terraform / K8s / CloudFormation diffs for misconfigurations.' },
                { id: 'sbom', label: 'SBOM', hint: 'Generate or update dependency inventory for this PR’s lockfiles.' },
                { id: 'ai_review', label: 'OPA Review (AI)', hint: 'Enqueue the Bugbot AI review child when this repo is watched.' },
              ].map((c) => (
                <CheckWithHint
                  key={c.id}
                  id={`watch-check-${c.id}`}
                  label={c.label}
                  hint={c.hint}
                  checked={!!watchPolicy.checks[c.id]}
                  onChange={(checked) => setWatchPolicy((p) => ({
                    ...p,
                    checks: { ...p.checks, [c.id]: checked },
                  }))}
                />
              ))}
            </div>
            <div className="opa-watch-toggles">
              <PrefRow
                label="AI blocking"
                hint="Whether a failing Bugbot/approval child fails the GitHub Check Run and blocks merge."
                on={!!watchPolicy.ai_blocking}
                effectOn="OPA Review check fails when AI or approval blocks the PR."
                effectOff="Findings stay advisory — gate can still pass independently."
                as="label"
              >
                <input
                  type="checkbox"
                  checked={!!watchPolicy.ai_blocking}
                  onChange={(e) => setWatchPolicy((p) => ({ ...p, ai_blocking: e.target.checked }))}
                />
              </PrefRow>
              <PrefRow
                label="Auto-request as reviewer"
                hint="Ask GitHub to request the OPA Review bot as a reviewer when a PR opens."
                on={!!watchPolicy.auto_request_reviewer}
                effectOn="Bot is requested on open/reopen so humans see it in the reviewers list."
                effectOff="Reviews still run via checks/comments — no reviewer request."
                as="label"
              >
                <input
                  type="checkbox"
                  checked={!!watchPolicy.auto_request_reviewer}
                  onChange={(e) => setWatchPolicy((p) => ({ ...p, auto_request_reviewer: e.target.checked }))}
                />
              </PrefRow>
              <PrefRow
                label="Min approve score"
                hint="Lowest score that auto-approval may grant without a human (0 = COMMENT only)."
              >
                <input
                  type="number"
                  min={0}
                  max={100}
                  style={{ width: 64 }}
                  value={watchPolicy.auto_approve_min_score}
                  onChange={(e) => setWatchPolicy((p) => ({
                    ...p,
                    auto_approve_min_score: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                  }))}
                  title="0 = COMMENT only; 1–100 = APPROVE when confidence ≥ score, else REQUEST_CHANGES"
                />
              </PrefRow>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="opa-btn primary" disabled={busy || !activeConnector} onClick={saveWatched}>Save watched repos</button>
            </div>
          </Panel>

          <Panel title="Available repositories" icon={<FiEye />}
            loading={reposLoading}
            actions={
              activeConnector ? (
                <button type="button" className="opa-btn ghost" disabled={reposLoading} onClick={() => setWatchRefresh((n) => n + 1)}>
                  <FiRefreshCw size={12} /> Reload list
                </button>
              ) : null
            }>
            {!activeConnector && (
              <div className="opa-muted">Select or <Link to="/settings/connectors">connect a connector</Link> to load installable repos from <code>GET /api/connectors/{'{id}'}/repos</code>.</div>
            )}
            {activeConnector && reposMeta.error && (
              <div className="opa-muted" style={{ marginBottom: 8, fontSize: 13 }}>
                Could not list repos: <span className="opa-mono">{String(reposMeta.error)}</span>
                {reposMeta.note ? <> — {reposMeta.note}</> : null}
                {reposMeta.error === 'connector_not_in_memory' || reposMeta.error === 'connector_token_unavailable' || reposMeta.error === 'connector_not_found' || reposMeta.error === 'connector_token_missing'
                  ? <> <Link to={`/settings/connectors?edit=${encodeURIComponent(activeConnector)}`}>Replace token</Link> on Connectors (Agent needs stable JWT_SECRET / OPA_CONNECTOR_SECRET).</>
                  : String(reposMeta.error).includes('401') || String(reposMeta.error).includes('403')
                    ? <> Check PAT scopes / org SSO, then <Link to={`/settings/connectors?edit=${encodeURIComponent(activeConnector)}`}>replace the token</Link>.</>
                    : <> Use checkboxes after listing, or type extra org/name above and Save.</>}
              </div>
            )}
            {activeConnector && reposMeta.mock && !reposMeta.error && (
              <div className="opa-muted" style={{ marginBottom: 8, fontSize: 12 }}>
                Mock list (<code>OPA_SCM_MOCK_GITHUB=1</code>) — not calling GitHub.
                <Link to="/settings/connectors">Connect a real PAT</Link> to load your repos
                (smoke mock is bypassed for real tokens).
                {reposMeta.note ? <> {reposMeta.note}</> : null}
              </div>
            )}
            {activeConnector && !reposMeta.mock && !reposMeta.error && reposMeta.note && (
              <div className="opa-muted" style={{ marginBottom: 8, fontSize: 12 }}>{reposMeta.note}</div>
            )}
            {activeConnector && !reposLoading && availableRepos.length === 0 && !reposMeta.error && (
              <div className="opa-muted">No installable repos returned. Add org/name in Extra repos and Save, or check PAT scopes.</div>
            )}
            {availableRepos.length > 0 && (
              <>
                <div className="opa-multiselect-head">
                  <span className="opa-muted" style={{ fontSize: 12 }}>{availableRepos.length} repos</span>
                  <MultiSelectActions
                    disabled={reposLoading}
                    onSelectAll={() => setAllAvailableRepos(true)}
                    onClear={() => setAllAvailableRepos(false)}
                  />
                </div>
                <div style={{ display: 'grid', gap: 6, maxHeight: 280, overflow: 'auto' }}>
                  {availableRepos.map((r) => {
                    const name = r.full_name || r.repo_full_name
                    if (!name) return null
                    return (
                      <label key={name} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                        <input type="checkbox" checked={!!repoPick[name]} onChange={() => toggleRepoPick(name)} />
                        <span className="opa-mono cell-strong">{name}</span>
                        {r.private ? <Badge>private</Badge> : null}
                        {r.mock ? <span className="opa-muted" style={{ fontSize: 11 }}>mock</span> : null}
                      </label>
                    )
                  })}
                </div>
              </>
            )}
          </Panel>

          <Panel title="Watched repositories" icon={<FiEye />} flush
            empty={!reposLoading && !watchedRows.length}
            emptyText="Pick repos above and click Save watched repos">
            <DataTable
              columns={[
                { key: 'repo_full_name', header: 'Repo', render: (r) => <span className="opa-mono cell-strong">{r.repo_full_name}</span> },
                { key: 'service_name', header: 'Service', render: (r) => (r.service_name ? <Link to={serviceHref(r.service_name)}>{r.service_name}</Link> : '—') },
                { key: 'profile', header: 'Profile', render: (r) => <Badge>{r.profile || 'auto'}</Badge> },
                { key: 'checks_json', header: 'Checks', render: (r) => <span className="opa-muted" style={{ fontSize: 11 }}>{r.checks_json || '—'}</span> },
                {
                  key: 'min_severity', header: 'Min sev',
                  render: (r) => (r.min_severity
                    ? <StatusPill tone={sevTone(r.min_severity)}>{r.min_severity}</StatusPill>
                    : '—'),
                },
                { key: 'ai_blocking', header: 'AI block', render: (r) => (r.ai_blocking ? 'yes' : 'no') },
                { key: 'auto_request_reviewer', header: 'Auto reviewer', render: (r) => (r.auto_request_reviewer ? 'yes' : 'no') },
                {
                  key: 'auto_approve_min_score', header: 'Min score',
                  render: (r) => (Number(r.auto_approve_min_score) > 0 ? String(r.auto_approve_min_score) : '—'),
                },
                {
                  key: 'enabled',
                  header: 'On',
                  render: (r) => (
                    <input
                      type="checkbox"
                      checked={!!r.enabled}
                      onChange={() => toggleWatchedEnabled(r.repo_full_name)}
                      aria-label={`Enable ${r.repo_full_name}`}
                    />
                  ),
                },
              ]}
              rows={watchedRows}
              rowKey={(r) => r.id || r.repo_full_name}
              maxHeight={320}
            />
          </Panel>

          <Panel title="Run OPA Review" icon={<FiPlay />}>
            <p className="opa-muted" style={{ marginTop: 0, fontSize: 13 }}>
              Select one or more watched repos and open PRs, then enqueue an <strong>OPA Review stack</strong>
              (one job per repo×PR). Large selections stay in one stack — extras <strong>wait</strong> and drain
              with stack concurrency (default serial). Each job packs <strong>full primary</strong> context for that repo plus
              <strong>linked awareness</strong>. Findings post inline (re-runs add/update/resolve); the global PR message is a narrative résumé upserted in place.
              Related repos are shallow-cloned under the job checkout for cross-repo context. Open a job’s findings page from PR Jobs for experimental Auto-fix / Create fix PR (requires OPA-AI-Orchestrator).
              {!scmSettings.data?.cursor_key_set && (
                <>
                  {' '}
                  <span style={{ color: 'var(--danger, #c44)' }}>No CLI agent API key</span>
                  {' '}for user <code>{scmSettings.data?.user_id || '—'}</code>
                  {' '}in org <code>{scmSettings.data?.organization_id || '—'}</code>
                  {' '}— manage under <Link to="/settings/account">Account</Link> (personal for this username, or org).
                  {' '}Keys do not transfer across usernames. Jobs still run with <code>ai.status=skipped</code>.
                </>
              )}
              {scmSettings.data?.cursor_key_set && scmSettings.data?.cursor_key_scope && (
                <> CLI key scope: <code>{scmSettings.data.cursor_key_scope}</code>
                  {scmSettings.data?.user_id ? <> · user <code>{scmSettings.data.user_id}</code></> : null}.
                </>
              )}
              {scmSettings.data?.skip_cursor_ai && <> Agent has OPA Review skipped (<code>SKIP_CURSOR_AI=1</code>).</>}
            </p>
            <div className="opa-multiselect-head" style={{ marginBottom: 6 }}>
              <div className="cell-strong">Watched repos</div>
              <MultiSelectActions
                disabled={!watchedRows.length}
                onSelectAll={() => setAllReviewRepos(true)}
                onClear={() => setAllReviewRepos(false)}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, fontSize: 12 }}>
              {watchedRows.map((r) => (
                <label key={r.repo_full_name} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={!!reviewRepos[r.repo_full_name]}
                    onChange={(e) => {
                      const on = e.target.checked
                      setReviewRepos((p) => ({ ...p, [r.repo_full_name]: on }))
                      if (!on) {
                        setReviewPrs((prev) => {
                          const next = { ...prev }
                          const prefix = `${r.repo_full_name}#`
                          for (const key of Object.keys(next)) {
                            if (key.startsWith(prefix)) next[key] = false
                          }
                          return next
                        })
                      }
                    }}
                  />
                  <span className="opa-mono">{r.repo_full_name}</span>
                </label>
              ))}
              {!watchedRows.length && <span className="opa-muted">Watch a repo first</span>}
            </div>
            <div className="opa-multiselect-head" style={{ marginBottom: 6 }}>
              <div className="cell-strong">
                Open PRs {pullsLoading ? '(loading…)' : ''}
                {!!Object.values(reviewPrs).filter(Boolean).length && (
                  <span className="opa-muted"> · {Object.values(reviewPrs).filter(Boolean).length} selected
                    {Object.values(reviewPrs).filter(Boolean).length > 40 ? ' (will wait in one stack)' : ''}
                  </span>
                )}
              </div>
              <MultiSelectActions
                disabled={!selectedReviewRepos.length || pullsLoading || !selectedReviewRepos.some((repo) => (pullsByRepo[repo] || []).length)}
                onSelectAll={() => setReviewPrsForRepos(selectedReviewRepos, true)}
                onClear={() => setReviewPrsForRepos(selectedReviewRepos, false)}
              />
            </div>
            <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
              {selectedReviewRepos.map((repo) => {
                const pulls = pullsByRepo[repo] || []
                return (
                  <div key={repo} style={{ padding: 8, background: 'var(--surface-2)', borderRadius: 6 }}>
                    <div className="opa-multiselect-head" style={{ marginBottom: 6 }}>
                      <div className="opa-mono" style={{ fontSize: 12 }}>{repo}</div>
                      <MultiSelectActions
                        disabled={!pulls.length || pullsLoading}
                        onSelectAll={() => setReviewPrsForRepos([repo], true)}
                        onClear={() => setReviewPrsForRepos([repo], false)}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
                      {pulls.map((p) => {
                        const key = `${repo}#${p.number}`
                        return (
                          <label key={key} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                            <input
                              type="checkbox"
                              checked={!!reviewPrs[key]}
                              onChange={(e) => setReviewPrs((prev) => ({ ...prev, [key]: e.target.checked }))}
                            />
                            #{p.number} {p.title}{p.draft ? ' (draft)' : ''}
                          </label>
                        )
                      })}
                      {!pulls.length && !pullsLoading && <span className="opa-muted">No open PRs</span>}
                    </div>
                  </div>
                )
              })}
              {!selectedReviewRepos.length && <span className="opa-muted">Select repos above</span>}
            </div>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                Preview URL (optional, UI visual MCP)
                <input
                  className="opa-mono"
                  value={aiReviewForm.preview_url}
                  onChange={(e) => setAiReviewForm((f) => ({ ...f, preview_url: e.target.value }))}
                  placeholder="https://preview.example.com"
                />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8, fontSize: 12 }}>
              <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <input type="checkbox" checked={!!aiReviewForm.force} onChange={(e) => setAiReviewForm((f) => ({ ...f, force: e.target.checked }))} />
                Force (include drafts)
              </label>
              <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <input type="checkbox" checked={!!aiReviewForm.ai_only} onChange={(e) => setAiReviewForm((f) => ({ ...f, ai_only: e.target.checked }))} />
                OPA Review only (skip AppSec scanners)
              </label>
            </div>
            {!!appliedContexts.length && (
              <div className="opa-muted" style={{ fontSize: 12, marginBottom: 8 }}>
                Contexts (primary + linked awareness):{' '}
                {appliedContexts.map((c) => `${c.role}:${c.title || c.id}`).join(' · ')}
              </div>
            )}
            {stackStatus && (
              <div style={{ marginBottom: 10, padding: 8, background: 'var(--surface-2)', borderRadius: 6, fontSize: 12 }}>
                <div>
                  <strong>Stack</strong> <span className="opa-mono">{stackStatus.stack_id || stackStatus.id || lastStackId}</span>
                  {' '}· {stackStatus.status}
                  {stackStatus.note ? <span className="opa-muted"> · {stackStatus.note}</span> : null}
                </div>
                <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                  {(stackStatus.items || []).map((it, idx) => (
                    <div key={`${it.repo_full_name}-${it.pr_number}-${idx}`} className="opa-mono">
                      {it.repo_full_name}#{it.pr_number} → {it.status || '—'}
                      {it.error ? ` (${it.error})` : ''}
                      {it.job_id ? ` · ${String(it.job_id).slice(0, 14)}` : ''}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className="opa-btn primary"
                disabled={busy || !Object.values(reviewPrs).some(Boolean)}
                onClick={runAiReview}
              >
                Run OPA Review stack
              </button>
              {lastStackId && (
                <button type="button" className="opa-btn ghost" disabled={busy || jobActionBusy} onClick={cancelReviewStack}>
                  Cancel stack
                </button>
              )}
              {lastStackId && (
                <button type="button" className="opa-btn ghost" onClick={() => selectTab('jobs')}>
                  Stack {String(lastStackId).slice(0, 16)}…
                </button>
              )}
            </div>
          </Panel>

          <Panel title="Reviewer contexts" icon={<FiCode />}>
            <p className="opa-muted" style={{ marginTop: 0, fontSize: 13 }}>
              Per-repo briefs packed into OPA Review (full primary + linked awareness). Tag <code>design</code>/<code>ui</code> for design-system enforcement
              (auto-prioritized when the PR touches JSX/CSS/components). Link watched repos so a review pulls all contexts in the group.
            </p>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                Repo
                <select
                  className="opa-mono"
                  value={ctxForm.repo_full_name}
                  onChange={(e) => setCtxForm((f) => ({ ...f, repo_full_name: e.target.value }))}
                >
                  <option value="">Select…</option>
                  <option value="*">* (org-level)</option>
                  {watchedRows.map((r) => (
                    <option key={r.repo_full_name} value={r.repo_full_name}>{r.repo_full_name}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                Title
                <input value={ctxForm.title} onChange={(e) => setCtxForm((f) => ({ ...f, title: e.target.value }))} placeholder="Auth & trust boundaries" />
              </label>
            </div>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={!!ctxForm.tags_design}
                onChange={(e) => setCtxForm((f) => ({ ...f, tags_design: e.target.checked }))}
              />
              Design / UI enforcement context (tags: design, ui)
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, marginBottom: 8 }}>
              Body (markdown)
              <textarea
                className="opa-mono"
                rows={8}
                style={{ width: '100%', fontSize: 12 }}
                value={ctxForm.body_markdown}
                onChange={(e) => setCtxForm((f) => ({ ...f, body_markdown: e.target.value }))}
                placeholder={"## System\n## PR intent\n## Scope\n## Important invariants\n## Risk areas\n## Testing context\n## Operational\n"}
              />
            </label>
            {genDraft?.source === 'skipped' && (
              <div className="opa-muted" style={{ fontSize: 12, marginBottom: 8 }}>
                Generate skipped — {genDraft?.honesty || 'save a CLI agent API key under Account (personal or org), or unset SKIP_CURSOR_AI'}.
                {' '}Routing “auto” still uses Cursor when a CLI key is set.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <button type="button" className="opa-btn primary" disabled={busy} onClick={saveContext}>
                {ctxEditingId ? 'Update context' : 'Save context'}
              </button>
              <button type="button" className="opa-btn ghost" disabled={busy} onClick={generateContext}>
                Generate with AI
              </button>
              {ctxEditingId && (
                <button type="button" className="opa-btn ghost" onClick={() => { setCtxEditingId(''); setCtxForm({ title: '', body_markdown: '', repo_full_name: ctxForm.repo_full_name, tags_design: false }) }}>
                  Cancel edit
                </button>
              )}
            </div>
            <div className="opa-multiselect-head" style={{ marginBottom: 8 }}>
              <div className="cell-strong">Link repos (shared context pack)</div>
              <MultiSelectActions
                disabled={!watchedRows.length}
                onSelectAll={() => setAllLinkPick(true)}
                onClear={() => setAllLinkPick(false)}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8, fontSize: 12 }}>
              {watchedRows.map((r) => (
                <label key={r.repo_full_name} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={!!linkPick[r.repo_full_name]}
                    onChange={(e) => setLinkPick((p) => ({ ...p, [r.repo_full_name]: e.target.checked }))}
                  />
                  <span className="opa-mono">{r.repo_full_name}</span>
                  {r.link_group_id ? <Badge>{r.link_group_id.slice(0, 10)}</Badge> : null}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <button type="button" className="opa-btn ghost" disabled={busy} onClick={() => linkSelectedRepos(false)}>Link selected</button>
              <button type="button" className="opa-btn ghost" disabled={busy} onClick={() => linkSelectedRepos(true)}>Clear links</button>
            </div>
            <DataTable
              columns={[
                { key: 'repo_full_name', header: 'Repo', render: (r) => <span className="opa-mono">{r.repo_full_name}</span> },
                { key: 'title', header: 'Title' },
                { key: 'source', header: 'Source', render: (r) => <Badge>{r.source || 'manual'}</Badge> },
                {
                  key: 'tags_json', header: 'Tags',
                  render: (r) => {
                    let tags = []
                    try { tags = JSON.parse(r.tags_json || '[]') } catch { /* ignore */ }
                    if (!tags.length) return '—'
                    return tags.map((t) => <Badge key={t}>{t}</Badge>)
                  },
                },
                { key: 'link_group_id', header: 'Group', render: (r) => (r.link_group_id ? <span className="opa-mono" style={{ fontSize: 11 }}>{String(r.link_group_id).slice(0, 12)}</span> : '—') },
                {
                  key: 'actions', header: '',
                  render: (r) => {
                    let tags = []
                    try { tags = JSON.parse(r.tags_json || '[]') } catch { /* ignore */ }
                    const isDesign = tags.some((t) => ['design', 'ui', 'design-system'].includes(String(t)))
                    return (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        className="opa-btn ghost"
                        onClick={() => {
                          setCtxEditingId(r.id)
                          setCtxForm({
                            title: r.title || '',
                            body_markdown: r.body_markdown || '',
                            repo_full_name: r.repo_full_name || '',
                            tags_design: isDesign,
                          })
                        }}
                      >
                        Edit
                      </button>
                      <button type="button" className="opa-btn ghost" onClick={() => deleteContext(r.id)}>Delete</button>
                    </div>
                    )
                  },
                },
              ]}
              rows={contexts}
              rowKey={(r) => r.id}
              maxHeight={280}
            />
          </Panel>

          <Panel title="OPA Review AI" icon={<FiKey />}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <StatusPill tone={scmSettings.data?.cursor_key_set ? 'ok' : 'warn'} title="CLI agent key for OPA Review">
                CLI key {scmSettings.data?.cursor_key_set ? 'set' : 'not set'}
                {scmSettings.data?.cursor_key_scope ? ` · ${scmSettings.data.cursor_key_scope}` : ''}
              </StatusPill>
              <span className="opa-muted" style={{ fontSize: 12 }}>
                model {scmSettings.data?.cursor_model || 'auto'}
                {scmSettings.data?.user_id ? <> · user <code>{scmSettings.data.user_id}</code></> : null}
                {scmSettings.data?.organization_id ? <> · org <code>{scmSettings.data.organization_id}</code></> : null}
              </span>
              <Link to="/settings/account" className="opa-btn ghost" style={{ textDecoration: 'none' }}>
                Manage in Account
              </Link>
            </div>
            <p className="opa-muted" style={{ fontSize: 12, marginBottom: 0 }}>
              Watch-specific <code>ai_review</code> / <code>ai_blocking</code> toggles stay here. API keys live under Account (user → org inheritance; per signed-in username).
              {!scmSettings.data?.cursor_key_set && scmSettings.data?.honesty ? (
                <> {String(scmSettings.data.honesty)}</>
              ) : null}
            </p>
          </Panel>
        </>
      )}

      {tab === 'jobs' && (
        <Panel title="SCM / PR jobs" icon={<FiRefreshCw />} flush loading={scmJobs.loading && !scmJobRows.length} error={scmJobs.error}
          empty={!scmJobs.loading && !scmJobRows.length}
          emptyText={
            scmJobs.data?.honesty
              || (orgAll
                ? 'No jobs visible — with tenant All, admins see every org; pick an organization if you still see nothing after a stack queue'
                : `No jobs for org ${organizationId} — stacks inherit the watched repo’s organization (often default-org). Try tenant All or that org.`)
          }
          actions={(
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="opa-btn ghost" disabled={jobActionBusy} onClick={resumeStalledJobs} title="POST /api/scm/jobs/resume — kick stalled stacks and orphaned queued jobs">
                Resume stalled
              </button>
              {lastStackId ? (
                <button type="button" className="opa-btn ghost" disabled={jobActionBusy} onClick={cancelReviewStack} title={`Cancel stack ${lastStackId}`}>
                  Cancel stack
                </button>
              ) : null}
              <button type="button" className="opa-btn ghost" onClick={() => scmJobs.reload?.()}><FiRefreshCw size={12} /> Refresh</button>
            </div>
          )}>
          {!scmJobs.loading && scmJobRows.length > 0 && scmJobs.data?.honesty && (
            <p className="opa-muted" style={{ margin: '8px 12px 0', fontSize: 12 }}>{String(scmJobs.data.honesty)}</p>
          )}
          <div className="opa-jobs-summary">
            <span className="opa-muted">{fmtNum(scmJobTotal)} total</span>
            {['running', 'queued', 'waiting', 'completed', 'cancelled', 'failed', 'error'].map((st) => (
              scmJobCounts[st] ? (
                <button
                  key={st}
                  type="button"
                  className={`opa-jobs-count-chip${jobStatusFilter === (st === 'error' ? 'failed' : st) ? ' active' : ''}`}
                  title={`${scmJobStatusHint(st)} — click to filter`}
                  onClick={() => {
                    const next = st === 'error' ? 'failed' : st
                    setJobFilter('status', jobStatusFilter === next ? '' : next)
                  }}
                >
                  <StatusPill tone={scmJobStatusTone(st)}>{st}</StatusPill>
                  <span className="opa-mono">{scmJobCounts[st]}</span>
                </button>
              ) : null
            ))}
            <span className="opa-muted">· auto-refresh 4s · active first</span>
          </div>
          <div className="opa-jobs-filters">
            <label className="opa-jobs-filter">
              <span className="opa-muted">Status</span>
              <select
                className="opa-select"
                value={jobStatusFilter}
                onChange={(e) => setJobFilter('status', e.target.value)}
                aria-label="Filter by status"
              >
                <option value="">All</option>
                <option value="running">running</option>
                <option value="queued">queued</option>
                <option value="waiting">waiting</option>
                <option value="completed">completed</option>
                <option value="failed">failed</option>
                <option value="cancelled">cancelled</option>
              </select>
            </label>
            <label className="opa-jobs-filter">
              <span className="opa-muted">Severity</span>
              <select
                className="opa-select"
                value={jobSeverityFilter}
                onChange={(e) => setJobFilter('severity', e.target.value)}
                aria-label="Filter by result severity"
              >
                <option value="">All</option>
                <option value="blocker|critical">blocker / critical</option>
                <option value="high">high</option>
                <option value="medium">medium</option>
                <option value="low">low</option>
                <option value="none">none</option>
              </select>
            </label>
            <label className="opa-jobs-filter">
              <span className="opa-muted">Repo</span>
              <select
                className="opa-select"
                value={jobRepoFilter}
                onChange={(e) => setJobFilter('repo', e.target.value)}
                aria-label="Filter by repo"
              >
                <option value="">All repos</option>
                {scmJobRepos.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
            <label className="opa-jobs-filter opa-jobs-filter-search">
              <span className="opa-muted">Search</span>
              <input
                className="opa-input"
                type="search"
                value={jobQFilter}
                onChange={(e) => setJobFilter('q', e.target.value)}
                placeholder="Job id, repo, PR, stack…"
                aria-label="Search jobs"
                spellCheck={false}
              />
            </label>
            {jobFiltersActive ? (
              <button type="button" className="opa-btn ghost" onClick={clearJobFilters} title="Clear filters">
                <FiX size={12} /> Clear
              </button>
            ) : null}
            {jobFiltersActive ? (
              <span className="opa-muted opa-jobs-filter-count">
                {fmtNum(filteredScmJobRows.length)} of {fmtNum(scmJobRows.length)}
              </span>
            ) : null}
          </div>
          {scmJobRows.length > 0 && filteredScmJobRows.length === 0 ? (
            <div className="opa-jobs-empty-filter opa-muted">
              No jobs match these filters.
              <button type="button" className="opa-btn ghost" onClick={clearJobFilters}>Clear filters</button>
            </div>
          ) : (
          <div className="opa-jobs-master">
            <div className="opa-jobs-master-list">
          <DataTable
            columns={[
              { key: 'id', header: 'Job', render: (r) => <span className="opa-mono" style={{ fontSize: 11 }}>{String(r.id).slice(0, 18)}</span> },
              { key: 'repo_full_name', header: 'Repo', render: (r) => {
                const href = scmJobRepoHref(r, connectorList)
                return (
                  <ExtLink href={href} className="opa-mono" title={href || r.repo_full_name}>
                    {r.repo_full_name || '—'}
                  </ExtLink>
                )
              } },
              { key: 'pr_number', header: 'PR', render: (r) => {
                if (!r.pr_number) return '—'
                const href = scmJobPrHref(r, connectorList)
                return (
                  <ExtLink href={href} className="opa-mono" title={href || `PR #${r.pr_number}`}>
                    #{r.pr_number}
                  </ExtLink>
                )
              } },
              {
                key: 'event', header: 'Event',
                render: (r) => {
                  const kind = scmJobKindLabel(r)
                  const kids = r._runChildren || []
                  const childStatus = r._childStatus || {}
                  const childKinds = kids.length
                    ? kids
                    : Object.keys(childStatus).map((k) => ({ kind: k, status: childStatus[k] }))
                  return (
                    <span title={r.event || ''} style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                      <Badge>{kind || r.event || '—'}</Badge>
                      {childKinds.slice(0, 3).map((c) => (
                        <StatusPill
                          key={c.kind || c.id}
                          tone={scmJobStatusTone(c.status)}
                          title={`${agentKindLabel(c.kind)} · ${c.status || ''}`}
                        >
                          {agentKindLabel(c.kind)}
                        </StatusPill>
                      ))}
                    </span>
                  )
                },
              },
              {
                key: 'status', header: 'Status',
                render: (r) => (
                  <span title={scmJobStatusHint(r.status)}>
                    <StatusPill tone={scmJobStatusTone(r.status)}>
                      {r.status}
                    </StatusPill>
                  </span>
                ),
              },
              {
                key: 'result', header: 'Result',
                render: (r) => {
                  const meta = scmJobResultMeta(r)
                  const chips = []
                  if (meta.severity) {
                    chips.push(
                      <StatusPill key="sev" tone={sevTone(meta.severity)} title="Max finding / policy severity">
                        {meta.severity}
                      </StatusPill>,
                    )
                  }
                  if (meta.rule) {
                    chips.push(<Badge key="rule" title="Finding rule / category">{meta.rule}</Badge>)
                  }
                  if (meta.gateStatus === 'fail' || meta.gateStatus === 'pass') {
                    chips.push(
                      <StatusPill key="gate" tone={meta.gateStatus === 'pass' ? 'ok' : 'error'} title="AppSec gate">
                        gate {meta.gateStatus}
                      </StatusPill>,
                    )
                  } else if (meta.aiStatus && meta.aiStatus !== 'findings') {
                    const aiTone = meta.aiStatus === 'skipped' || meta.aiStatus === 'clean' || meta.aiStatus === 'ok'
                      ? (meta.aiStatus === 'skipped' ? 'neutral' : 'ok')
                      : 'warn'
                    chips.push(
                      <StatusPill key="ai" tone={aiTone} title="OPA Review status">
                        {meta.aiStatus}
                      </StatusPill>,
                    )
                  }
                  if (!chips.length) return <span className="opa-muted">—</span>
                  const plain = [meta.kind, meta.severity, meta.rule].filter(Boolean).join(' · ')
                  return (
                    <span
                      style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}
                      title={plain}
                    >
                      {chips}
                    </span>
                  )
                },
              },
              {
                key: 'actions', header: '',
                sortable: false,
                render: (r) => {
                  const findings = Array.isArray(r.summary?.ai?.findings) ? r.summary.ai.findings : []
                  const n = findings.length
                  return (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                      {['queued', 'waiting', 'running'].includes(String(r.status || '').toLowerCase()) ? (
                        <button type="button" className="opa-btn ghost" onClick={() => cancelJob(r.id)}>Cancel</button>
                      ) : null}
                      <button type="button" className="opa-btn ghost" onClick={() => retryJob(r.id)}>Retry</button>
                      {r.pr_number ? (
                        <button type="button" className="opa-btn ghost" onClick={() => rerunAiOnly(r)} title="Bugbot only (ai_only)">Re-run Bugbot</button>
                      ) : null}
                      {r.pr_number ? (
                        <button type="button" className="opa-btn ghost" onClick={() => rerunFullReview(r)} title="Security + Bugbot (+ Cloud)">Full review</button>
                      ) : null}
                      <Link
                        to={scmJobHref(r.id)}
                        className="opa-btn ghost"
                        title="Open findings and Auto-fix actions"
                      >
                        Open{n ? ` (${n})` : ''}
                      </Link>
                    </div>
                  )
                },
              },
            ]}
            rows={filteredScmJobRows}
            rowKey={(r) => r.id}
            selectedKey={selectedJobId}
            onRowClick={(r) => setSelectedJobId(String(r.id))}
            maxHeight={480}
          />
            </div>
            <aside className="opa-jobs-master-detail" aria-label="Job evidence">
              <JobEvidencePanel
                job={selectedJobRow}
                honesty={scmJobs.data?.honesty}
                detailLoading={selectedJobDetailLoading}
                actionBusy={jobActionBusy}
                onCancel={cancelJob}
                onRetry={retryJob}
                onRerunBugbot={rerunAiOnly}
                onRerunFull={rerunFullReview}
                onCloudAutofix={requestCloudAutofix}
              />
            </aside>
          </div>
          )}
        </Panel>
      )}

      {tab === 'agents' && (
        <AgentsTab
          connectors={connectorList}
          toast={toast}
          activeConnector={activeConnector}
          onConnectorChange={setActiveConnector}
        />
      )}

      {tab === 'webhooks' && (
        <Panel
          title="GitHub webhooks"
          icon={<FiGitPullRequest />}
          flush
          loading={scmWebhooks.loading && !scmWebhookRows.length}
          error={scmWebhooks.error}
          empty={!scmWebhooks.loading && !scmWebhookRows.length}
          emptyText={
            scmWebhooks.data?.honesty
              || (orgAll
                ? 'No webhook deliveries yet — live captures start after orchestrator deploy; historical PR/push jobs are backfilled on boot'
                : `No webhooks for org ${organizationId}`)
          }
          actions={<button type="button" className="opa-btn ghost" onClick={() => scmWebhooks.reload?.()}><FiRefreshCw size={12} /> Refresh</button>}
        >
          {!scmWebhooks.loading && scmWebhookRows.length > 0 && scmWebhooks.data?.honesty && (
            <p className="opa-muted" style={{ margin: '8px 12px 0', fontSize: 12 }}>{String(scmWebhooks.data.honesty)}</p>
          )}
          <div className="opa-jobs-summary">
            <span className="opa-muted">{fmtNum(scmWebhookTotal)} total</span>
            {['queued', 'ok', 'ignored', 'skipped', 'duplicate', 'ping', 'error'].map((st) => (
              scmWebhookCounts[st] ? (
                <span key={st} className="opa-jobs-count-chip" title={st}>
                  <StatusPill tone={scmWebhookOutcomeTone(st)}>{st}</StatusPill>
                  <span className="opa-mono">{scmWebhookCounts[st]}</span>
                </span>
              ) : null
            ))}
            <span className="opa-muted">· auto-refresh 8s</span>
          </div>
          <DataTable
            columns={[
              {
                key: 'received_at', header: 'When',
                render: (r) => (
                  <span title={r.received_at || ''}>{r.received_at ? fmtAgo(r.received_at) : '—'}</span>
                ),
              },
              {
                key: 'event', header: 'Event',
                render: (r) => (
                  <span title={r.delivery_id || ''}>
                    <Badge>{r.event || '—'}</Badge>
                    {r.action ? <span className="opa-muted" style={{ marginLeft: 4 }}>{r.action}</span> : null}
                  </span>
                ),
              },
              {
                key: 'repo_full_name', header: 'Repo',
                render: (r) => <span className="opa-mono" style={{ fontSize: 11 }}>{r.repo_full_name || '—'}</span>,
              },
              {
                key: 'pr_number', header: 'PR / SHA',
                render: (r) => {
                  if (r.pr_number) return <span className="opa-mono">#{r.pr_number}</span>
                  if (r.commit_sha) return <span className="opa-mono" style={{ fontSize: 11 }}>{String(r.commit_sha).slice(0, 10)}</span>
                  return '—'
                },
              },
              {
                key: 'outcome', header: 'Action taken',
                render: (r) => (
                  <span title={r.honesty || ''}>
                    <StatusPill tone={scmWebhookOutcomeTone(r.outcome)}>{r.outcome || '—'}</StatusPill>
                  </span>
                ),
              },
              {
                key: 'job_id', header: 'Job',
                render: (r) => (r.job_id
                  ? <Link to={scmJobHref(r.job_id)} className="opa-mono" style={{ fontSize: 11 }}>{String(r.job_id).slice(0, 16)}</Link>
                  : '—'),
              },
              {
                key: 'signature_valid', header: 'Sig',
                render: (r) => (
                  <StatusPill tone={r.signature_valid ? 'ok' : 'error'}>
                    {r.signature_valid ? 'ok' : 'bad'}
                  </StatusPill>
                ),
              },
              {
                key: 'source', header: 'Src',
                render: (r) => (r.source === 'backfill'
                  ? <Badge title="Synthesized from scm job">backfill</Badge>
                  : <span className="opa-muted">live</span>),
              },
              {
                key: 'honesty', header: 'Reason',
                render: (r) => (
                  <span className="opa-muted" style={{ fontSize: 12 }} title={r.honesty || ''}>
                    {r.honesty ? String(r.honesty).slice(0, 64) : '—'}
                    {r.honesty && String(r.honesty).length > 64 ? '…' : ''}
                  </span>
                ),
              },
              {
                key: 'detail', header: '',
                render: (r) => (
                  <button type="button" className="opa-btn ghost" onClick={() => setWebhookDetailId(r.id === webhookDetailId ? '' : r.id)}>
                    {r.id === webhookDetailId ? 'Hide' : 'Detail'}
                  </button>
                ),
              },
            ]}
            rows={scmWebhookRows}
            rowKey={(r) => r.id}
            maxHeight={480}
          />
          {webhookDetail ? (
            <div className="opa-jobs-summary" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, margin: '8px 12px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <strong className="opa-mono" style={{ fontSize: 12 }}>{webhookDetail.id}</strong>
                <button type="button" className="opa-btn ghost" onClick={() => setWebhookDetailId('')}><FiX size={12} /> Close</button>
              </div>
              <p className="opa-muted" style={{ margin: 0, fontSize: 12 }}>{webhookDetail.honesty || '—'}</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
                <span>Delivery: <code>{webhookDetail.delivery_id || '—'}</code></span>
                <span>Installation: <code>{webhookDetail.installation_id || '—'}</code></span>
                <span>HTTP: <code>{webhookDetail.http_status || '—'}</code></span>
                <span>Org: <code>{webhookDetail.organization_id || '—'}</code></span>
                {webhookDetail.stack_id ? <span>Stack: <code>{webhookDetail.stack_id}</code></span> : null}
                {webhookDetail.error ? <span className="opa-muted">Error: {webhookDetail.error}</span> : null}
              </div>
              {webhookDetail.job_id ? (
                <div>
                  <Link to={scmJobHref(webhookDetail.job_id)} className="opa-btn ghost">Open related job</Link>
                  <button type="button" className="opa-btn ghost" onClick={() => selectTab('jobs')}>PR Jobs</button>
                </div>
              ) : null}
            </div>
          ) : null}
        </Panel>
      )}
    </div>
  )
}
