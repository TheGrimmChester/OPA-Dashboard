/**
 * Security page IA: four pillars with legacy tab= deep-link compatibility.
 *
 * Primary: findings | scans | ops | control
 * Findings type=: all | cve | iast | secrets | sast | iac
 * Ops mode=: watch | run | contexts | jobs | webhooks
 * Control section=: agents | policies | gate | inventory
 */

export const SECURITY_PILLARS = ['findings', 'scans', 'ops', 'control']

export const FINDINGS_TYPES = ['all', 'cve', 'iast', 'secrets', 'sast', 'iac']

export const OPS_MODES = ['watch', 'run', 'contexts', 'jobs', 'webhooks']

export const CONTROL_SECTIONS = ['agents', 'policies', 'gate', 'inventory']

/** Tabs where `run=` deep-links filter findings / show run detail. */
export const RUN_CONTEXT_TABS = new Set(['scans', 'findings', 'secrets', 'sast', 'iac'])

const LEGACY_TO_NAV = {
  vulns: { tab: 'findings', type: 'cve' },
  vulnerabilities: { tab: 'findings', type: 'cve' },
  iast: { tab: 'findings', type: 'iast' },
  secrets: { tab: 'findings', type: 'secrets' },
  sast: { tab: 'findings', type: 'sast' },
  iac: { tab: 'findings', type: 'iac' },
  findings: { tab: 'findings' },
  scans: { tab: 'scans' },
  watch: { tab: 'ops', mode: 'watch' },
  jobs: { tab: 'ops', mode: 'jobs' },
  webhooks: { tab: 'ops', mode: 'webhooks' },
  agents: { tab: 'control', section: 'agents' },
  policies: { tab: 'control', section: 'policies' },
  pr: { tab: 'control', section: 'gate' },
  gate: { tab: 'control', section: 'gate' },
  inventory: { tab: 'control', section: 'inventory' },
  ops: { tab: 'ops' },
  control: { tab: 'control' },
}

export function resolveSecurityNav(params) {
  const raw = String(params.get('tab') || '').toLowerCase()
  const mapped = LEGACY_TO_NAV[raw]

  let tab = mapped?.tab || (SECURITY_PILLARS.includes(raw) ? raw : '')
  if (!tab) {
    // Bare `?run=` opens Scans; never invent a tab that steals Repo Watch.
    tab = params.get('run') ? 'scans' : 'findings'
  }

  let type = String(params.get('type') || mapped?.type || 'all').toLowerCase()
  if (!FINDINGS_TYPES.includes(type)) type = 'all'

  let mode = String(params.get('mode') || mapped?.mode || 'watch').toLowerCase()
  // Legacy watchMode aliases
  if (mode === 'repos') mode = 'watch'
  if (!OPS_MODES.includes(mode)) mode = 'watch'
  // Legacy tab=jobs without mode
  if (raw === 'jobs') mode = 'jobs'
  if (raw === 'webhooks') mode = 'webhooks'
  if (raw === 'watch') mode = 'watch'

  let section = String(params.get('section') || mapped?.section || 'agents').toLowerCase()
  if (section === 'pr') section = 'gate'
  if (!CONTROL_SECTIONS.includes(section)) section = 'agents'

  return { tab, type, mode, section }
}

export function resolveSecurityRunId(params, tab) {
  const runQ = params.get('run') || ''
  if (!runQ) return ''
  if (!RUN_CONTEXT_TABS.has(tab)) return ''
  return runQ
}

/** Normalize URL after reading legacy deep links. */
export function normalizeSecuritySearchParams(params) {
  const nav = resolveSecurityNav(params)
  const p = new URLSearchParams(params)
  p.set('tab', nav.tab)

  if (nav.tab === 'findings') {
    if (nav.type && nav.type !== 'all') p.set('type', nav.type)
    else p.delete('type')
    p.delete('mode')
    p.delete('section')
  } else if (nav.tab === 'ops') {
    p.set('mode', nav.mode)
    p.delete('type')
    p.delete('section')
  } else if (nav.tab === 'control') {
    p.set('section', nav.section)
    p.delete('type')
    p.delete('mode')
  } else {
    p.delete('type')
    p.delete('mode')
    p.delete('section')
  }

  // Drop run= when not in a run-context tab
  if (!RUN_CONTEXT_TABS.has(nav.tab)) p.delete('run')

  // Job filters only on ops/jobs
  if (!(nav.tab === 'ops' && nav.mode === 'jobs')) {
    for (const k of ['status', 'severity', 'repo', 'q']) p.delete(k)
  }

  // Connector only relevant for ops watch/run/contexts/jobs
  if (nav.tab !== 'ops') p.delete('connector')

  return { nav, params: p }
}
