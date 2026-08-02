import React, { useState } from 'react'
import axios from 'axios'
import {
  FiShare2, FiGlobe, FiShield, FiServer, FiCpu, FiActivity, FiSearch,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, StatusPill, Badge } from '../components/ui'
import { fmtNum, fmtAgo, fmtMs } from '../theme/format'
import { useI18n } from '../contexts/I18nContext'

const API = import.meta.env.VITE_API_URL || ''

const TABS = [
  { value: 'flows', labelKey: 'net.flows', icon: <FiShare2 size={13} /> },
  { value: 'dns', labelKey: 'net.dns', icon: <FiGlobe size={13} /> },
  { value: 'tls', labelKey: 'net.tls', icon: <FiShield size={13} /> },
  { value: 'discovered', labelKey: 'net.discovered', icon: <FiServer size={13} /> },
  { value: 'profiles', labelKey: 'net.profiles', icon: <FiCpu size={13} /> },
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

/** Network: Network ingest contract & host profiles. */
export default function Network() {
  const { t } = useI18n()
  const [tab, setTab] = useState('flows')
  const [probe, setProbe] = useState('example.com')
  const [probeOut, setProbeOut] = useState(null)
  const [busy, setBusy] = useState(false)

  const summary = useApi('/api/network/summary', {}, { noRange: true })
  const flows = useApi('/api/network/flows', { limit: 200 }, { noRange: true })
  const deps = useApi('/api/network/dependencies', {}, { noRange: true })
  const dns = useApi('/api/network/dns', { limit: 100 }, { noRange: true })
  const tls = useApi('/api/network/tls', { limit: 100 }, { noRange: true })
  const discovered = useApi('/api/network/discovered', { limit: 200 }, { noRange: true })
  const profiles = useApi('/api/network/host-profiles', { limit: 100 }, { noRange: true })

  const s = summary.data || {}
  const flowRows = flows.data?.flows || []
  const edgeRows = deps.data?.edges || []
  const dnsRows = dns.data?.dns || []
  const tlsRows = tls.data?.tls || []
  const svcRows = discovered.data?.services || []
  const profRows = profiles.data?.profiles || []

  const runProbe = async () => {
    setBusy(true); setProbeOut(null)
    try {
      const { data } = await axios.post(`${API}/api/network/probe-dns`, { name: probe })
      setProbeOut(data)
      dns.reload?.()
      summary.reload?.()
    } catch (e) {
      setProbeOut({ error: e.response?.data || e.message })
    } finally {
      setBusy(false)
    }
  }

  const flowCols = [
    { key: 'src_service', header: 'Src', render: (r) => <span className="opa-mono cell-strong">{r.src_service || '—'}</span> },
    { key: 'dst_service', header: 'Dst', render: (r) => <span className="opa-mono">{r.dst_service || '—'}</span> },
    { key: 'protocol', header: 'Proto', render: (r) => <Badge>{r.protocol || 'tcp'}</Badge> },
    { key: 'bytes_sent', header: 'Bytes →', num: true, render: (r) => fmtNum(r.bytes_sent) },
    { key: 'retransmits', header: 'Retrans', num: true, render: (r) => {
      const v = Number(r.retransmits) || 0
      return v > 0 ? <StatusPill tone="warn">{fmtNum(v)}</StatusPill> : fmtNum(v)
    } },
    { key: 'rtt_us', header: 'RTT', num: true, render: (r) => (Number(r.rtt_us) > 0 ? `${fmtNum(r.rtt_us)} µs` : '—') },
    { key: 'last_seen', header: 'Seen', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.last_seen)}</span> },
  ]

  const edgeCols = [
    { key: 'src_service', header: 'From', render: (r) => <span className="opa-mono">{r.src_service}</span> },
    { key: 'dst_service', header: 'To', render: (r) => <span className="opa-mono">{r.dst_service}</span> },
    { key: 'bytes', header: 'Bytes', num: true, render: (r) => fmtNum(r.bytes) },
    { key: 'rtt_us', header: 'RTT', num: true, render: (r) => (Number(r.rtt_us) > 0 ? `${fmtNum(r.rtt_us)} µs` : '—') },
    { key: 'errors', header: 'Errors', num: true, render: (r) => fmtNum(r.errors) },
  ]

  const dnsCols = [
    { key: 'query_name', header: 'Query', render: (r) => <span className="opa-mono">{r.query_name}</span> },
    { key: 'rcode', header: 'Rcode', render: (r) => (
      <StatusPill tone={r.rcode === 'NOERROR' ? 'ok' : 'error'}>{r.rcode || '—'}</StatusPill>
    ) },
    { key: 'count', header: 'Count', num: true, render: (r) => fmtNum(r.count) },
    { key: 'avg_latency_ms', header: 'Avg', num: true, render: (r) => fmtMs(r.avg_latency_ms) },
  ]

  const tlsCols = [
    { key: 'server_name', header: 'SNI', render: (r) => <span className="opa-mono">{r.server_name || '—'}</span> },
    { key: 'version', header: 'Version', render: (r) => <Badge>{r.version || '—'}</Badge> },
    { key: 'count', header: 'Count', num: true, render: (r) => fmtNum(r.count) },
    { key: 'failures', header: 'Fails', num: true, render: (r) => {
      const v = Number(r.failures) || 0
      return v > 0 ? <StatusPill tone="error">{fmtNum(v)}</StatusPill> : fmtNum(v)
    } },
    { key: 'avg_handshake_ms', header: 'Handshake', num: true, render: (r) => fmtMs(r.avg_handshake_ms) },
  ]

  const discCols = [
    { key: 'name', header: 'Service', render: (r) => <span className="opa-mono cell-strong">{r.name}</span> },
    { key: 'host', header: 'Host', render: (r) => r.host || '—' },
    { key: 'listen_port', header: 'Port', num: true, render: (r) => fmtNum(r.listen_port) },
    { key: 'process_name', header: 'Process', render: (r) => r.process_name || '—' },
    { key: 'source', header: 'Source', render: (r) => <Badge>{r.source || '—'}</Badge> },
    { key: 'last_seen', header: 'Seen', num: true, render: (r) => <span className="opa-muted">{fmtAgo(r.last_seen)}</span> },
  ]

  const profCols = [
    { key: 'host', header: 'Host', render: (r) => r.host || '—' },
    { key: 'process_name', header: 'Process', render: (r) => <Badge>{r.process_name || '—'}</Badge> },
    { key: 'function', header: 'Function', render: (r) => <span className="opa-mono">{r.function}</span> },
    { key: 'samples', header: 'Samples', num: true, render: (r) => fmtNum(r.samples) },
    { key: 'cpu_pct', header: 'CPU %', num: true, render: (r) => (Number(r.cpu_pct) || 0).toFixed(1) },
  ]

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">{t('net.title')}</h1>
          <div className="opa-page-sub">{t('net.subtitle')}</div>
        </div>
      </div>

      <div className="opa-grid cols-4">
        <KpiTile label="Flows 1h" icon={<FiShare2 size={12} />} value={fmtNum(s.flows_1h || 0)}
          status={s.sampler_enabled ? 'ok' : 'neutral'}
          footer={<span className="opa-muted" style={{ fontSize: 11 }}>{s.sampler_enabled ? 'sampler on' : 'ingest / collector'}</span>} />
        <KpiTile label="Avg RTT" icon={<FiActivity size={12} />} value={Number(s.avg_rtt_us) > 0 ? `${fmtNum(s.avg_rtt_us)} µs` : '—'} status="neutral" />
        <KpiTile label="DNS fails" icon={<FiGlobe size={12} />} value={fmtNum(s.dns_fail_1h || 0)}
          status={Number(s.dns_fail_1h) > 0 ? 'warn' : 'ok'} />
        <KpiTile label={t('net.discovered')} icon={<FiServer size={12} />} value={fmtNum(s.discovered_24h || 0)} status="neutral"
          footer={<span className="opa-muted" style={{ fontSize: 11 }}>TLS fails {fmtNum(s.tls_fail_1h || 0)}</span>} />
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} t={t} />

      {tab === 'flows' && (
        <div className="opa-grid cols-2">
          <Panel title="Service edges" icon={<FiShare2 />} flush loading={deps.loading} error={deps.error}
            empty={!deps.loading && edgeRows.length === 0} emptyText="No attributed flows yet">
            <DataTable columns={edgeCols} rows={edgeRows} rowKey={(r) => `${r.src_service}->${r.dst_service}`} maxHeight={360} />
          </Panel>
          <Panel title="Connection flows" icon={<FiActivity />} flush loading={flows.loading} error={flows.error}
            empty={!flows.loading && flowRows.length === 0} emptyText="POST /v1/network/flows or enable OPA_NETWORK_SAMPLER">
            <DataTable columns={flowCols} rows={flowRows} rowKey={(r, i) => `${r.src_addr}:${r.src_port}-${r.dst_addr}:${i}`} maxHeight={360} />
          </Panel>
        </div>
      )}

      {tab === 'dns' && (
        <>
          <Panel title="Probe DNS">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="opa-input" value={probe} onChange={(e) => setProbe(e.target.value)} placeholder="hostname" style={{ flex: 1 }} />
              <button className="opa-btn" disabled={busy || !probe} onClick={runProbe}><FiSearch size={14} /> Probe</button>
            </div>
            {probeOut && <pre className="opa-mono" style={{ marginTop: 12, fontSize: 12 }}>{JSON.stringify(probeOut, null, 2)}</pre>}
          </Panel>
          <Panel title="DNS resolutions" icon={<FiGlobe />} flush loading={dns.loading} error={dns.error}
            empty={!dns.loading && dnsRows.length === 0} emptyText="No DNS events">
            <DataTable columns={dnsCols} rows={dnsRows} rowKey={(r, i) => `${r.query_name}:${r.rcode}:${i}`} maxHeight={420} />
          </Panel>
        </>
      )}

      {tab === 'tls' && (
        <Panel title="TLS handshakes" icon={<FiShield />} flush loading={tls.loading} error={tls.error}
          empty={!tls.loading && tlsRows.length === 0} emptyText="No TLS events — POST /v1/network/tls">
          <DataTable columns={tlsCols} rows={tlsRows} rowKey={(r, i) => `${r.server_name}:${i}`} maxHeight={420} />
        </Panel>
      )}

      {tab === 'discovered' && (
        <Panel title="Agentless services" icon={<FiServer />} flush loading={discovered.loading} error={discovered.error}
          empty={!discovered.loading && svcRows.length === 0} emptyText="No discovered listeners">
          <DataTable columns={discCols} rows={svcRows} rowKey={(r) => r.id || `${r.host}:${r.name}:${r.listen_port}`} maxHeight={420} />
        </Panel>
      )}

      {tab === 'profiles' && (
        <Panel title="Host profiles" icon={<FiCpu />} flush loading={profiles.loading} error={profiles.error}
          empty={!profiles.loading && profRows.length === 0} emptyText="POST /v1/ebpf/profiles from an external host sampler">
          <DataTable columns={profCols} rows={profRows} rowKey={(r, i) => `${r.host}:${r.function}:${i}`} maxHeight={420} />
        </Panel>
      )}
    </div>
  )
}
