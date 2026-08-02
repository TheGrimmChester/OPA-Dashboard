/**
 * Resolve API base URL by path prefix.
 * - /api/perf/* → VITE_PERF_LAB_URL (local default :8092)
 * - /api/scm/*, /api/connectors/*, /api/ai/*, /api/agents/*, /api/security/runs*,
 *   /api/security/profiles, /v1/scm/* → VITE_ORCHESTRATOR_URL (local default :8091)
 * - everything else (incl. /api/security/secrets|sast|iac|policies) → VITE_API_URL
 *
 * Empty env values mean same-origin (dashboard nginx path-proxies to Orchestrator /
 * Perf Lab). Never fall back Orchestrator or Perf Lab bases to the Agent URL —
 * Agent returns 410 Gone for extracted SCM / security-runs / perf routes.
 */
const AGENT_URL = import.meta.env.VITE_API_URL ?? ''

function resolveServiceUrl(explicit, fallbackDefault) {
  // Explicitly set (including '') → use as-is. Unset → service default (not Agent).
  if (explicit !== undefined) return explicit
  return fallbackDefault
}

// Production images use same-origin nginx path proxy (empty base). Local Vite
// defaults to the service ports. Never fall back to the Agent URL — Agent
// returns 410 Gone for extracted SCM / security-runs / perf routes.
const ORCH_DEFAULT = import.meta.env.PROD ? '' : 'http://localhost:8091'
const PERF_DEFAULT = import.meta.env.PROD ? '' : 'http://localhost:8092'
const ORCH_URL = resolveServiceUrl(import.meta.env.VITE_ORCHESTRATOR_URL, ORCH_DEFAULT)
const PERF_URL = resolveServiceUrl(import.meta.env.VITE_PERF_LAB_URL, PERF_DEFAULT)

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
    p === '/api/ai' ||
    p.startsWith('/api/ai/') ||
    p.startsWith('/api/ai?') ||
    p === '/api/agents' ||
    p.startsWith('/api/agents/') ||
    p.startsWith('/api/agents?') ||
    p === '/api/security/profiles' ||
    p.startsWith('/api/security/profiles?') ||
    p.startsWith('/api/security/runs') ||
    p.startsWith('/v1/scm')
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
