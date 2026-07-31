/**
 * Resolve API base URL by path prefix.
 * - /api/perf → VITE_PERF_LAB_URL (default http://localhost:8092, else VITE_API_URL)
 * - /api/scm, /api/connectors, /api/security, /v1/scm, /v1/security
 *   → VITE_ORCHESTRATOR_URL (default http://localhost:8091, else VITE_API_URL)
 * - everything else → VITE_API_URL
 *
 * Empty VITE_* build args mean same-origin (nginx path proxy in smoke).
 * Absolute defaults apply only when the env var is unset (local Vite).
 */
const AGENT_URL = import.meta.env.VITE_API_URL ?? ''

function resolveServiceUrl(explicit, fallbackDefault) {
  // Explicitly set (including '') → use as-is. Unset → Agent URL or localhost default.
  if (explicit !== undefined) return explicit
  return AGENT_URL || fallbackDefault
}

const ORCH_URL = resolveServiceUrl(import.meta.env.VITE_ORCHESTRATOR_URL, 'http://localhost:8091')
const PERF_URL = resolveServiceUrl(import.meta.env.VITE_PERF_LAB_URL, 'http://localhost:8092')

export function apiBaseForPath(path = '') {
  const p = String(path || '')
  if (p === '/api/perf' || p.startsWith('/api/perf/') || p.startsWith('/api/perf?')) {
    return PERF_URL
  }
  if (
    p === '/api/scm' ||
    p.startsWith('/api/scm/') ||
    p.startsWith('/api/scm?') ||
    p.startsWith('/api/connectors') ||
    p === '/api/security' ||
    p.startsWith('/api/security/') ||
    p.startsWith('/api/security?') ||
    p.startsWith('/v1/scm') ||
    p.startsWith('/v1/security')
  ) {
    return ORCH_URL
  }
  return AGENT_URL
}

export function apiUrl(path = '') {
  const base = apiBaseForPath(path)
  if (!path) return base
  return `${base}${path}`
}

export const API_URLS = { AGENT_URL, ORCH_URL, PERF_URL }
