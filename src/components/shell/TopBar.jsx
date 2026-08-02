import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FiRefreshCw } from 'react-icons/fi'
import { SegmentedControl } from '../ui/Controls'
import { useTimeRange } from '../../contexts/TimeRangeContext'
import { NAV_GROUPS } from './SideRail'
import TenantSwitcher from '../TenantSwitcher'
import UserMenu from './UserMenu'
import SavedViews from './SavedViews'
import ThemeToggle from './ThemeToggle'
import FullscreenToggle from './FullscreenToggle'

const LABELS = (() => {
  const m = { '': 'Overview', services: 'Services', traces: 'Traces', profiling: 'Profiling', errors: 'Errors', sql: 'Databases', http: 'External HTTP', 'service-map': 'Service Map', rum: 'Browser', performance: 'Performance', live: 'Live', system: 'System', users: 'Users & Roles', 'api-keys': 'API Keys', compare: 'Compare', query: 'Query', metrics: 'Metrics Explorer' }
  NAV_GROUPS.forEach((g) => g.items.forEach((i) => { m[i.to.replace('/', '')] = i.label }))
  return m
})()

function Breadcrumb() {
  const { pathname } = useLocation()
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return <span className="crumb-current">Overview</span>
  const crumbs = []
  let acc = ''
  parts.forEach((p, i) => {
    acc += '/' + p
    let label = LABELS[p] || decodeURIComponent(p)
    if (label.length > 22) label = label.slice(0, 12) + '…' + label.slice(-6) // long ids (trace/fingerprint)
    const last = i === parts.length - 1
    crumbs.push(
      last
        ? <span key={acc} className="crumb-current">{label}</span>
        : <React.Fragment key={acc}><Link to={acc}>{label}</Link><span className="crumb-sep">/</span></React.Fragment>
    )
  })
  return <>{crumbs}</>
}

export default function TopBar() {
  const { range, setRange, ranges, refresh } = useTimeRange()
  return (
    <header className="opa-topbar">
      <div className="opa-breadcrumb"><Breadcrumb /></div>
      <div className="opa-topbar-right">
        <SegmentedControl options={ranges.map((r) => ({ value: r.value, label: r.label }))} value={range} onChange={setRange} />
        <button className="opa-btn ghost" onClick={refresh} title="Refresh"><FiRefreshCw size={14} /></button>
        <SavedViews />
        <TenantSwitcher />
        <FullscreenToggle />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  )
}
