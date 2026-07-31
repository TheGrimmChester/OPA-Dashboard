import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Link, useSearchParams } from 'react-router-dom'
import {
  FiShield, FiAlertTriangle, FiEye, FiEyeOff, FiCrosshair, FiKey, FiSliders,
  FiCode, FiServer, FiCheckCircle, FiPlay, FiRefreshCw, FiTrash2, FiEdit2,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, StatusPill, Badge } from '../components/ui'
import { useToast } from '../components/ui/Toast'
import { fmtNum, fmtAgo } from '../theme/format'
import { securityRunHref, serviceHref } from '../utils/entityLinks'

const API = import.meta.env.VITE_API_URL || ''
const SEV_KEY = 'opa.security.min_severity'

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
  const connectors = useApi('/api/connectors', {}, { noRange: true, skip: tab !== 'watch' && tab !== 'jobs' })
  const scmJobs = useApi('/api/scm/jobs', { limit: 50 }, { noRange: true, skip: tab !== 'jobs' && tab !== 'watch' })
  const scmSettings = useApi('/api/scm/settings', {}, { noRange: true, skip: tab !== 'watch' && tab !== 'pr' && tab !== 'jobs' })
  const [patForm, setPatForm] = useState({ token: '', login: '', repos: '' })
  const [editForm, setEditForm] = useState({ login: '', display_name: '', token: '' })
  const [editingConnector, setEditingConnector] = useState(false)
  const [cursorKey, setCursorKey] = useState('')
  const [watchedRows, setWatchedRows] = useState([])
  const [availableRepos, setAvailableRepos] = useState([])
  const [repoPick, setRepoPick] = useState({})
  const [reposLoading, setReposLoading] = useState(false)
  const [reposMeta, setReposMeta] = useState({ error: '', note: '', mock: false })
  const [watchPolicy, setWatchPolicy] = useState({
    checks: { secrets: true, sast: true, iac: true, sbom: true, ai_review: true },
    ai_blocking: false,
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
      axios.get(`${API}/api/connectors/${encodeURIComponent(activeConnector)}/watched`),
      axios.get(`${API}/api/connectors/${encodeURIComponent(activeConnector)}/repos`),
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
    axios.get(`${API}/api/scm/contexts`).then((res) => {
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
      axios.get(`${API}/api/connectors/${encodeURIComponent(activeConnector)}/pulls`, { params: { repo } })
        .then((res) => [repo, res.data?.pulls || []])
        .catch(() => [repo, []]),
      axios.get(`${API}/api/scm/contexts`, { params: { for_repo: repo } })
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
      axios.get(`${API}/api/scm/opa-review/stacks/${encodeURIComponent(lastStackId)}`)
        .then((res) => { if (!cancelled) setStackStatus(res.data) })
        .catch(() => {})
    }
    tick()
    const id = setInterval(tick, 4000)
    return () => { cancelled = true; clearInterval(id) }
  }, [lastStackId, tab])

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

  const sevTone = (sev) => {
    const v = String(sev || '').toLowerCase()
    if (v === 'critical' || v === 'high') return 'error'
    if (v === 'medium') return 'warn'
    return 'neutral'
  }

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
      const { data } = await axios.post(`${API}/api/security/runs`, body)
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

  const connectPAT = async () => {
    setBusy(true)
    try {
      const repos = patForm.repos.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
      const { data } = await axios.post(`${API}/api/connectors/github/pat`, {
        token: patForm.token,
        login: patForm.login || 'pat-user',
        repos,
      })
      const id = data.connector?.id
      if (id) {
        setActiveConnector(id)
        setActiveRunId('')
        setTab('watch')
        const p = new URLSearchParams(searchParams)
        p.set('tab', 'watch')
        p.set('connector', id)
        p.delete('run')
        setSearchParams(p, { replace: true })
      }
      flash('ok', 'GitHub PAT connected', data.honesty)
      connectors.reload?.()
      setPatForm({ token: '', login: patForm.login, repos: patForm.repos })
      setWatchRefresh((n) => n + 1)
    } catch (e) {
      flash('error', 'PAT connect failed', e.response?.data || e.message)
    } finally {
      setBusy(false)
    }
  }

  const openGitHubInstall = async () => {
    try {
      const { data } = await axios.get(`${API}/api/connectors/github/install-url`)
      if (data.install_url) {
        window.open(data.install_url, '_blank', 'noopener')
      } else {
        flash('warn', 'GitHub App not configured', data.note || 'Use PAT bootstrap or set Agent env')
      }
    } catch (e) {
      flash('error', 'Install URL failed', e.response?.data || e.message)
    }
  }

  const selectConnector = (id) => {
    setActiveConnector(id)
    setEditingConnector(false)
    setEditForm({ login: '', display_name: '', token: '' })
    setTab('watch')
    setActiveRunId('')
    const p = new URLSearchParams(searchParams)
    p.set('tab', 'watch')
    p.delete('run')
    if (id) p.set('connector', id)
    else p.delete('connector')
    setSearchParams(p, { replace: true })
  }

  const beginEditConnector = (c) => {
    if (!c?.id) return
    selectConnector(c.id)
    setEditingConnector(true)
    let display = c.display_name || ''
    if (!display && c.meta_json) {
      try {
        display = JSON.parse(c.meta_json)?.display_name || ''
      } catch { /* ignore */ }
    }
    setEditForm({
      login: c.account_login || '',
      display_name: display || '',
      token: '',
    })
  }

  const saveConnectorEdit = async () => {
    if (!activeConnector) {
      flash('warn', 'Select a connector first')
      return
    }
    setBusy(true)
    try {
      const body = {
        account_login: editForm.login,
        display_name: editForm.display_name,
      }
      if (editForm.token.trim()) body.token = editForm.token.trim()
      const { data } = await axios.patch(
        `${API}/api/connectors/${encodeURIComponent(activeConnector)}`,
        body,
      )
      flash('ok', 'Connector updated', data.connector?.account_login || activeConnector)
      setEditForm((f) => ({ ...f, token: '' }))
      setEditingConnector(false)
      connectors.reload?.()
      setWatchRefresh((n) => n + 1)
    } catch (e) {
      flash('error', 'Connector update failed', e.response?.data || e.message)
    } finally {
      setBusy(false)
    }
  }

  const deleteConnector = async (id) => {
    const cid = id || activeConnector
    if (!cid) return
    if (!window.confirm(`Delete connector ${cid}? Watched repos for it will be disabled.`)) return
    setBusy(true)
    try {
      await axios.delete(`${API}/api/connectors/${encodeURIComponent(cid)}`)
      flash('ok', 'Connector deleted', cid)
      if (activeConnector === cid) {
        selectConnector('')
      }
      connectors.reload?.()
      setWatchRefresh((n) => n + 1)
    } catch (e) {
      flash('error', 'Delete failed', e.response?.data || e.message)
    } finally {
      setBusy(false)
    }
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
        }
      } else if (byName[name]) {
        byName[name].enabled = false
      }
    }
    for (const name of patForm.repos.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)) {
      byName[name] = {
        ...(byName[name] || {}),
        repo_full_name: name,
        enabled: true,
        profile: form.profile || 'auto',
        checks: defaultChecks,
        min_severity: minSev,
        ai_blocking: !!watchPolicy.ai_blocking,
      }
    }
    const payload = Object.values(byName)
    if (!payload.length) {
      flash('warn', 'Select at least one repository')
      return
    }
    setBusy(true)
    try {
      const { data } = await axios.put(`${API}/api/connectors/${encodeURIComponent(activeConnector)}/watched`, {
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

  const saveCursorKey = async (clear = false) => {
    setBusy(true)
    try {
      await axios.post(`${API}/api/scm/settings/cursor-key`, clear ? { clear: true } : { api_key: cursorKey })
      flash('ok', clear ? 'OPA Review API key cleared' : 'OPA Review API key saved')
      setCursorKey('')
      scmSettings.reload?.()
    } catch (e) {
      flash('error', 'OPA Review API key update failed', e.response?.data || e.message)
    } finally {
      setBusy(false)
    }
  }

  const simulateJob = async () => {
    setBusy(true)
    try {
      const { data } = await axios.post(`${API}/api/scm/simulate`, {
        repo: patForm.repos.split(/[\s,]+/).filter(Boolean)[0] || 'local/smoke-repo',
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
      await axios.post(`${API}/api/scm/jobs/${encodeURIComponent(id)}/retry`)
      flash('ok', 'Job re-queued', id)
      scmJobs.reload?.()
    } catch (e) {
      flash('error', 'Retry failed', e.response?.data || e.message)
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
      flash('error', 'No OPA Review API key', 'Save a key under OPA Review API key, or expect ai.status=skipped')
    }
    setBusy(true)
    try {
      const { data } = await axios.post(`${API}/api/scm/opa-review/stack`, {
        items,
        force: !!aiReviewForm.force,
        ai_only: !!aiReviewForm.ai_only,
        preview_url: String(aiReviewForm.preview_url || '').trim() || undefined,
      })
      setLastStackId(data.stack_id || '')
      setStackStatus(data)
      setLastAiJobId((data.job_ids || [])[0] || '')
      flash('ok', 'OPA Review stack queued', `${data.stack_id} · ${((data.job_ids || []).length)} job(s)`)
      selectTab('jobs')
      scmJobs.reload?.()
    } catch (e) {
      flash('error', 'OPA Review stack failed', e.response?.data || e.message)
    } finally {
      setBusy(false)
    }
  }

  const rerunAiOnly = async (job) => {
    if (!job?.id || !job.pr_number) return
    try {
      const { data } = await axios.post(`${API}/api/scm/jobs/${encodeURIComponent(job.id)}/ai-review`, {
        force: true,
        ai_only: true,
      })
      setLastAiJobId(data.job_id || '')
      flash('ok', 'OPA Review-only re-run queued', data.job_id)
      scmJobs.reload?.()
    } catch (e) {
      flash('error', 'OPA Review re-run failed', e.response?.data || e.message)
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
        await axios.patch(`${API}/api/scm/contexts/${encodeURIComponent(ctxEditingId)}`, {
          title,
          body_markdown: ctxForm.body_markdown,
          repo_full_name: repo,
          tags: ctxForm.tags_design ? ['design', 'ui'] : [],
        })
        flash('ok', 'Context updated')
      } else {
        await axios.post(`${API}/api/scm/contexts`, {
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
      await axios.delete(`${API}/api/scm/contexts/${encodeURIComponent(id)}`)
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
      const { data } = await axios.post(`${API}/api/scm/contexts/generate`, {
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
      const { data } = await axios.put(`${API}/api/scm/context-links`, {
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
          axios.get(`${API}/api/security/runs/${encodeURIComponent(activeRunId)}`),
          axios.get(`${API}/api/security/runs/${encodeURIComponent(activeRunId)}/findings`),
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
          <Panel title="Connectors" icon={<FiShield />}
            loading={connectors.loading}
            error={connectors.error}
            actions={
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="opa-btn ghost" onClick={openGitHubInstall}>Connect GitHub App</button>
                <button type="button" className="opa-btn ghost" disabled={busy} onClick={simulateJob}>Simulate PR job</button>
                <button type="button" className="opa-btn ghost" onClick={() => { connectors.reload?.(); setWatchRefresh((n) => n + 1) }}>
                  <FiRefreshCw size={12} /> Refresh
                </button>
              </div>
            }>
            <p className="opa-muted" style={{ marginTop: 0, fontSize: 13 }}>
              GitHub App is production (webhooks + Check Runs). PAT bootstrap is for local/dev.
              App configured: {connectors.data?.github_app_configured ? 'yes' : 'no'}.
            </p>
            {!connectors.data?.github_app_configured && (connectors.data?.connectors || []).length === 0 && (
              <div className="opa-muted" style={{
                marginBottom: 12, padding: 10, background: 'var(--surface-2)', borderRadius: 6, fontSize: 13,
              }}>
                No GitHub App env on the Agent (<code>OPA_GITHUB_APP_ID</code> / private key).
                Connect with a PAT below, or set App env and use <strong>Connect GitHub App</strong>.
              </div>
            )}
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                PAT token
                <input type="password" className="opa-mono" value={patForm.token} onChange={(e) => setPatForm((f) => ({ ...f, token: e.target.value }))} placeholder="ghp_… (or any token when mock)" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                Login
                <input value={patForm.login} onChange={(e) => setPatForm((f) => ({ ...f, login: e.target.value }))} placeholder="github-user" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                Extra repos (optional)
                <input className="opa-mono" value={patForm.repos} onChange={(e) => setPatForm((f) => ({ ...f, repos: e.target.value }))} placeholder="org/name … if not in list" />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8, fontSize: 12 }}>
              {['secrets', 'sast', 'iac', 'sbom', 'ai_review'].map((id) => (
                <label key={id} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={!!watchPolicy.checks[id]}
                    onChange={(e) => setWatchPolicy((p) => ({
                      ...p,
                      checks: { ...p.checks, [id]: e.target.checked },
                    }))}
                  />
                  {id === 'ai_review' ? 'OPA Review' : id.toUpperCase()}
                </label>
              ))}
              <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={!!watchPolicy.ai_blocking}
                  onChange={(e) => setWatchPolicy((p) => ({ ...p, ai_blocking: e.target.checked }))}
                />
                AI blocking
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="opa-btn primary" disabled={busy || !patForm.token} onClick={connectPAT}>Connect PAT</button>
              <button type="button" className="opa-btn primary" disabled={busy || !activeConnector} onClick={saveWatched}>Save watched repos</button>
            </div>
            <div style={{ marginTop: 16 }}>
              <div className="cell-strong" style={{ marginBottom: 8 }}>Active connectors</div>
              {connectorList.length === 0 && (
                <div className="opa-muted">No connectors yet — connect a PAT or install the GitHub App.</div>
              )}
              {connectorList.map((c) => (
                <div key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 8, marginBottom: 8 }}>
                  <button
                    type="button"
                    className={`opa-btn ${activeConnector === c.id ? 'primary' : 'ghost'}`}
                    onClick={() => selectConnector(c.id)}
                    title={c.has_token ? 'Credentials available (memory or decrypted from ClickHouse)' : 'No decryptable token — Replace token or Connect PAT'}
                  >
                    {c.display_name || c.kind} · {c.account_login || c.installation_id || c.id.slice(0, 12)}
                    {c.has_token ? '' : ' · no token'}
                  </button>
                  <button
                    type="button"
                    className="opa-btn ghost"
                    title="Edit connector"
                    disabled={busy}
                    onClick={() => beginEditConnector(c)}
                    aria-label={`Edit ${c.id}`}
                  >
                    <FiEdit2 size={12} />
                  </button>
                  <button
                    type="button"
                    className="opa-btn ghost"
                    title="Delete connector"
                    disabled={busy}
                    onClick={() => deleteConnector(c.id)}
                    aria-label={`Delete ${c.id}`}
                  >
                    <FiTrash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            {editingConnector && activeConnector && (
              <div style={{
                marginTop: 12, padding: 12, background: 'var(--surface-2)', borderRadius: 6, fontSize: 13,
              }}>
                <div className="cell-strong" style={{ marginBottom: 8 }}>Edit connector</div>
                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 8 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                    Login label
                    <input value={editForm.login} onChange={(e) => setEditForm((f) => ({ ...f, login: e.target.value }))} placeholder="github-user" />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                    Display name
                    <input value={editForm.display_name} onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))} placeholder="optional" />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                    Replace PAT (optional)
                    <input type="password" className="opa-mono" value={editForm.token} onChange={(e) => setEditForm((f) => ({ ...f, token: e.target.value }))} placeholder="ghp_… leave blank to keep" />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="opa-btn primary" disabled={busy} onClick={saveConnectorEdit}>Save</button>
                  <button type="button" className="opa-btn ghost" disabled={busy} onClick={() => setEditingConnector(false)}>Cancel</button>
                </div>
              </div>
            )}
            {(connectorMissing || connectorNeedsReconnect) && (
              <div className="opa-banner" role="status" style={{
                marginTop: 12, padding: 12, background: 'var(--surface-2)', borderRadius: 6, fontSize: 13,
              }}>
                <div className="cell-strong" style={{ marginBottom: 4 }}>
                  {connectorMissing ? 'Connector not found on Agent' : 'Token missing'}
                </div>
                <div className="opa-muted" style={{ marginBottom: 8 }}>
                  Deep-linked connector <code className="opa-mono">{activeConnector}</code>
                  {connectorMissing || reposMeta.error === 'connector_not_found'
                    ? ' is not in Agent memory or ClickHouse.'
                    : reposMeta.error === 'connector_token_unavailable'
                      ? ' — stored token is not recoverable (legacy hash or decrypt failed). Use Edit → Replace token; new tokens are encrypted and survive Agent restarts.'
                      : ' — no decryptable PAT. Use Edit → Replace token, or Connect PAT.'}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="opa-btn ghost" onClick={() => { connectors.reload?.(); setWatchRefresh((n) => n + 1) }}>
                    <FiRefreshCw size={12} /> Retry
                  </button>
                  {activeConnectorRow && (
                    <button type="button" className="opa-btn ghost" onClick={() => beginEditConnector(activeConnectorRow)}>
                      <FiEdit2 size={12} /> Replace token
                    </button>
                  )}
                  <button type="button" className="opa-btn ghost" onClick={() => selectConnector('')}>Clear connector</button>
                </div>
              </div>
            )}
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
              <div className="opa-muted">Select or connect a connector to load installable repos from <code>GET /api/connectors/{'{id}'}/repos</code>.</div>
            )}
            {activeConnector && reposMeta.error && (
              <div className="opa-muted" style={{ marginBottom: 8, fontSize: 13 }}>
                Could not list repos: <span className="opa-mono">{String(reposMeta.error)}</span>
                {reposMeta.note ? <> — {reposMeta.note}</> : null}
                {reposMeta.error === 'connector_not_in_memory' || reposMeta.error === 'connector_token_unavailable' || reposMeta.error === 'connector_not_found' || reposMeta.error === 'connector_token_missing'
                  ? <> Use Edit → Replace token, or Connect PAT (Agent needs stable JWT_SECRET / OPA_CONNECTOR_SECRET).</>
                  : String(reposMeta.error).includes('401') || String(reposMeta.error).includes('403')
                    ? <> Check PAT scopes / org SSO, then Replace token or Connect PAT again.</>
                    : <> Use checkboxes after listing, or type extra org/name above and Save.</>}
              </div>
            )}
            {activeConnector && reposMeta.mock && !reposMeta.error && (
              <div className="opa-muted" style={{ marginBottom: 8, fontSize: 12 }}>
                Mock list (<code>OPA_SCM_MOCK_GITHUB=1</code>) — not calling GitHub.
                Paste a real <code>ghp_</code> / <code>github_pat_</code> token and Connect PAT to load your repos
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
                { key: 'min_severity', header: 'Min sev' },
                { key: 'ai_blocking', header: 'AI block', render: (r) => (r.ai_blocking ? 'yes' : 'no') },
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
              (one job per repo×PR). Each job packs <strong>full primary</strong> context for that repo plus
              <strong>linked awareness</strong>. Findings post inline; the global PR message is a short résumé.
              {!scmSettings.data?.cursor_key_set && (
                <> <span style={{ color: 'var(--danger, #c44)' }}>No OPA Review API key set</span> — jobs still run with <code>ai.status=skipped</code>.</>
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
              <div className="cell-strong">Open PRs {pullsLoading ? '(loading…)' : ''}</div>
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
                <div><strong>Stack</strong> <span className="opa-mono">{stackStatus.stack_id || lastStackId}</span> · {stackStatus.status}</div>
                <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                  {(stackStatus.items || []).map((it, idx) => (
                    <div key={`${it.repo_full_name}-${it.pr_number}-${idx}`} className="opa-mono">
                      {it.repo_full_name}#{it.pr_number} → {it.status}{it.error ? ` (${it.error})` : ''}{it.job_id ? ` · ${String(it.job_id).slice(0, 14)}` : ''}
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
              <div className="opa-muted" style={{ fontSize: 12, marginBottom: 8 }}>Generate returned empty (skipped) — set OPA Review API key or unset SKIP_CURSOR_AI.</div>
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

          <Panel title="OPA Review API key" icon={<FiKey />}>
            <p className="opa-muted" style={{ marginTop: 0, fontSize: 13 }}>
              Stored server-side only. Used by OPA Review for PR review (senior-engineer brief template).
              Status: {scmSettings.data?.cursor_key_set ? 'set' : 'not set'} · model {scmSettings.data?.cursor_model || 'auto'}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="password"
                className="opa-mono"
                style={{ minWidth: 280 }}
                placeholder="API key"
                value={cursorKey}
                onChange={(e) => setCursorKey(e.target.value)}
              />
              <button type="button" className="opa-btn primary" disabled={busy || !cursorKey} onClick={() => saveCursorKey(false)}>Save key</button>
              <button type="button" className="opa-btn ghost" disabled={busy} onClick={() => saveCursorKey(true)}>Clear</button>
            </div>
          </Panel>
        </>
      )}

      {tab === 'jobs' && (
        <Panel title="SCM / PR jobs" icon={<FiRefreshCw />} flush loading={scmJobs.loading} error={scmJobs.error}
          empty={!scmJobs.loading && !(scmJobs.data?.jobs || []).length}
          emptyText="No jobs yet — open a PR on a watched repo, or Simulate from Repo Watch"
          actions={<button type="button" className="opa-btn ghost" onClick={() => scmJobs.reload?.()}><FiRefreshCw size={12} /> Refresh</button>}>
          <DataTable
            columns={[
              { key: 'id', header: 'Job', render: (r) => <span className="opa-mono" style={{ fontSize: 11 }}>{String(r.id).slice(0, 18)}</span> },
              { key: 'repo_full_name', header: 'Repo', render: (r) => <span className="opa-mono">{r.repo_full_name}</span> },
              { key: 'pr_number', header: 'PR', render: (r) => (r.pr_number ? `#${r.pr_number}` : '—') },
              {
                key: 'commit_sha', header: 'SHA',
                render: (r) => {
                  const sha = r.commit_sha || r.summary?.worktree?.resolved_sha || ''
                  return sha
                    ? <span className="opa-mono" style={{ fontSize: 11 }} title={sha}>{String(sha).slice(0, 10)}</span>
                    : '—'
                },
              },
              { key: 'event', header: 'Event', render: (r) => <Badge>{r.event}</Badge> },
              {
                key: 'status', header: 'Status',
                render: (r) => (
                  <StatusPill tone={r.status === 'completed' ? 'ok' : r.status === 'failed' || r.status === 'error' ? 'error' : 'neutral'}>
                    {r.status}
                  </StatusPill>
                ),
              },
              {
                key: 'security_run_id', header: 'Scan',
                render: (r) => (r.security_run_id
                  ? <Link to={securityRunHref(r.security_run_id)} className="opa-mono" style={{ fontSize: 11 }}>{String(r.security_run_id).slice(0, 14)}</Link>
                  : '—'),
              },
              {
                key: 'checkout', header: 'Worktree',
                render: (r) => {
                  const path = r.summary?.checkout_path || r.summary?.checkout_rel || r.summary?.worktree?.worktree_rel || ''
                  const mock = r.summary?.worktree?.mock
                  if (!path) return '—'
                  return (
                    <span className="opa-mono" style={{ fontSize: 11 }} title={String(path)}>
                      {mock ? 'mock · ' : ''}{String(path).replace(/^.*\/worktrees\//, 'worktrees/').slice(0, 28)}
                    </span>
                  )
                },
              },
              {
                key: 'check_run_ids', header: 'Checks',
                render: (r) => {
                  const ids = r.check_run_ids || {}
                  const chips = []
                  if (ids.appsec) chips.push(`Gate:${ids.appsec}`)
                  if (ids.ai) chips.push(`OPA:${ids.ai}`)
                  return chips.length
                    ? <span className="opa-muted" style={{ fontSize: 11 }}>{chips.join(' · ')}</span>
                    : '—'
                },
              },
              {
                key: 'actions', header: '',
                render: (r) => (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button type="button" className="opa-btn ghost" onClick={() => retryJob(r.id)}>Retry</button>
                    {r.pr_number ? (
                      <button type="button" className="opa-btn ghost" onClick={() => rerunAiOnly(r)}>Re-run OPA Review</button>
                    ) : null}
                  </div>
                ),
              },
            ]}
            rows={scmJobs.data?.jobs || []}
            rowKey={(r) => r.id}
            maxHeight={480}
          />
        </Panel>
      )}
    </div>
  )
}
