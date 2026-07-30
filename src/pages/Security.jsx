import React, { useState } from 'react'
import { FiShield, FiAlertTriangle, FiEye, FiEyeOff, FiCrosshair } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, StatusPill, Badge } from '../components/ui'
import { fmtNum, fmtAgo } from '../theme/format'

/** Wave 19: Vulnerability management + IAST (detection only). */
export default function Security() {
  const [tab, setTab] = useState('vulns')
  const summary = useApi('/api/vulns/summary', { hours: 168 }, { noRange: true })
  const findings = useApi('/api/vulns/findings', { limit: 100 }, { noRange: true })
  const inventory = useApi('/api/vulns/inventory', { limit: 100 }, { noRange: true })
  const iastSum = useApi('/api/iast/summary', { hours: 24 }, { noRange: true })
  const iast = useApi('/api/iast/findings', { limit: 100 }, { noRange: true })

  const s = summary.data || {}
  const is = iastSum.data || {}
  const vulnRows = findings.data?.findings || []
  const pkgRows = inventory.data?.packages || []
  const iastRows = iast.data?.findings || []

  const sevTone = (sev) => {
    const v = String(sev || '').toLowerCase()
    if (v === 'critical' || v === 'high') return 'error'
    if (v === 'medium') return 'warn'
    return 'neutral'
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

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Security</h1>
          <div className="opa-page-sub">CVE reachability · IAST sinks (detect only, never block)</div>
        </div>
      </div>

      <div className="opa-tabs">
        <button type="button" className={`opa-tab ${tab === 'vulns' ? 'active' : ''}`} onClick={() => setTab('vulns')}>Vulnerabilities</button>
        <button type="button" className={`opa-tab ${tab === 'iast' ? 'active' : ''}`} onClick={() => setTab('iast')}>IAST</button>
        <button type="button" className={`opa-tab ${tab === 'inventory' ? 'active' : ''}`} onClick={() => setTab('inventory')}>Inventory</button>
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
            empty={!iast.loading && iastRows.length === 0} emptyText="No IAST findings — enable SDK checkSQL / checkCommand hooks">
            <DataTable columns={iastCols} rows={iastRows} rowKey={(r, i) => `${r.sink}:${r.scraped_at}:${i}`} maxHeight={480} />
          </Panel>
        </>
      )}

      {tab === 'inventory' && (
        <Panel title="Service dependencies" icon={<FiShield />} flush loading={inventory.loading} error={inventory.error}
          empty={!inventory.loading && pkgRows.length === 0} emptyText="No inventory yet">
          <DataTable columns={invCols} rows={pkgRows} rowKey={(r, i) => `${r.service}:${r.package_name}:${r.version}:${i}`} maxHeight={520} />
        </Panel>
      )}
    </div>
  )
}
