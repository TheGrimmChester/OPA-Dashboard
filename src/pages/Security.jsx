import React, { useMemo, useState } from 'react'
import { FiShield, FiAlertTriangle, FiEye, FiEyeOff, FiCrosshair, FiKey, FiSliders } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, StatusPill, Badge } from '../components/ui'
import { fmtNum, fmtAgo } from '../theme/format'

const SEV_KEY = 'opa.security.min_severity'

/** Wave 19 + Wave 30: Vulns / IAST / Secrets / Policies stub. */
export default function Security() {
  const [tab, setTab] = useState('vulns')
  const [minSev, setMinSev] = useState(() => localStorage.getItem(SEV_KEY) || 'high')
  const summary = useApi('/api/vulns/summary', { hours: 168 }, { noRange: true })
  const findings = useApi('/api/vulns/findings', { limit: 100 }, { noRange: true })
  const inventory = useApi('/api/vulns/inventory', { limit: 100 }, { noRange: true })
  const iastSum = useApi('/api/iast/summary', { hours: 24 }, { noRange: true })
  const iast = useApi('/api/iast/findings', { limit: 100 }, { noRange: true })
  const secrets = useApi('/api/security/secrets', { limit: 100 }, { noRange: true, skip: tab !== 'secrets' && tab !== 'policies' })
  const policies = useApi('/api/security/policies', {}, { noRange: true, skip: tab !== 'policies' })

  const s = summary.data || {}
  const is = iastSum.data || {}
  const vulnRows = findings.data?.findings || []
  const pkgRows = inventory.data?.packages || []
  const iastRows = iast.data?.findings || []
  const secretRows = secrets.data?.findings || []

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

  const vulnCols = [
    { key: 'severity', header: 'Sev', render: (r) => <StatusPill tone={sevTone(r.severity)}>{r.severity}</StatusPill> },
    { key: 'advisory_id', header: 'Advisory', render: (r) => <span className="opa-mono cell-strong">{r.advisory_id}</span> },
    { key: 'package_name', header: 'Package', render: (r) => <span className="opa-mono">{r.package_name}@{r.version}</span> },
    { key: 'service', header: 'Service' },
    { key: 'reachability', header: 'Reachability', render: (r) => (
      r.reachability === 'observed'
        ? <StatusPill tone="error"><FiEye size={10} /> observed</StatusPill>
        : <StatusPill tone="neutral"><FiEyeOff size={10} /> not observed</StatusPill>
    ) },
    { key: 'path_hits', header: 'Hits', num: true, render: (r) => fmtNum(r.path_hits) },
    { key: 'summary', header: 'Summary', render: (r) => <span className="opa-muted">{r.summary}</span> },
  ]

  const invCols = [
    { key: 'service', header: 'Service' },
    { key: 'ecosystem', header: 'Eco', render: (r) => <Badge>{r.ecosystem || '—'}</Badge> },
    { key: 'package_name', header: 'Package', render: (r) => <span className="opa-mono">{r.package_name}</span> },
    { key: 'version', header: 'Version', render: (r) => <span className="opa-mono">{r.version}</span> },
    { key: 'release', header: 'Release' },
    { key: 'scraped_at', header: 'When', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.scraped_at)}</span> },
  ]

  const iastCols = [
    { key: 'sink', header: 'Sink', render: (r) => <Badge>{r.sink}</Badge> },
    { key: 'service', header: 'Service' },
    { key: 'route', header: 'Route', render: (r) => <span className="opa-mono">{r.route || '—'}</span> },
    { key: 'evidence', header: 'Evidence', render: (r) => <span className="opa-mono" style={{ fontSize: 11 }}>{String(r.evidence || '').slice(0, 120)}</span> },
    { key: 'trace_id', header: 'Trace', render: (r) => <span className="opa-mono opa-muted">{r.trace_id ? String(r.trace_id).slice(0, 12) : '—'}</span> },
    { key: 'scraped_at', header: 'When', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.scraped_at)}</span> },
  ]

  const secretCols = [
    { key: 'severity', header: 'Sev', render: (r) => <StatusPill tone={sevTone(r.severity)}>{r.severity}</StatusPill> },
    { key: 'rule', header: 'Rule', render: (r) => <span className="opa-mono cell-strong">{r.rule || '—'}</span> },
    { key: 'file', header: 'File', render: (r) => <span className="opa-mono">{r.file || '—'}:{r.line || 0}</span> },
    { key: 'service', header: 'Service' },
    { key: 'detector', header: 'Detector', render: (r) => <Badge>{r.detector || '—'}</Badge> },
    { key: 'snippet', header: 'Snippet', render: (r) => <span className="opa-mono opa-muted" style={{ fontSize: 11 }}>{String(r.snippet || '').slice(0, 80)}</span> },
    { key: 'scraped_at', header: 'When', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.scraped_at)}</span> },
  ]

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Security</h1>
          <div className="opa-page-sub">CVE reachability · IAST · secrets (detect only) · policy stubs</div>
        </div>
      </div>

      <div className="opa-tabs">
        <button type="button" className={`opa-tab ${tab === 'vulns' ? 'active' : ''}`} onClick={() => setTab('vulns')}>Vulnerabilities</button>
        <button type="button" className={`opa-tab ${tab === 'iast' ? 'active' : ''}`} onClick={() => setTab('iast')}>IAST</button>
        <button type="button" className={`opa-tab ${tab === 'secrets' ? 'active' : ''}`} onClick={() => setTab('secrets')}>Secrets</button>
        <button type="button" className={`opa-tab ${tab === 'inventory' ? 'active' : ''}`} onClick={() => setTab('inventory')}>Inventory</button>
        <button type="button" className={`opa-tab ${tab === 'policies' ? 'active' : ''}`} onClick={() => setTab('policies')}>Policies</button>
      </div>

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
            empty={!iast.loading && iastRows.length === 0} emptyText="No IAST findings — enable OPA_IAST=1 / opa.iast on PHP">
            <DataTable columns={iastCols} rows={iastRows} rowKey={(r, i) => `${r.sink}:${r.scraped_at}:${i}`} maxHeight={480} />
          </Panel>
        </>
      )}

      {tab === 'secrets' && (
        <Panel title="Secret findings" icon={<FiKey />} flush loading={secrets.loading} error={secrets.error}
          empty={!secrets.loading && filteredSecrets.length === 0}
          emptyText="POST findings to /v1/security/secrets"
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

      {tab === 'inventory' && (
        <Panel title="Service dependencies" icon={<FiShield />} flush loading={inventory.loading} error={inventory.error}
          empty={!inventory.loading && pkgRows.length === 0} emptyText="No inventory yet">
          <DataTable columns={invCols} rows={pkgRows} rowKey={(r, i) => `${r.service}:${r.package_name}:${r.version}:${i}`} maxHeight={520} />
        </Panel>
      )}

      {tab === 'policies' && (
        <Panel title="Policies (stub)" icon={<FiSliders />} loading={policies.loading}>
          <p className="opa-muted" style={{ marginTop: 0 }}>
            Local severity threshold is stored in <code>localStorage</code> (<code>{SEV_KEY}</code>).
            Agent env mirrors: <code>OPA_SECURITY_MIN_SEVERITY</code>. SAST / IaC / auto-fix deferred.
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
    </div>
  )
}
