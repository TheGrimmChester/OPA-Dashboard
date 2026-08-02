import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import {
  FiBookOpen, FiUsers, FiRefreshCw, FiShield, FiCheck, FiX, FiServer, FiLayers,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, StatusPill, Badge, HealthDot } from '../components/ui'
import { fmtNum, fmtPct, fmtMs, fmtAgo } from '../theme/format'

const API = import.meta.env.VITE_API_URL || ''

/** Wave 21: Service catalog with ownership and scorecards. */
export default function Catalog() {
  const [tab, setTab] = useState('entities')
  const [kind, setKind] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [selected, setSelected] = useState(null)

  const catalog = useApi('/api/catalog', kind ? { kind } : {}, { noRange: true })
  const scorecards = useApi('/api/catalog/scorecards', {}, { noRange: true })
  const teams = useApi('/api/catalog/teams', {}, { noRange: true })
  const groups = useApi('/api/catalog/groups', {}, { noRange: true })
  const detail = useApi(
    selected ? `/api/catalog/entities/${encodeURIComponent(selected)}` : '',
    {},
    { skip: !selected, noRange: true },
  )

  const entities = catalog.data?.entities || []
  const cards = scorecards.data?.scorecards || []
  const teamRows = teams.data?.teams || []
  const groupRows = groups.data?.groups || []

  const kpis = useMemo(() => {
    const withOwner = entities.filter((e) => e.ownership && (e.ownership.owner || e.ownership.team_id)).length
    const critical = entities.filter((e) => e.tier === 'critical').length
    const avgScore = cards.length
      ? cards.reduce((a, c) => a + Number(c.score_pct || 0), 0) / cards.length
      : null
    return { total: entities.length, withOwner, critical, avgScore }
  }, [entities, cards])

  const discover = async () => {
    setBusy(true); setMsg(null)
    try {
      const { data } = await axios.post(`${API}/api/catalog/discover`)
      setMsg(`Discovered ${data.entities_upserted || 0} entities, ${data.relationships_upserted || 0} relationships`)
      catalog.reload?.()
      scorecards.reload?.()
    } catch (e) {
      setMsg(e.response?.data || e.message || 'Discover failed')
    } finally {
      setBusy(false)
    }
  }

  const entityCols = [
    {
      key: 'name', header: 'Entity',
      render: (r) => (
        <div>
          <div className="opa-row" style={{ gap: 6 }}>
            <HealthDot tone={r.health && Number(r.health.error_rate_pct) >= 5 ? 'error' : r.health ? 'ok' : 'neutral'} />
            <span className="cell-strong opa-mono">{r.display_name || r.name}</span>
            <Badge>{r.kind}</Badge>
          </div>
          {r.ownership?.owner && <div className="opa-muted" style={{ fontSize: 11 }}>owner: {r.ownership.owner}</div>}
        </div>
      ),
      sortValue: (r) => r.name,
    },
    { key: 'tier', header: 'Tier', width: 90, render: (r) => {
      const t = r.tier || 'medium'
      const tone = t === 'critical' ? 'error' : t === 'high' ? 'warn' : 'neutral'
      return <StatusPill tone={tone}>{t}</StatusPill>
    } },
    { key: 'lifecycle', header: 'Lifecycle', width: 100, render: (r) => <span className="opa-muted">{r.lifecycle || '—'}</span> },
    {
      key: 'health', header: 'Error % 1h', num: true, width: 110,
      render: (r) => (r.health ? fmtPct(Number(r.health.error_rate_pct || 0)) : <span className="opa-muted">—</span>),
      sortValue: (r) => Number(r.health?.error_rate_pct || -1),
    },
    {
      key: 'avg_ms', header: 'Avg', num: true, width: 90,
      render: (r) => (r.health ? fmtMs(Number(r.health.avg_ms || 0)) : '—'),
    },
    { key: 'source', header: 'Source', width: 100, render: (r) => <Badge>{r.source || '—'}</Badge> },
    {
      key: 'runbook', header: 'Runbook', width: 90,
      render: (r) => (r.runbook_url
        ? <a href={r.runbook_url} target="_blank" rel="noreferrer">link</a>
        : <span className="opa-muted">—</span>),
    },
  ]

  const scoreCols = [
    { key: 'name', header: 'Service', render: (r) => <span className="opa-mono cell-strong">{r.name}</span> },
    {
      key: 'score_pct', header: 'Score', num: true, width: 100,
      render: (r) => {
        const v = Number(r.score_pct || 0)
        const tone = v >= 80 ? 'ok' : v >= 50 ? 'warn' : 'error'
        return <StatusPill tone={tone}>{fmtPct(v, 0)}</StatusPill>
      },
    },
    {
      key: 'checks', header: 'Checks',
      render: (r) => (
        <div className="opa-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {(r.checks || []).map((c) => (
            <span key={c.id} title={c.detail} className="opa-muted" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              {c.pass ? <FiCheck size={11} color="var(--ok)" /> : <FiX size={11} color="var(--error)" />}
              {c.label}
            </span>
          ))}
        </div>
      ),
    },
  ]

  const teamCols = [
    { key: 'name', header: 'Team', render: (r) => <span className="cell-strong">{r.name}</span> },
    { key: 'email', header: 'Email', render: (r) => <span className="opa-mono">{r.email || '—'}</span> },
    { key: 'slack_channel', header: 'Slack', render: (r) => r.slack_channel || '—' },
    { key: 'pagerduty_service', header: 'PagerDuty', render: (r) => r.pagerduty_service || '—' },
  ]

  const groupCols = [
    { key: 'name', header: 'Group', render: (r) => <span className="cell-strong">{r.name}</span> },
    { key: 'parent_id', header: 'Parent', render: (r) => <span className="opa-mono opa-muted">{r.parent_id || '—'}</span> },
    { key: 'entity_count', header: 'Entities', num: true, render: (r) => fmtNum(r.entity_count || 0) },
  ]

  return (
    <div className="opa-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Service catalog</h1>
          <div className="opa-page-sub">Entities · ownership · scorecards · account groups</div>
        </div>
        <button className="opa-btn primary" disabled={busy} onClick={discover}>
          <FiRefreshCw size={13} /> {busy ? 'Discovering…' : 'Discover from telemetry'}
        </button>
      </div>
      {msg && <div className="opa-muted" style={{ fontSize: 12 }}>{String(msg)}</div>}

      <div className="opa-grid cols-4">
        <KpiTile label="Entities" icon={<FiBookOpen size={12} />} value={fmtNum(kpis.total)} status="neutral" />
        <KpiTile label="With owner" icon={<FiUsers size={12} />} value={fmtNum(kpis.withOwner)} status="neutral" />
        <KpiTile label="Critical tier" icon={<FiShield size={12} />} value={fmtNum(kpis.critical)}
          status={kpis.critical ? 'warn' : 'neutral'} />
        <KpiTile label="Avg scorecard" icon={<FiCheck size={12} />}
          value={kpis.avgScore == null ? '—' : fmtPct(kpis.avgScore, 0)}
          status={kpis.avgScore == null ? 'neutral' : kpis.avgScore >= 80 ? 'ok' : kpis.avgScore >= 50 ? 'warn' : 'error'} />
      </div>

      <div className="opa-tabs">
        <button type="button" className={`opa-tab ${tab === 'entities' ? 'active' : ''}`} onClick={() => setTab('entities')}>Entities</button>
        <button type="button" className={`opa-tab ${tab === 'scorecards' ? 'active' : ''}`} onClick={() => setTab('scorecards')}>Scorecards</button>
        <button type="button" className={`opa-tab ${tab === 'teams' ? 'active' : ''}`} onClick={() => setTab('teams')}>Teams</button>
        <button type="button" className={`opa-tab ${tab === 'groups' ? 'active' : ''}`} onClick={() => setTab('groups')}>Groups</button>
      </div>

      {tab === 'entities' && (
        <Panel title="Catalog" icon={<FiServer />} flush loading={catalog.loading} error={catalog.error}
          empty={!catalog.loading && entities.length === 0}
          emptyText="No entities yet — click Discover, or POST /api/catalog/apply"
          actions={(
            <select className="opa-select" value={kind} onChange={(e) => setKind(e.target.value)} style={{ minWidth: 120 }}>
              <option value="">All kinds</option>
              <option value="service">service</option>
              <option value="host">host</option>
              <option value="database">database</option>
              <option value="queue">queue</option>
              <option value="frontend">frontend</option>
              <option value="synthetic">synthetic</option>
            </select>
          )}
        >
          <DataTable columns={entityCols} rows={entities} rowKey={(r) => r.id}
            onRowClick={(r) => setSelected(selected === r.id ? null : r.id)}
            initialSort={{ key: 'name', dir: 'asc' }} maxHeight={480} />
        </Panel>
      )}

      {tab === 'scorecards' && (
        <Panel title="Maturity scorecards" icon={<FiCheck />} flush loading={scorecards.loading} error={scorecards.error}
          empty={!scorecards.loading && cards.length === 0} emptyText="No service entities to score">
          <DataTable columns={scoreCols} rows={cards} rowKey={(r) => r.entity_id}
            initialSort={{ key: 'score_pct', dir: 'asc' }} maxHeight={520} />
        </Panel>
      )}

      {tab === 'teams' && (
        <Panel title="Teams" icon={<FiUsers />} flush loading={teams.loading} error={teams.error}
          empty={!teams.loading && teamRows.length === 0} emptyText="No teams — declare via /api/catalog/teams/upsert or apply">
          <DataTable columns={teamCols} rows={teamRows} rowKey={(r) => r.id} maxHeight={420} />
        </Panel>
      )}

      {tab === 'groups' && (
        <Panel title="Account groups" icon={<FiLayers />} flush loading={groups.loading} error={groups.error}
          empty={!groups.loading && groupRows.length === 0} emptyText="No nested groups yet">
          <DataTable columns={groupCols} rows={groupRows} rowKey={(r) => r.id} maxHeight={420} />
        </Panel>
      )}

      {selected && detail.data && (
        <Panel title={`Entity · ${detail.data.display_name || detail.data.name}`} icon={<FiBookOpen />}
          loading={detail.loading} error={detail.error}
          actions={<button className="opa-btn ghost" onClick={() => setSelected(null)}>Close</button>}
        >
          <div className="opa-stack" style={{ padding: 'var(--sp-3)' }}>
            <div className="opa-muted">
              {detail.data.kind} · {detail.data.tier} · {detail.data.lifecycle} · updated {fmtAgo(detail.data.updated_at)}
              {detail.data.kind === 'service' && (
                <> · <Link to={`/services/${encodeURIComponent(detail.data.name)}`}>service overview</Link></>
              )}
            </div>
            {detail.data.scorecard && (
              <div>
                <strong>Scorecard {fmtPct(Number(detail.data.scorecard.score_pct || 0), 0)}</strong>
                <div className="opa-row" style={{ gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                  {(detail.data.scorecard.checks || []).map((c) => (
                    <StatusPill key={c.id} tone={c.pass ? 'ok' : 'error'}>{c.label}</StatusPill>
                  ))}
                </div>
              </div>
            )}
            {detail.data.ownership && (
              <div className="opa-muted" style={{ fontSize: 13 }}>
                Owner: {detail.data.ownership.owner || '—'} · Team: {detail.data.ownership.team_id || '—'} ·
                On-call: {detail.data.ownership.oncall_schedule || '—'}
              </div>
            )}
            {(detail.data.relationships || []).length > 0 && (
              <div>
                <strong>Relationships</strong>
                <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
                  {detail.data.relationships.map((rel) => (
                    <li key={rel.id} className="opa-mono" style={{ fontSize: 12 }}>
                      {rel.rel_type}: {rel.from_id === selected ? '→' : '←'} {rel.from_id === selected ? rel.to_id : rel.from_id}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Panel>
      )}
    </div>
  )
}
