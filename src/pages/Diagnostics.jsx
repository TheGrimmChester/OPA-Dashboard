import React, { useState } from 'react'
import axios from 'axios'
import {
  FiGitCommit, FiHardDrive, FiCpu, FiLock,
} from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, StatusPill, Badge } from '../components/ui'
import { fmtNum, fmtAgo, fmtBytes } from '../theme/format'
import { useI18n } from '../contexts/I18nContext'
import { PageHeader } from '@open-family/ui'

const API = import.meta.env.VITE_API_URL || ''

const TABS = [
  { value: 'commits', labelKey: 'diag.commits', icon: <FiGitCommit size={13} /> },
  { value: 'heap', labelKey: 'diag.heap', icon: <FiHardDrive size={13} /> },
  { value: 'threads', labelKey: 'diag.threads', icon: <FiCpu size={13} /> },
  { value: 'locks', labelKey: 'diag.locks', icon: <FiLock size={13} /> },
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

/** Deep diagnostics. */
export default function Diagnostics() {
  const { t } = useI18n()
  const [tab, setTab] = useState('commits')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [service, setService] = useState('api')
  const [heapSel, setHeapSel] = useState(null)
  const [releaseForm, setReleaseForm] = useState({
    service: 'api', release: '1.0.0', git_sha: 'abc1234', git_repo: 'https://github.com/example/app',
    author: 'dev', message: 'fix latency',
  })

  const suspects = useApi('/api/diagnostics/suspect-commits', { service, hours: 24 }, { noRange: true })
  const heap = useApi('/api/diagnostics/heap', {}, { noRange: true })
  const threads = useApi('/api/diagnostics/threads', {}, { noRange: true })
  const locks = useApi('/api/diagnostics/locks', {}, { noRange: true })
  const releases = useApi('/api/releases', { service }, { noRange: true })

  const sus = suspects.data?.suspects || []
  const snaps = heap.data?.snapshots || []
  const thr = threads.data?.threads || []
  const lck = locks.data?.locks || []
  const rels = releases.data?.releases || []

  const postRelease = async () => {
    setBusy(true); setMsg(null)
    try {
      const { data } = await axios.post(`${API}/api/releases`, {
        ...releaseForm,
        commits: [{ sha: releaseForm.git_sha, author: releaseForm.author, message: releaseForm.message }],
      })
      setMsg(data)
      releases.reload?.()
      suspects.reload?.()
    } catch (e) {
      setMsg({ error: e.response?.data || e.message })
    } finally {
      setBusy(false)
    }
  }

  const susCols = [
    { key: 'service', header: t('diag.service'), render: (r) => <span className="oui-mono">{r.service}</span> },
    { key: 'release', header: t('diag.release'), render: (r) => <Badge>{r.release}</Badge> },
    { key: 'git_sha', header: 'SHA', render: (r) => r.diff_url ? (
      <a className="oui-mono" href={r.diff_url} target="_blank" rel="noreferrer">{String(r.git_sha || '').slice(0, 8)}</a>
    ) : <span className="oui-mono">{String(r.git_sha || '').slice(0, 8) || '—'}</span> },
    { key: 'author', header: t('diag.author'), render: (r) => r.author || '—' },
    { key: 'score', header: t('diag.score'), num: true, render: (r) => <StatusPill tone={r.score >= 70 ? 'warn' : 'neutral'}>{fmtNum(r.score)}</StatusPill> },
    { key: 'evidence', header: t('diag.evidence'), render: (r) => <span className="oui-text-muted" style={{ fontSize: 12 }}>{(r.evidence || []).join('; ') || '—'}</span> },
  ]

  const heapCols = [
    { key: 'service', header: t('diag.service'), render: (r) => <span className="oui-mono">{r.service}</span> },
    { key: 'runtime', header: 'Runtime', render: (r) => <Badge>{r.runtime || '—'}</Badge> },
    { key: 'total_bytes', header: t('diag.heap'), num: true, render: (r) => fmtBytes(r.total_bytes) },
    { key: 'captured_at', header: t('diag.when'), num: true, render: (r) => <span className="oui-text-muted">{fmtAgo(r.captured_at)}</span> },
  ]

  const parseDominators = (snap) => {
    let dom = snap?.dominators
    if (!dom && snap?.dominators_json) {
      try { dom = typeof snap.dominators_json === 'string' ? JSON.parse(snap.dominators_json) : snap.dominators_json }
      catch (_) { dom = null }
    }
    return Array.isArray(dom) ? dom : []
  }

  const renderDomTree = (nodes, depth = 0) => {
    if (!nodes?.length) return null
    return (
      <ul style={{ margin: 0, paddingLeft: depth === 0 ? 16 : 18, listStyle: 'disc' }}>
        {nodes.map((n, i) => {
          const name = n.name || n.class || n.type || n.function || `#${i}`
          const retained = n.retained_bytes ?? n.retained ?? n.size ?? n.bytes
          const kids = n.children || n.dominators || n.nodes
          return (
            <li key={`${depth}-${i}-${name}`} style={{ marginBottom: 4, fontSize: 12 }}>
              <span className="oui-mono">{name}</span>
              {retained != null && (
                <span className="oui-text-muted"> · {t('diag.retained')} {fmtBytes(retained)}</span>
              )}
              {Array.isArray(kids) && kids.length > 0 && renderDomTree(kids, depth + 1)}
            </li>
          )
        })}
      </ul>
    )
  }

  const thrCols = [
    { key: 'service', header: t('diag.service'), render: (r) => <span className="oui-mono">{r.service}</span> },
    { key: 'thread_name', header: t('diag.threads'), render: (r) => r.thread_name || '—' },
    { key: 'state', header: 'State', render: (r) => <Badge>{r.state}</Badge> },
    { key: 'samples', header: 'Samples', num: true, render: (r) => fmtNum(r.samples) },
    { key: 'avg_wait_ms', header: 'Wait', num: true, render: (r) => fmtNum(r.avg_wait_ms) },
  ]

  const lockCols = [
    { key: 'service', header: t('diag.service'), render: (r) => <span className="oui-mono">{r.service}</span> },
    { key: 'lock_name', header: t('diag.locks'), render: (r) => <span className="oui-mono">{r.lock_name}</span> },
    { key: 'waiters', header: 'Waiters', num: true, render: (r) => fmtNum(r.waiters) },
    { key: 'wait_ms', header: 'Wait ms', num: true, render: (r) => fmtNum(r.wait_ms) },
    { key: 'deadlock', header: 'Deadlock', render: (r) => (Number(r.deadlock) ? <StatusPill tone="error">yes</StatusPill> : <span className="oui-text-muted">no</span>) },
  ]

  return (
    <div className="oui-stack">
      <PageHeader
        title={t('diag.title')}
        description={t('diag.subtitle')}
      />

      <div className="oui-grid is-4">
        <KpiTile label={t('diag.commits')} icon={<FiGitCommit size={12} />} value={fmtNum(sus.length)} status="neutral" />
        <KpiTile label={t('diag.heap')} icon={<FiHardDrive size={12} />} value={fmtNum(snaps.length)} status="neutral" />
        <KpiTile label={t('diag.threads')} icon={<FiCpu size={12} />} value={fmtNum(thr.length)} status="neutral" />
        <KpiTile label={t('diag.locks')} icon={<FiLock size={12} />} value={fmtNum(lck.length)}
          status={lck.some((r) => Number(r.deadlock)) ? 'error' : 'ok'} />
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} t={t} />

      {msg && (
        <Panel title={t('diag.result')}>
          <pre className="oui-mono" style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(msg, null, 2)}</pre>
        </Panel>
      )}

      {tab === 'commits' && (
        <>
          <Panel title={t('diag.recordRelease')}>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
              {Object.keys(releaseForm).map((k) => (
                <input key={k} className="oui-input" placeholder={k} value={releaseForm[k]}
                  onChange={(e) => setReleaseForm({ ...releaseForm, [k]: e.target.value })} />
              ))}
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <input className="oui-input" placeholder="filter service" value={service} onChange={(e) => setService(e.target.value)} />
              <button className="oui-btn is-secondary" disabled={busy} onClick={postRelease}>{t('diag.recordRelease')}</button>
            </div>
          </Panel>
          <Panel title={t('diag.commits')} icon={<FiGitCommit />} flush loading={suspects.loading} error={suspects.error}
            empty={!suspects.loading && sus.length === 0} emptyText={t('diag.emptyCommits')}>
            <DataTable
          loading={suspects.loading}
          error={suspects.error}
          onRetry={suspects.reload} columns={susCols} rows={sus} rowKey={(r) => `${r.service}:${r.release}`} maxHeight={360} />
          </Panel>
          <Panel title={t('diag.releases')} flush>
            <DataTable
              loading={releases.loading}
              error={releases.error}
              onRetry={releases.reload}
              emptyTitle="No releases recorded"
              emptyText="A release marker is created by posting to /api/releases at deploy time."
              columns={[
              { key: 'release', header: t('diag.release'), render: (r) => <Badge>{r.release}</Badge> },
              { key: 'git_sha', header: 'SHA', render: (r) => <span className="oui-mono">{String(r.git_sha || '').slice(0, 8)}</span> },
              { key: 'deployed_at', header: t('diag.when'), num: true, render: (r) => <span className="oui-text-muted">{fmtAgo(r.deployed_at)}</span> },
            ]} rows={rels} rowKey={(r) => r.id} maxHeight={220} />
          </Panel>
        </>
      )}

      {tab === 'heap' && (
        <>
          <Panel title={t('diag.heap')} icon={<FiHardDrive />} flush loading={heap.loading} error={heap.error}
            empty={!heap.loading && snaps.length === 0} emptyText={t('diag.emptyHeap')}>
            <DataTable
          loading={heap.loading}
          error={heap.error}
          onRetry={heap.reload} columns={heapCols} rows={snaps} rowKey={(r) => r.id} maxHeight={280}
              onRowClick={(r) => setHeapSel(r.id === heapSel ? null : r.id)} />
          </Panel>
          {heapSel && (() => {
            const row = snaps.find((s) => s.id === heapSel) || {}
            const doms = parseDominators(row)
            return (
              <Panel title={t('diag.dominators')}>
                {doms.length ? renderDomTree(doms) : <div className="oui-text-muted" style={{ fontSize: 12 }}>No dominators on this snapshot</div>}
              </Panel>
            )
          })()}
        </>
      )}

      {tab === 'threads' && (
        <Panel title={t('diag.threads')} icon={<FiCpu />} flush loading={threads.loading} error={threads.error}
          empty={!threads.loading && thr.length === 0} emptyText={t('diag.emptyThreads')}>
          <DataTable
          loading={threads.loading}
          error={threads.error}
          onRetry={threads.reload} columns={thrCols} rows={thr} rowKey={(r, i) => `${r.service}:${r.thread_name}:${i}`} maxHeight={420} />
        </Panel>
      )}

      {tab === 'locks' && (
        <Panel title={t('diag.locks')} icon={<FiLock />} flush loading={locks.loading} error={locks.error}
          empty={!locks.loading && lck.length === 0} emptyText={t('diag.emptyLocks')}>
          <DataTable
          loading={locks.loading}
          error={locks.error}
          onRetry={locks.reload} columns={lockCols} rows={lck} rowKey={(r) => `${r.service}:${r.lock_name}`} maxHeight={420} />
        </Panel>
      )}
    </div>
  )
}
