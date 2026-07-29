import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  FiActivity, FiServer, FiCpu, FiAlertCircle, FiDatabase, FiGlobe, FiShare2,
  FiMonitor, FiTrendingUp, FiRadio, FiHardDrive, FiUsers, FiKey, FiGrid, FiTarget,
  FiBell, FiZap, FiColumns, FiFileText, FiBarChart2,
  FiChevronsLeft, FiChevronsRight,
} from 'react-icons/fi'

export const NAV_GROUPS = [
  {
    label: 'Monitor',
    items: [
      { to: '/', label: 'Overview', icon: FiGrid, exact: true },
      { to: '/services', label: 'Services', icon: FiServer },
      { to: '/key-transactions', label: 'Key Transactions', icon: FiTarget },
      { to: '/traces', label: 'Traces', icon: FiActivity },
      { to: '/profiling', label: 'Profiling', icon: FiCpu },
      { to: '/errors', label: 'Errors', icon: FiAlertCircle },
      { to: '/logs', label: 'Logs', icon: FiFileText },
    ],
  },
  {
    label: 'Reliability',
    items: [
      { to: '/alerts', label: 'Alerts', icon: FiBell },
      { to: '/slos', label: 'SLOs', icon: FiTarget },
      { to: '/anomalies', label: 'Anomalies', icon: FiZap },
      { to: '/synthetics', label: 'Synthetics', icon: FiRadio },
    ],
  },
  {
    label: 'Analyze',
    items: [
      { to: '/sql', label: 'Databases', icon: FiDatabase },
      { to: '/http', label: 'External HTTP', icon: FiGlobe },
      { to: '/service-map', label: 'Service Map', icon: FiShare2 },
      { to: '/rum', label: 'Browser (RUM)', icon: FiMonitor },
      { to: '/performance', label: 'Performance', icon: FiTrendingUp },
      { to: '/compare', label: 'Compare', icon: FiColumns },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { to: '/infrastructure', label: 'Hosts', icon: FiHardDrive },
      { to: '/metrics', label: 'Metrics Explorer', icon: FiBarChart2 },
    ],
  },
  {
    label: 'Operate',
    items: [
      { to: '/live', label: 'Live', icon: FiRadio },
      { to: '/system', label: 'System', icon: FiHardDrive },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/users', label: 'Users & Roles', icon: FiUsers },
      { to: '/api-keys', label: 'API Keys', icon: FiKey },
    ],
  },
]

export default function SideRail({ collapsed, onToggle }) {
  const { pathname } = useLocation()
  const isActive = (item) => (item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + '/') || (item.to !== '/' && pathname.startsWith(item.to)))
  return (
    <nav className={`opa-rail ${collapsed ? 'collapsed' : ''}`}>
      <div className="opa-rail-brand">
        <FiActivity />
        <span>Open Profiling</span>
      </div>
      <div className="opa-rail-nav">
        {NAV_GROUPS.map((g) => (
          <div key={g.label}>
            <div className="opa-rail-group-label">{g.label}</div>
            {g.items.map((it) => {
              const Icon = it.icon
              return (
                <Link key={it.to} to={it.to} className={`opa-rail-item ${isActive(it) ? 'active' : ''}`} title={collapsed ? it.label : undefined}>
                  <Icon />
                  <span className="opa-rail-item-label">{it.label}</span>
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
