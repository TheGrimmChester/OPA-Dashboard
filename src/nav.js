import {
  FiGrid, FiServer, FiBookOpen, FiTarget, FiTerminal, FiActivity, FiCpu,
  FiAlertCircle, FiFileText, FiBell, FiCrosshair, FiZap, FiRadio, FiTool,
  FiDatabase, FiExternalLink, FiShare2, FiGlobe, FiMonitor, FiTrendingUp,
  FiColumns, FiHardDrive, FiCloud, FiBox, FiBarChart2, FiSearch, FiLayout,
  FiRss, FiUserPlus, FiLayers, FiRepeat, FiUsers, FiKey, FiUser,
} from 'react-icons/fi'

/**
 * The product's information architecture, in one place.
 *
 * The sidebar, the command palette and the breadcrumb trail all read from here,
 * so a route can never appear in one and not the others. Previously the rail
 * owned the list and the palette imported it, which meant the palette silently
 * inherited whatever the rail happened to expose.
 *
 * Shape: one pinned Overview above the groups, then six labelled collapsible
 * sections, with Administration always last.
 *
 * One glyph means one destination. The collapsed rail is icon-only, so a shared
 * glyph makes two destinations indistinguishable — nine glyphs used to do double
 * duty here. `navGlyphCollisions()` below is asserted by the test suite.
 */

export const OVERVIEW_ITEM = {
  to: '/overview',
  labelKey: 'nav.overview',
  icon: FiGrid,
  exact: true,
}

export const NAV_SECTIONS = [
  {
    id: 'monitor',
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
    id: 'reliability',
    labelKey: 'nav.group.reliability',
    items: [
      { to: '/alerts', labelKey: 'nav.alerts', icon: FiBell },
      // Was FiTarget, shared with Key transactions.
      { to: '/slos', labelKey: 'nav.slos', icon: FiCrosshair },
      { to: '/anomalies', labelKey: 'nav.anomalies', icon: FiZap },
      { to: '/synthetics', labelKey: 'nav.synthetics', icon: FiRadio },
      // Was FiActivity, shared with Traces and the brand mark.
      { to: '/diagnostics', labelKey: 'nav.diagnostics', icon: FiTool },
    ],
  },
  {
    id: 'analyze',
    labelKey: 'nav.group.analyze',
    items: [
      { to: '/databases', labelKey: 'nav.databases', icon: FiDatabase },
      // Was FiGlobe, which Network now uses.
      { to: '/http', labelKey: 'nav.http', icon: FiExternalLink },
      { to: '/service-map', labelKey: 'nav.serviceMap', icon: FiShare2 },
      // Was FiShare2, shared with Service map.
      { to: '/network', labelKey: 'nav.network', icon: FiGlobe },
      { to: '/rum', labelKey: 'nav.rum', icon: FiMonitor },
      { to: '/performance', labelKey: 'nav.performance', icon: FiTrendingUp },
      { to: '/compare', labelKey: 'nav.compare', icon: FiColumns },
    ],
  },
  {
    id: 'infrastructure',
    labelKey: 'nav.group.infra',
    items: [
      { to: '/hosts', labelKey: 'nav.hosts', icon: FiHardDrive },
      { to: '/cloud', labelKey: 'nav.cloud', icon: FiCloud },
      // Was FiZap, shared with Anomalies.
      { to: '/serverless', labelKey: 'nav.serverless', icon: FiBox },
      { to: '/metrics', labelKey: 'nav.metrics', icon: FiBarChart2 },
      // Was FiTerminal, shared with Commands.
      { to: '/query', labelKey: 'nav.query', icon: FiSearch },
      { to: '/dashboards', labelKey: 'nav.dashboards', icon: FiLayout },
    ],
  },
  {
    id: 'operate',
    labelKey: 'nav.group.operate',
    items: [
      // Was FiRadio, shared with Synthetic monitoring.
      { to: '/live', labelKey: 'nav.live', icon: FiRss },
      // Was FiUsers, shared with Users and roles.
      { to: '/collaborate', labelKey: 'nav.collaborate', icon: FiUserPlus },
      // Was FiHardDrive, shared with Hosts.
      { to: '/system', labelKey: 'nav.system', icon: FiLayers },
      // Was FiCpu, shared with Profiling.
      { to: '/automation', labelKey: 'nav.automation', icon: FiRepeat },
    ],
  },
  {
    id: 'administration',
    labelKey: 'nav.group.admin',
    items: [
      { to: '/users', labelKey: 'nav.users', icon: FiUsers, adminOnly: true },
      { to: '/api-keys', labelKey: 'nav.apiKeys', icon: FiKey, adminOnly: true },
      { to: '/settings/account', labelKey: 'nav.account', icon: FiUser },
    ],
  },
]

/** Every navigable item, Overview first. */
export function navItems() {
  return [OVERVIEW_ITEM, ...NAV_SECTIONS.flatMap((section) => section.items)]
}

/**
 * Glyphs used by more than one destination. The collapsed rail shows icons only,
 * so this must be empty or the rail is ambiguous.
 */
export function navGlyphCollisions() {
  const seen = new Map()
  for (const item of navItems()) {
    const name = item.icon?.name || String(item.icon)
    if (!seen.has(name)) seen.set(name, [])
    seen.get(name).push(item.to)
  }
  return [...seen.entries()].filter(([, routes]) => routes.length > 1)
}
