/** Agent kind display labels (product wording — not internal phase names). */
export const AGENT_KIND_LABELS = {
  run: 'PR Run',
  prepare: 'Prepare',
  security: 'Security',
  bugbot: 'Bugbot',
  approval: 'Approval',
  cloud: 'Cloud',
  checkup: 'Checkup',
}

/** Pipeline order for stage timelines (Checkup optional between Bugbot and Approval). */
export const AGENT_KIND_ORDER = [
  'prepare',
  'security',
  'bugbot',
  'checkup',
  'approval',
  'cloud',
]

export function agentKindLabel(kind) {
  const k = String(kind || '').toLowerCase()
  if (!k) return ''
  return AGENT_KIND_LABELS[k] || k
}

/** Sort run children into pipeline order; unknown kinds append at end. */
export function sortRunChildren(children = []) {
  const list = Array.isArray(children) ? [...children] : []
  const rank = (k) => {
    const i = AGENT_KIND_ORDER.indexOf(String(k || '').toLowerCase())
    return i < 0 ? 1000 : i
  }
  list.sort((a, b) => {
    const d = rank(a?.kind) - rank(b?.kind)
    if (d !== 0) return d
    return String(a?.id || '').localeCompare(String(b?.id || ''))
  })
  return list
}

/** Build TriState Inherit option text from effective prefs + provenance sources. */
export function inheritOptionLabel(field, effective = {}, sources = {}) {
  const src = String(sources[field] || 'builtin').toLowerCase()
  const srcLabel = ({
    builtin: 'Built-in',
    org: 'Org',
    installation: 'Installation',
    repo: 'Repo',
    policy_file: 'Policy file',
  })[src] || src.replace(/_/g, ' ')
  const raw = effective?.[field]
  let shown = ''
  if (typeof raw === 'boolean') shown = raw ? 'On' : 'Off'
  else if (raw == null || raw === '') shown = 'unset'
  else shown = String(raw)
  return `Use ${srcLabel} Default (${shown})`
}

/**
 * Run-centric PR Jobs view: keep legacy rows (no kind/run_id) unchanged;
 * show kind=run parents with children attached; hide children when parent is present.
 */
export function groupScmJobsForDisplay(jobs = []) {
  const list = Array.isArray(jobs) ? jobs : []
  const byId = new Map()
  for (const j of list) {
    if (j?.id) byId.set(String(j.id), j)
  }

  const childrenByRun = new Map()
  for (const j of list) {
    const kind = String(j?.kind || '').toLowerCase()
    if (!kind || kind === 'run') continue
    const runId = String(j.run_id || j.parent_id || '').trim()
    if (!runId) continue
    if (!childrenByRun.has(runId)) childrenByRun.set(runId, [])
    childrenByRun.get(runId).push(j)
  }

  const hidden = new Set()
  for (const j of list) {
    const kind = String(j?.kind || '').toLowerCase()
    if (!kind || kind === 'run') continue
    const parentId = String(j.parent_id || j.run_id || '').trim()
    if (parentId && byId.has(parentId)) hidden.add(String(j.id))
  }

  const out = []
  for (const j of list) {
    if (hidden.has(String(j.id))) continue
    const kind = String(j?.kind || '').toLowerCase()
    const runId = String(j?.run_id || '').trim()
    if (kind === 'run' || (kind && runId)) {
      const kids = childrenByRun.get(String(j.id)) || childrenByRun.get(runId) || []
      const childStatus = {}
      for (const c of kids) {
        if (c?.kind) childStatus[c.kind] = c.status
      }
      out.push({
        ...j,
        _runChildren: kids,
        _childStatus: Object.keys(childStatus).length
          ? childStatus
          : (j.summary?.child_status || j.child_status || {}),
        status: foldRunStatus(kids, j.status),
      })
    } else {
      out.push(j)
    }
  }
  return out
}

export function foldRunStatus(children = [], parentStatus = '') {
  if (!children.length) return parentStatus
  let anyRunning = false
  let anyFailed = false
  let anyQueued = false
  let allTerminal = true
  for (const c of children) {
    switch (String(c?.status || '').toLowerCase()) {
      case 'running':
      case 'waiting':
        anyRunning = true
        allTerminal = false
        break
      case 'queued':
      case '':
        anyQueued = true
        allTerminal = false
        break
      case 'failed':
      case 'error':
        anyFailed = true
        break
      case 'cancelled':
      case 'completed':
      case 'skipped':
        break
      default:
        allTerminal = false
    }
  }
  if (anyRunning) return 'running'
  if (anyQueued) return 'queued'
  if (!allTerminal) return parentStatus
  if (anyFailed) return 'completed_with_errors'
  if (String(parentStatus).toLowerCase() === 'cancelled') return 'cancelled'
  return 'completed'
}

export function jobHasRunMeta(job) {
  return !!(job?.kind || job?.run_id || job?.summary?.kind || job?.summary?.run_id)
}
