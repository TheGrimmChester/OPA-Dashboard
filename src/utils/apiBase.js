/**
 * Resolve API base URL by path prefix.
 * - /api/perf/* → VITE_PERF_LAB_URL (fallback Agent URL)
 * - /api/scm/*, /api/connectors/*, /api/ai/*, /api/agents/*, /api/security/runs*, /api/security/profiles, /v1/scm/*
 *   → VITE_ORCHESTRATOR_URL (fallback Agent URL)
 * - everything else (incl. /api/security/secrets|sast|iac|policies) → VITE_API_URL
 *
 * Empty env values mean same-origin (nginx path proxy in smoke).
 * Absolute localhost defaults apply only when the env var is unset (local Vite).
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
