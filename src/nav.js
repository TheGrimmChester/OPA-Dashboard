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
 *
 * `timeRange: true` marks a destination whose data the header time range actually
 * filters. It is a capability, not decoration: the top bar renders the range
 * switch only where the flag is set, because a control that changes nothing reads
 * as broken. The flag follows `hooks/useApi.js`, which merges `from`/`to`/
 * `interval` into every request that does not opt out with `noRange`, and it was
 * set from the server handlers that actually window on those parameters — not
 * from the page's subject matter. Settings, catalogue and CRUD screens pass
 * `noRange` on every request, so they carry no flag.
 */

export const OVERVIEW_ITEM = {
  to: '/overview',
  labelKey: 'nav.overview',
  icon: FiGrid,
  exact: true,
  // /api/services and /api/metrics/performance are both windowed (Hub
  // internal/query/services.go, internal/query/metrics.go).
  timeRange: true,
}

export const NAV_SECTIONS = [
  {
    id: 'monitor',
    labelKey: 'nav.group.monitor',
    items: [
      { to: '/services', labelKey: 'nav.services', icon: FiServer, timeRange: true },
      { to: '/catalog', labelKey: 'nav.catalog', icon: FiBookOpen },
      { to: '/key-transactions', labelKey: 'nav.keyTransactions', icon: FiTarget },
      { to: '/commands', labelKey: 'nav.commands', icon: FiTerminal, timeRange: true },
      { to: '/traces', labelKey: 'nav.traces', icon: FiActivity, timeRange: true },
      { to: '/profiling', labelKey: 'nav.profiling', icon: FiCpu, timeRange: true },
      { to: '/errors', labelKey: 'nav.errors', icon: FiAlertCircle, timeRange: true },
      { to: '/logs', labelKey: 'nav.logs', icon: FiFileText, timeRange: true },
    ],
  },
  {
    id: 'reliability',
    labelKey: 'nav.group.reliability',
    items: [
      { to: '/alerts', labelKey: 'nav.alerts', icon: FiBell },
      // Was FiTarget, shared with Key transactions.
      { to: '/slos', labelKey: 'nav.slos', icon: FiCrosshair },
      { to: '/anomalies', labelKey: 'nav.anomalies', icon: FiZap, timeRange: true },
      { to: '/synthetics', labelKey: 'nav.synthetics', icon: FiRadio, timeRange: true },
      // Was FiActivity, shared with Traces and the brand mark.
      { to: '/diagnostics', labelKey: 'nav.diagnostics', icon: FiTool },
    ],
  },
  {
    id: 'analyze',
    labelKey: 'nav.group.analyze',
    items: [
      { to: '/databases', labelKey: 'nav.databases', icon: FiDatabase, timeRange: true },
      // Was FiGlobe, which Network now uses.
      { to: '/http', labelKey: 'nav.http', icon: FiExternalLink, timeRange: true },
      { to: '/service-map', labelKey: 'nav.serviceMap', icon: FiShare2, timeRange: true },
      // Was FiShare2, shared with Service map.
      { to: '/network', labelKey: 'nav.network', icon: FiGlobe },
      { to: '/rum', labelKey: 'nav.rum', icon: FiMonitor, timeRange: true },
      { to: '/performance', labelKey: 'nav.performance', icon: FiTrendingUp, timeRange: true },
      // Cohort compare is windowed, and the call-graph panel splits `from`/`to`
      // into its own A/B windows (components/CallgraphWindowCompare.jsx).
      { to: '/compare', labelKey: 'nav.compare', icon: FiColumns, timeRange: true },
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
      { to: '/metrics', labelKey: 'nav.metrics', icon: FiBarChart2, timeRange: true },
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
      // /api/stats is windowed (Hub internal/query/ops_reads.go); /api/health is
      // not, but one windowed request on the page is enough to earn the control.
      { to: '/system', labelKey: 'nav.system', icon: FiLayers, timeRange: true },
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
 * Detail routes that disagree with their parent about the time range.
 *
 * A detail route is not a rail destination, so it cannot carry its own flag in
 * the list above. By default a child inherits the parent's capability — which is
 * right for `/services/:name`, `/databases/:fingerprint` and `/http/:endpoint`,
 * whose panels are windowed exactly like their index. The entries here are the
 * ones where it is wrong: a single trace and a single error are absolute records,
 * fetched with `noRange` (pages/TraceDetail.jsx, pages/ErrorDetail.jsx), so a
 * range switch above them would filter nothing.
 */
const DETAIL_TIME_RANGE = {
  '/traces': false,
  '/errors': false,
}

/**
 * Does the header time range change what this route shows?
 *
 * Exact rail matches answer from their own flag; anything deeper inherits its
 * parent unless `DETAIL_TIME_RANGE` overrides it. Unknown paths answer `false`,
 * so a new route has to opt in deliberately rather than inherit a control by
 * accident.
 */
export function routeHasTimeRange(pathname) {
  const path = String(pathname || '').replace(/\/+$/, '') || '/'
  const exact = navItems().find((item) => item.to === path)
  if (exact) return !!exact.timeRange
  const parent = navItems().find((item) => path.startsWith(`${item.to}/`))
  if (!parent) return false
  if (parent.to in DETAIL_TIME_RANGE) return DETAIL_TIME_RANGE[parent.to]
  return !!parent.timeRange
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
