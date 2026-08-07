/**
 * Persist project scope as `'all' | string[]` plus a compat `project_id` string.
 * UI All expands to enabled directory ids via `@open-family/ui` helpers — never
 * redefine auth's `X-Project-ID: all`.
 */

export const ALL = 'all'

export function readProjectSelection(selectionKey, projectKey) {
  try {
    const raw = localStorage.getItem(selectionKey)
    if (raw != null && raw !== '') {
      const parsed = JSON.parse(raw)
      if (parsed === ALL) return ALL
      if (Array.isArray(parsed)) {
        const ids = parsed.map(String).filter(Boolean)
        return ids.length ? ids : ALL
      }
    }
  } catch {
    /* fall through to legacy project_id */
  }
  const legacy = localStorage.getItem(projectKey)
  if (!legacy || legacy === ALL) return ALL
  // Legacy multi was sometimes comma-joined; treat as multi-select.
  if (legacy.includes(',')) {
    const ids = legacy.split(',').map((s) => s.trim()).filter(Boolean)
    return ids.length ? ids : ALL
  }
  return [legacy]
}

export function persistProjectSelection(selectionKey, projectKey, selection) {
  const next = selection === ALL || !selection?.length ? ALL : [...selection]
  localStorage.setItem(selectionKey, JSON.stringify(next))
  if (next === ALL) {
    localStorage.setItem(projectKey, ALL)
  } else if (next.length === 1) {
    localStorage.setItem(projectKey, next[0])
  } else {
    // Compat readers that expect a single id see "all"; JSON holds the real set.
    localStorage.setItem(projectKey, ALL)
  }
  return next
}

/** Compat single-id view: concrete id when exactly one is selected, else `all`. */
export function projectIdFromSelection(selection) {
  if (selection === ALL || !selection?.length) return ALL
  if (selection.length === 1) return selection[0]
  return ALL
}


/** Stable React dep key — distinguishes All, single, and every multi set. */
export function tenantScopeKey(organizationId, selection) {
  const org = organizationId == null || organizationId === '' ? '' : String(organizationId)
  if (selection === ALL || !selection?.length) return `${org}|all`
  const ids = [...selection].map(String).filter(Boolean).sort()
  return `${org}|${ids.join(',')}`
}

export function isConcreteProjectSelection(selection) {
  return selection !== ALL && Array.isArray(selection) && selection.length === 1
}

/** Directory fetches must not be filtered by the switcher's own selection. */
export function isProjectDirectoryRequest(url = '') {
  const path = String(url).replace(/^https?:\/\/[^/?#]+/i, '').split('?')[0]
  return (
    path.endsWith('/api/projects')
    || path.endsWith('/api/organizations')
    || path.endsWith('/api/oam/projects')
    || path.endsWith('/api/oam/organizations')
    || path.endsWith('/api/hub/organizations')
  )
}

export function isMutatingMethod(method) {
  const m = String(method || 'get').toLowerCase()
  return m !== 'get' && m !== 'head' && m !== 'options'
}
