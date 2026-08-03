import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  FiActivity, FiServer, FiCpu, FiAlertCircle, FiDatabase, FiGlobe, FiShare2,
  FiMonitor, FiTrendingUp, FiRadio, FiHardDrive, FiUsers, FiUser, FiKey, FiTarget,
  FiBell, FiZap, FiColumns, FiFileText, FiBarChart2, FiLayout, FiCloud, FiShield, FiBookOpen,
  FiChevronsLeft, FiChevronsRight, FiTerminal, FiGitBranch, FiMap,
} from 'react-icons/fi'
import { useI18n } from '../../contexts/I18nContext'

export const NAV_GROUPS = [
  {
    labelKey: 'nav.group.monitor',
    items: [
      { to: '/services', labelKey: 'nav.services', icon: FiServer },
      { to: '/catalog', labelKey: 'nav.catalog', icon: FiBookOpen },
      { to: '/key-transactions', labelKey: 'nav.keyTransactions', icon: FiTarget },
      { to: '/commands', labelKey: 'nav.commands', icon: FiTerminal },
      { to: '/traces', labelKey: 'nav.traces', icon: FiActivity },
      { to: '/profiling', labelKey: 'nav.profiling', icon: FiCpu },
      { to: '/errors', labelKey: 'nav.errors', icon: FiAlertCircle },
      { to: '/logs', labelKey: 'nav.logs', icon: FiFileText },
    ],
  },
  {
    labelKey: 'nav.group.reliability',
    items: [
      { to: '/alerts', labelKey: 'nav.alerts', icon: FiBell },
      { to: '/slos', labelKey: 'nav.slos', icon: FiTarget },
      { to: '/anomalies', labelKey: 'nav.anomalies', icon: FiZap },
      { to: '/synthetics', labelKey: 'nav.synthetics', icon: FiRadio },
      { to: '/security', labelKey: 'nav.security', icon: FiShield },
      { to: '/diagnostics', labelKey: 'nav.diagnostics', icon: FiActivity },
    ],
  },
  {
    labelKey: 'nav.group.analyze',
    items: [
      { to: '/sql', labelKey: 'nav.sql', icon: FiDatabase },
      { to: '/http', labelKey: 'nav.http', icon: FiGlobe },
      { to: '/service-map', labelKey: 'nav.serviceMap', icon: FiShare2 },
      { to: '/network', labelKey: 'nav.network', icon: FiGlobe },
      { to: '/rum', labelKey: 'nav.rum', icon: FiMonitor },
      { to: '/performance', labelKey: 'nav.performance', icon: FiTrendingUp },
      { to: '/perf-lab', labelKey: 'nav.perfLab', icon: FiZap },
      { to: '/compare', labelKey: 'nav.compare', icon: FiColumns },
    ],
  },
  {
    labelKey: 'nav.group.infra',
    items: [
      { to: '/infrastructure', labelKey: 'nav.hosts', icon: FiHardDrive },
      { to: '/cloud', labelKey: 'nav.cloud', icon: FiCloud },
      { to: '/metrics', labelKey: 'nav.metrics', icon: FiBarChart2 },
      { to: '/query', labelKey: 'nav.query', icon: FiTerminal },
      { to: '/dashboards', labelKey: 'nav.dashboards', icon: FiLayout },
    ],
  },
  {
    labelKey: 'nav.group.operate',
    items: [
      { to: '/live', labelKey: 'nav.live', icon: FiRadio },
      { to: '/serverless', labelKey: 'nav.serverless', icon: FiZap },
      { to: '/collaborate', labelKey: 'nav.collaborate', icon: FiBookOpen },
      { to: '/system', labelKey: 'nav.system', icon: FiHardDrive },
    ],
  },
  {
    labelKey: 'nav.group.admin',
    items: [
      { to: '/users', labelKey: 'nav.users', icon: FiUsers, adminOnly: true },
      { to: '/settings/account', labelKey: 'nav.account', icon: FiUser },
      { to: '/api-keys', labelKey: 'nav.apiKeys', icon: FiKey, adminOnly: true },
      { to: '/settings/ai', labelKey: 'nav.aiSettings', icon: FiCpu, adminOnly: true },
      { to: '/settings/connectors', labelKey: 'nav.connectors', icon: FiGitBranch },
      { to: '/automation', labelKey: 'nav.automation', icon: FiCpu },
      { to: '/roadmap', labelKey: 'nav.roadmap', icon: FiMap },
      { to: '/federation', labelKey: 'nav.federation', icon: FiGlobe, adminOnly: true },
    ],
  },
]

export default function SideRail({ collapsed, onToggle }) {
  const { pathname } = useLocation()
  const { t } = useI18n()
  const role = localStorage.getItem('role') || ''
  // Empty role → auth-off / local smoke: show everything. Otherwise gate admin nav.
  const isAdmin = role === 'admin' || role === ''
  const isActive = (item) => (item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + '/') || (item.to !== '/' && pathname.startsWith(item.to)))
  return (
    <nav className={`opa-rail ${collapsed ? 'collapsed' : ''}`}>
      <div className="opa-rail-brand">
        <FiActivity />
        <span>Open Profiling</span>
      </div>
      <div className="opa-rail-nav">
        {NAV_GROUPS.map((g) => (
          <div key={g.labelKey}>
            <div className="opa-rail-group-label">{t(g.labelKey)}</div>
            {g.items.map((it) => {
              if (it.adminOnly && !isAdmin) return null
              const Icon = it.icon
              const label = t(it.labelKey)
              return (
                <Link key={it.to} to={it.to} className={`opa-rail-item ${isActive(it) ? 'active' : ''}`} title={collapsed ? label : undefined}>
                  <Icon />
                  <span className="opa-rail-item-label">{label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </div>
      <button className="opa-rail-collapse" onClick={onToggle} title={collapsed ? 'Expand' : 'Collapse'}>
        {collapsed ? <FiChevronsRight /> : <FiChevronsLeft />}
      </button>
    </nav>
  )
}
