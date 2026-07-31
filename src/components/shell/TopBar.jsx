import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FiRefreshCw, FiX } from 'react-icons/fi'
import { SegmentedControl } from '../ui/Controls'
import { useTimeRange } from '../../contexts/TimeRangeContext'
import { NAV_GROUPS } from './SideRail'
import TenantSwitcher from '../TenantSwitcher'
import UserMenu from './UserMenu'
import SavedViews from './SavedViews'
import ThemeToggle from './ThemeToggle'
import FullscreenToggle from './FullscreenToggle'
import { LocaleSwitcher, useI18n } from '../../contexts/I18nContext'

function Breadcrumb() {
  const { pathname } = useLocation()
  const { t } = useI18n()
  const labels = React.useMemo(() => {
    const m = { '': t('nav.services'), services: t('nav.services') }
    NAV_GROUPS.forEach((g) => g.items.forEach((i) => {
      m[i.to.replace(/^\//, '')] = t(i.labelKey)
    }))
    return m
  }, [t])
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return <span className="crumb-current">{labels.services || labels['']}</span>
  const crumbs = []
  let acc = ''
  parts.forEach((p, i) => {
    acc += '/' + p
    let label = labels[p] || decodeURIComponent(p)
    if (label.length > 22) label = label.slice(0, 12) + '…' + label.slice(-6)
    const last = i === parts.length - 1
    crumbs.push(
      last
        ? <span key={acc} className="crumb-current">{label}</span>
        : <React.Fragment key={acc}><Link to={acc}>{label}</Link><span className="crumb-sep">/</span></React.Fragment>
    )
  })
  return <>{crumbs}</>
}

function formatCustomLabel(fromMs, toMs) {
  const fmt = (ms) => {
    const d = new Date(ms)
    return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`
  }
  return `${fmt(fromMs)}–${fmt(toMs)} UTC`
}

export default function TopBar() {
  const { range, setRange, ranges, refresh, isCustom, fromMs, toMs, clearCustom } = useTimeRange()
  return (
    <header className="opa-topbar">
      <div className="opa-breadcrumb"><Breadcrumb /></div>
      <div className="opa-topbar-right">
        {isCustom ? (
          <button type="button" className="opa-btn ghost" onClick={clearCustom} title="Clear brush zoom">
            Zoomed {formatCustomLabel(fromMs, toMs)} <FiX size={12} style={{ marginLeft: 4 }} />
          </button>
        ) : (
          <SegmentedControl options={ranges.map((r) => ({ value: r.value, label: r.label }))} value={range} onChange={setRange} />
        )}
        <button className="opa-btn ghost" onClick={refresh} title="Refresh"><FiRefreshCw size={14} /></button>
        <SavedViews />
        <TenantSwitcher />
        <FullscreenToggle />
        <ThemeToggle />
        <LocaleSwitcher />
        <UserMenu />
      </div>
    </header>
  )
}
