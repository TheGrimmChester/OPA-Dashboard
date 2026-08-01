/**
 * Shared deep-link builders for observability entities.
 * Prefer these over ad-hoc `/traces?…` strings so every panel navigates the same way.
 */

/** Escape a value for the Trace Explorer DSL (double-quoted strings). */
export function dslQuote(v) {
  return `"${String(v).replace(/(["\\])/g, '\\$1')}"`
}

/** Join DSL clauses with AND, dropping empties. */
export function buildTracesFilter(...parts) {
  return parts.flat().filter((p) => p != null && String(p).trim() !== '').join(' AND ')
}

function withParams(path, entries) {
  const p = new URLSearchParams()
  Object.entries(entries || {}).forEach(([k, v]) => {
    if (v == null || v === '') return
    p.set(k, String(v))
  })
  const qs = p.toString()
  return qs ? `${path}?${qs}` : path
}

/** Trace Explorer list — filter DSL and/or dedicated short params. */
export function tracesHref({
  service,
  status,
  filter,
  load_run_id: loadRunId,
  session_id: sessionId,
  uri,
  host,
  scheme,
} = {}) {
  return withParams('/traces', {
    service,
    status,
    filter: filter || undefined,
    load_run_id: loadRunId,
    session_id: sessionId,
    uri,
    host,
    scheme,
  })
}

export function loadRunTracesHref(runId) {
  if (!runId) return null
  return tracesHref({ load_run_id: runId })
}

export function sessionTracesHref(sessionId) {
  if (!sessionId) return null
  return tracesHref({ session_id: sessionId })
}

export function traceHref(traceId, { span } = {}) {
  if (!traceId) return null
  const base = `/traces/${encodeURIComponent(traceId)}`
  return span ? `${base}?span=${encodeURIComponent(span)}` : base
}

export function serviceHref(service) {
  if (!service) return null
  return `/services/${encodeURIComponent(service)}`
}

export function logsHref({ service, level, q, trace_id: traceId } = {}) {
  return withParams('/logs', {
    service,
    level,
    q: q || (traceId ? `trace_id:${traceId}` : undefined),
  })
}

export function rumSessionHref(sessionId, { tab } = {}) {
  if (!sessionId) return null
  return withParams('/rum', {
    session: sessionId,
    tab: tab || 'sessions',
  })
}

export function perfRunHref(runId, { tab } = {}) {
  if (!runId) return null
  return withParams('/perf-lab', { run: runId, tab: tab || undefined })
}

export function securityRunHref(runId, { tab } = {}) {
  if (!runId) return null
  return withParams('/security', { run: runId, tab: tab || 'scans' })
}

/** OPA Review job findings + Auto-fix detail page. */
export function scmJobHref(jobId) {
  if (!jobId) return null
  return `/security/jobs/${encodeURIComponent(jobId)}`
}

export function securityJobsHref({ status, severity, repo, q } = {}) {
  return withParams('/security', { tab: 'jobs', status, severity, repo, q })
}

/** SCM connectors settings (GitHub App / PAT). */
export function connectorsHref({ edit } = {}) {
  return withParams('/settings/connectors', { edit })
}

export function traceReplayHref(traceId, mode = 'waterfall') {
  if (!traceId) return null
  const base = `/traces/${encodeURIComponent(traceId)}`
  return mode ? `${base}?replay=${encodeURIComponent(mode)}` : base
}

export function errorHref(errorId) {
  if (!errorId) return null
  return `/errors/${encodeURIComponent(errorId)}`
}

export function errorsHref({ service } = {}) {
  return withParams('/errors', { service })
}

export function sqlHref(fingerprint) {
  if (!fingerprint) return null
  return `/sql/${encodeURIComponent(fingerprint)}`
}

export function httpHref(endpoint) {
  if (!endpoint) return null
  return `/http/${encodeURIComponent(endpoint)}`
}

export function syntheticsHref(checkId) {
  if (!checkId) return null
  return withParams('/synthetics', { check: checkId })
}

export function compareTracesHref(trace1, trace2) {
  return withParams('/compare', { trace1, trace2 })
}

/** Short mono display for long IDs; empty → null. */
export function truncateId(id, n = 12) {
  if (id == null || id === '') return null
  const s = String(id)
  return s.length <= n ? s : `${s.slice(0, n)}…`
}

/**
 * Map a high-value tag/attribute to a dashboard route.
 * Returns null when the key is not linkable or the value is empty.
 */
