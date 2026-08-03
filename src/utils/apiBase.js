/**
 * Resolve API base URL for hub-only dashboard traffic.
 * All `/api/*` calls use `VITE_API_URL` (OPA-Hub). Empty means same-origin
 * (dashboard nginx proxies to the hub).
 */
const HUB_URL = import.meta.env.VITE_API_URL ?? ''

export function apiBaseForPath(_path = '') {
  return HUB_URL
}

export function apiUrl(path = '') {
  const base = apiBaseForPath(path)
  if (!path) return base
  return `${base}${path}`
}

export const API_URLS = { HUB_URL, AGENT_URL: HUB_URL }
