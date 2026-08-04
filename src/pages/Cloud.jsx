import React, { useState } from 'react'
import axios from 'axios'
import {
  FiCloud, FiServer, FiDollarSign, FiTag, FiActivity, FiRefreshCw,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, StatusPill, Badge, HubDeferredSurface } from '../components/ui'
import { fmtNum, fmtAgo } from '../theme/format'
import { useI18n } from '../contexts/I18nContext'
import { isHubDeferred } from '../utils/hubDeferred'

const API = import.meta.env.VITE_API_URL || ''

const TABS = [
  { value: 'resources', labelKey: 'cloud.resources', icon: <FiServer size={13} /> },
  { value: 'cost', labelKey: 'cloud.cost', icon: <FiDollarSign size={13} /> },
  { value: 'tags', labelKey: 'cloud.tags', icon: <FiTag size={13} /> },
  { value: 'scrapes', labelKey: 'cloud.scrapes', icon: <FiActivity size={13} /> },
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

/** Cloud coverage — inventory, cost, tag governance. */
export default function Cloud() {
  const { t } = useI18n()
  if (isHubDeferred('cloud')) {
    return <HubDeferredSurface id="cloud" title={t('cloud.title')} subtitle={t('cloud.subtitle')} />
  }
  return <CloudLive />
}

function CloudLive() {
  const { t } = useI18n()
  const [tab, setTab] = useState('resources')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const summary = useApi('/api/cloud/summary', {}, { noRange: true })
  const resources = useApi('/api/cloud/resources', { limit: 200 }, { noRange: true })
  const cost = useApi('/api/cloud/cost', { days: 30 }, { noRange: true })
  const tags = useApi('/api/cloud/tags', {}, { noRange: true })
  const scrapes = useApi('/api/cloud/scrapes', { limit: 100 }, { noRange: true })
  const integrations = useApi('/api/integrations', {}, { noRange: true })

  const s = summary.data || {}
  const res = resources.data?.resources || []
  const byService = cost.data?.by_service || []
  const byTag = cost.data?.by_tag || []
  const under = cost.data?.underutilized || []
  const violations = tags.data?.violations || []
  const scrapeRows = scrapes.data?.scrapes || []
  const cloudIntegrations = (integrations.data?.integrations || []).filter((i) =>
    /^(aws_|azure_|gcp_)/.test(i.id || ''))

  const scrapeNow = async () => {
    setBusy(true); setMsg(null)
    try {
      const { data } = await axios.post(`${API}/api/cloud/scrape-now`)
      setMsg(data)
      summary.reload?.()
      resources.reload?.()
      scrapes.reload?.()
    } catch (e) {
      setMsg({ error: e.response?.data || e.message })
    } finally {
      setBusy(false)
    }
  }

  const resCols = [
    { key: 'provider', header: 'Provider', render: (r) => <Badge>{r.provider || '—'}</Badge> },
    { key: 'kind', header: 'Kind', render: (r) => <Badge>{r.kind || '—'}</Badge> },
    { key: 'name', header: 'Name', render: (r) => <span className="oui-mono cell-strong">{r.name}</span> },
    { key: 'region', header: 'Region', render: (r) => r.region || '—' },
    { key: 'arn', header: 'ARN / ID', render: (r) => (
      <span className="oui-mono oui-text-muted" title={r.arn} style={{ display: 'block', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.arn || '—'}</span>
    ) },
    { key: 'scraped_at', header: 'Seen', num: true, render: (r) => <span className="oui-text-muted">{fmtAgo(r.scraped_at)}</span> },
  ]

  const costCols = [
    { key: 'service', header: 'Service', render: (r) => <span className="oui-mono">{r.service}</span> },
    { key: 'amount', header: 'Amount', num: true, render: (r) => `${fmtNum(r.amount)} ${r.currency || 'USD'}` },
  ]

  const tagCostCols = [
    { key: 'tag_key', header: 'Tag', render: (r) => <span className="oui-mono">{r.tag_key}={r.tag_value}</span> },
    { key: 'amount', header: 'Amount', num: true, render: (r) => fmtNum(r.amount) },
  ]

  const utilCols = [
    { key: 'service', header: 'Service', render: (r) => <span className="oui-mono">{r.service}</span> },
    { key: 'util_pct', header: 'Util %', num: true, render: (r) => {
      const v = Number(r.util_pct) || 0
      return <StatusPill tone={v < 20 ? 'warn' : 'ok'}>{v.toFixed(1)}%</StatusPill>
    } },
    { key: 'amount', header: 'Spend', num: true, render: (r) => fmtNum(r.amount) },
  ]

  const violCols = [
    { key: 'resource_name', header: 'Resource', render: (r) => <span className="oui-mono cell-strong">{r.resource_name}</span> },
    { key: 'kind', header: 'Kind', render: (r) => <Badge>{r.kind || '—'}</Badge> },
    { key: 'missing_tags', header: 'Missing', render: (r) => <StatusPill tone="error">{r.missing_tags || '—'}</StatusPill> },
    { key: 'detected_at', header: 'Detected', num: true, render: (r) => <span className="oui-text-muted">{fmtAgo(r.detected_at)}</span> },
  ]

  const scrapeCols = [
    { key: 'provider_id', header: 'Provider', render: (r) => <span className="oui-mono">{r.provider_id}</span> },
    { key: 'namespace', header: 'Namespace', render: (r) => r.namespace || '—' },
    { key: 'metric_name', header: 'Metric', render: (r) => <span className="oui-mono">{r.metric_name}</span> },
    { key: 'ok', header: 'OK', render: (r) => Number(r.ok) ? <StatusPill tone="ok">ok</StatusPill> : <StatusPill tone="error">fail</StatusPill> },
    { key: 'error', header: 'Error', render: (r) => <span className="oui-text-muted">{r.error || '—'}</span> },
    { key: 'scraped_at', header: 'When', num: true, render: (r) => <span className="oui-text-muted">{fmtAgo(r.scraped_at)}</span> },
  ]

  const integCols = [
    { key: 'id', header: 'ID', render: (r) => <span className="oui-mono">{r.id}</span> },
    { key: 'name', header: 'Name', render: (r) => r.name },
    { key: 'description', header: 'Description', render: (r) => <span className="oui-text-muted">{r.description || '—'}</span> },
  ]

  return (
    <div className="oui-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">{t('cloud.title')}</h1>
          <div className="opa-page-sub">{t('cloud.subtitle')}</div>
        </div>
        <button className="opa-btn" disabled={busy || !s.configured} onClick={scrapeNow} title={!s.configured ? 'Set OPA_CLOUD_MONITOR_CONFIG' : 'Trigger scrape on leader'}>
          <FiRefreshCw size={14} /> Scrape now
        </button>
      </div>

      {msg && (
        <Panel title="Scrape">
          <pre className="oui-mono" style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(msg, null, 2)}</pre>
        </Panel>
      )}

      <div className="opa-grid cols-4">
        <KpiTile label="Providers" icon={<FiCloud size={12} />} value={fmtNum(s.providers || 0)}
          status={s.configured ? 'ok' : 'warn'}
          footer={<span className="oui-text-muted" style={{ fontSize: 11 }}>{s.configured ? 'configured' : 'not configured'}</span>} />
        <KpiTile label={t('cloud.resources')} icon={<FiServer size={12} />} value={fmtNum(s.resources || 0)} status="neutral" />
        <KpiTile label={t('cloud.cost') + ' 30d'} icon={<FiDollarSign size={12} />} value={fmtNum(s.cost_30d || 0)} status="neutral" />
        <KpiTile label="Tag gaps" icon={<FiTag size={12} />} value={fmtNum(s.tag_violations_7d || 0)}
          status={Number(s.tag_violations_7d) > 0 ? 'warn' : 'ok'}
          footer={<span className="oui-text-muted" style={{ fontSize: 11 }}>scrapes ok {fmtNum(s.scrapes_ok_24h || 0)} / fail {fmtNum(s.scrapes_fail_24h || 0)}</span>} />
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} t={t} />

      {tab === 'resources' && (
        <>
          <Panel title="Cloud resources" icon={<FiServer />} flush loading={resources.loading} error={resources.error}
            empty={!resources.loading && res.length === 0} emptyText="No inventory yet — configure OPA_CLOUD_MONITOR_CONFIG">
            <DataTable columns={resCols} rows={res} rowKey={(r) => r.id || `${r.provider}:${r.name}`} maxHeight={420} />
          </Panel>
          <Panel title="Cloud integrations" icon={<FiCloud />} flush loading={integrations.loading} error={integrations.error}
            empty={!integrations.loading && cloudIntegrations.length === 0} emptyText="No aws_/azure_/gcp_ integration defs">
            <DataTable columns={integCols} rows={cloudIntegrations} rowKey={(r) => r.id} maxHeight={280} />
          </Panel>
        </>
      )}

      {tab === 'cost' && (
        <div className="opa-grid cols-2">
          <Panel title="By service" icon={<FiDollarSign />} flush loading={cost.loading} error={cost.error}
            empty={!cost.loading && byService.length === 0} emptyText="Ingest cost via POST /api/cloud/cost/ingest">
            <DataTable columns={costCols} rows={byService} rowKey={(r) => r.service} maxHeight={320} />
          </Panel>
          <Panel title="By tag" icon={<FiTag />} flush loading={cost.loading}
            empty={!cost.loading && byTag.length === 0} emptyText="No tagged cost rows">
            <DataTable columns={tagCostCols} rows={byTag} rowKey={(r, i) => `${r.tag_key}:${r.tag_value}:${i}`} maxHeight={320} />
          </Panel>
          <Panel title="Underutilized" icon={<FiActivity />} flush loading={cost.loading}
            empty={!cost.loading && under.length === 0} emptyText="No util_pct data">
            <DataTable columns={utilCols} rows={under} rowKey={(r) => r.service} maxHeight={280} />
          </Panel>
        </div>
      )}

      {tab === 'tags' && (
        <Panel title={`Tag violations${tags.data?.required_tags ? ` (need: ${tags.data.required_tags})` : ''}`}
          icon={<FiTag />} flush loading={tags.loading} error={tags.error}
          empty={!tags.loading && violations.length === 0} emptyText="No violations — set OPA_CLOUD_REQUIRED_TAGS and ingest cost to evaluate">
          <DataTable columns={violCols} rows={violations} rowKey={(r, i) => `${r.resource_id}:${i}`} maxHeight={420} />
        </Panel>
      )}

      {tab === 'scrapes' && (
        <Panel title="Scrape log" icon={<FiActivity />} flush loading={scrapes.loading} error={scrapes.error}
          empty={!scrapes.loading && scrapeRows.length === 0} emptyText="No scrapes yet">
          <DataTable columns={scrapeCols} rows={scrapeRows} rowKey={(r, i) => `${r.provider_id}:${r.metric_name}:${i}`} maxHeight={420} />
        </Panel>
      )}
    </div>
  )
}