export function tagLink(key, value) {
  if (value == null || value === '') return null
  const k = String(key || '').toLowerCase().replace(/^tags\./, '')
  const v = typeof value === 'object' ? null : String(value)
  if (!v) return null

  switch (k) {
    case 'load_run_id':
    case 'opa.load_run_id':
      return {
        to: loadRunTracesHref(v),
        label: `load_run ${truncateId(v, 14)}`,
        title: `Traces for load run ${v}`,
        kind: 'load_run',
      }
    case 'security_run_id':
    case 'opa.security_run_id':
      return {
        to: securityRunHref(v),
        label: `security_run ${truncateId(v, 14)}`,
        title: `Security scan run ${v}`,
        kind: 'security_run',
      }
    case 'session_id':
    case 'rum.session_id':
    case 'opa.session_id':
      return {
        to: rumSessionHref(v),
        label: `session ${truncateId(v, 12)}`,
        title: `RUM session ${v}`,
        kind: 'session',
        secondary: sessionTracesHref(v),
      }
    case 'check_id':
    case 'synthetic.check_id':
      return {
        to: syntheticsHref(v),
        label: `check ${truncateId(v, 12)}`,
        title: `Synthetic check ${v}`,
        kind: 'check',
        secondary: tracesHref({ filter: `tags.check_id:${dslQuote(v)}` }),
      }
    case 'trace_id':
      return { to: traceHref(v), label: truncateId(v, 16), title: `Open trace ${v}`, kind: 'trace' }
    case 'span_id':
      return null // span only meaningful inside a trace context
    case 'service':
      return { to: serviceHref(v), label: v, title: `Service ${v}`, kind: 'service' }
    case 'http.url':
    case 'url':
      return {
        to: tracesHref({ filter: `http.url:${dslQuote(v)}` }),
        label: truncateId(v, 40),
        title: `Traces calling ${v}`,
        kind: 'http',
      }
    case 'url_path':
    case 'uri':
      return {
        to: tracesHref({ filter: `url_path:${dslQuote(v)}` }),
        label: v,
        title: `Traces hitting ${v}`,
        kind: 'path',
      }
    case 'name':
    case 'resource':
      return {
        to: tracesHref({ filter: `name:${dslQuote(v)}` }),
        label: v,
        title: `Traces named ${v}`,
        kind: 'resource',
      }
    case 'error_id':
    case 'error.fingerprint':
    case 'error_fingerprint':
      return { to: errorHref(v), label: truncateId(v, 16), title: `Error ${v}`, kind: 'error' }
    case 'query_fingerprint':
    case 'sql.fingerprint':
      return { to: sqlHref(v), label: truncateId(v, 24), title: `SQL ${v}`, kind: 'sql' }
    default:
      return null
  }
}

/** Flatten nested tag objects into dotted keys (one level of nesting). */
function flattenTags(tags, prefix = '') {
  const out = []
  if (!tags || typeof tags !== 'object') return out
  Object.entries(tags).forEach(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      // Prefer leaf scalars; also keep known nested correlation keys.
      Object.entries(v).forEach(([sk, sv]) => {
        if (sv != null && typeof sv !== 'object') out.push([`${key}.${sk}`, sv])
      })
    } else if (v != null && typeof v !== 'object') {
      out.push([key, v])
    }
  })
  return out
}

const CORRELATION_KEYS = [
  'load_run_id', 'opa.load_run_id',
  'session_id', 'rum.session_id', 'opa.session_id',
  'check_id', 'synthetic.check_id',
  'error_id', 'error.fingerprint', 'error_fingerprint',
]

/**
 * Collect high-value correlation IDs from one or more span.tag maps.
 * Returns unique { key, value, link } entries suitable for EntityChip rows.
 */
export function collectCorrelationTags(spansOrTags) {
  const items = Array.isArray(spansOrTags) ? spansOrTags : [spansOrTags]
  const seen = new Set()
  const out = []
  for (const item of items) {
    const tags = item?.tags || item
    for (const [key, value] of flattenTags(tags)) {
      const lk = String(key).toLowerCase()
      if (!CORRELATION_KEYS.some((c) => lk === c || lk.endsWith(`.${c}`))) continue
      const link = tagLink(lk, value)
      if (!link?.to) continue
      const id = `${link.kind}:${value}`
      if (seen.has(id)) continue
      seen.add(id)
      out.push({ key: lk, value: String(value), ...link })
    }
  }
  return out
}

/**
 * Known attribute keys on a span drawer that should become chips
 * (beyond the dedicated name/service/url_path rows).
 */
export function spanAttributeLinks(span) {
  if (!span) return []
  const out = []
  const push = (key, value) => {
    const link = tagLink(key, value)
    if (link?.to) out.push({ key, value: String(value), ...link })
  }
  push('service', span.service)
  push('name', span.name)
  push('url_path', span.url_path || span.uri)
  if (span.status && String(span.status).toLowerCase() === 'error') {
    out.push({
      key: 'status',
      value: 'error',
      to: tracesHref({ service: span.service, status: 'error' }),
      label: 'error traces',
      title: 'Error traces for this service',
      kind: 'status',
    })
  }
  out.push(...collectCorrelationTags(span.tags))
  // Deduplicate by to+label
  const seen = new Set()
  return out.filter((x) => {
    const id = `${x.to}|${x.label}`
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}
