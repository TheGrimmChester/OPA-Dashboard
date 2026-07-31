import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Link, useSearchParams } from 'react-router-dom'
import {
  FiShield, FiAlertTriangle, FiEye, FiEyeOff, FiCrosshair, FiKey, FiSliders,
  FiCode, FiServer, FiCheckCircle, FiPlay, FiRefreshCw,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, StatusPill, Badge } from '../components/ui'
import { useToast } from '../components/ui/Toast'
import { fmtNum, fmtAgo } from '../theme/format'
import { securityRunHref, serviceHref } from '../utils/entityLinks'

const API = import.meta.env.VITE_API_URL || ''
const SEV_KEY = 'opa.security.min_severity'

const SCANNER_OPTS = [
  { id: 'secrets', label: 'Secrets (lite)', mode: 'lite' },
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

/** Wave 19 + Wave 30 + Wave 33: Vulns / IAST / Secrets / SAST / IaC / Scans / Inventory / Policies / PR-check. */
export default function Security() {
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState(() => searchParams.get('tab') || 'vulns')
  const [minSev, setMinSev] = useState(() => localStorage.getItem(SEV_KEY) || 'high')
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState(null)
  const [activeRunId, setActiveRunId] = useState(() => searchParams.get('run') || '')
  const [runDetail, setRunDetail] = useState(null)
  const [runFindings, setRunFindings] = useState(null)
  const [form, setForm] = useState({
    service: 'node-smoke',
    profile: 'auto',
    scanners: [],
    target_path: '',
    image: '',
  })

  const runFilter = activeRunId && (tab === 'secrets' || tab === 'sast' || tab === 'iac' || tab === 'scans')
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
    if (activeRunId) p.set('run', activeRunId)
    else p.delete('run')
    setSearchParams(p, { replace: true })
  }

  const selectRun = (id) => {
    setActiveRunId(id || '')
    const p = new URLSearchParams(searchParams)
    if (id) p.set('run', id)
    else p.delete('run')
    p.set('tab', tab === 'vulns' ? 'scans' : tab)
    setSearchParams(p, { replace: true })
    if (id && tab !== 'scans') setTab('scans')
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

  useEffect(() => {
    if (!activeRunId) {
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
  }, [activeRunId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div className="opa-stack">
      <div className="opa-page-head" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h1 className="opa-page-title">Security</h1>
          <div className="opa-page-sub">CVE reachability · IAST · secrets · SAST-lite · IaC stub · scan runs · PR check</div>
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
        <button type="button" className={`opa-tab ${tab === 'inventory' ? 'active' : ''}`} onClick={() => selectTab('inventory')}>Inventory</button>
        <button type="button" className={`opa-tab ${tab === 'policies' ? 'active' : ''}`} onClick={() => selectTab('policies')}>Policies</button>
        <button type="button" className={`opa-tab ${tab === 'pr' ? 'active' : ''}`} onClick={() => selectTab('pr')}>PR check</button>
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
              Runs embedded lite/stub scanners against the Agent workspace mount (<code>{workspace}</code>).
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
                  honesty: 'Lite/stub embedded scanners',
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
        <Panel title="PR check" icon={<FiCheckCircle />} loading={prCheck.loading} error={prCheck.error}>
          <p className="opa-muted" style={{ marginTop: 0 }}>
            Aggregates vulns + secrets + SAST + IaC/containers for CI.
            CI: <code>/v1/security/pr-check</code> with Bearer / <code>X-OPA-Security-Token</code>
            when <code>OPA_SECURITY_INGEST_TOKEN</code> is set; humans: OIDC/password session.
            Honesty: pragmatic scanner gate — not a dedicated AppSec SSO product.
          </p>
          <pre className="opa-mono" style={{ fontSize: 12, background: 'var(--surface-2)', padding: 12 }}>
            {JSON.stringify(prCheck.data || {}, null, 2)}
          </pre>
          <div className="opa-muted" style={{ fontSize: 12, marginTop: 8 }}>
            Counts — secrets: {secretRows.length}, sast: {sastRows.length}, iac: {iacRows.length}
          </div>
        </Panel>
      )}
    </div>
  )
}
