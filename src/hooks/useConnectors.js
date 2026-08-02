import { useCallback, useState } from 'react'
import axios from 'axios'
import { useApi } from './useApi'
import { apiUrl } from '../utils/apiBase'

/**
 * Shared SCM connectors list + mutations (GitHub App / PAT).
 * Used by Connectors settings and Security Repo Watch.
 */
export function useConnectors({ skip = false } = {}) {
  const query = useApi('/api/connectors', {}, { noRange: true, skip })
  const [busy, setBusy] = useState(false)

  const connectors = query.data?.connectors || []
  const githubAppConfigured = !!query.data?.github_app_configured
  const canEditOrg = !!query.data?.can_edit_org
  const canEditAdmin = !!query.data?.can_edit_admin
  // When the API omits the flag (older builds), allow user edits for signed-in / auth-off.
  const canEditUser = query.data?.can_edit_user !== false

  const connectPAT = useCallback(async ({ token, login, repos = [], scope = 'org' }) => {
    setBusy(true)
    try {
      const repoList = Array.isArray(repos)
        ? repos
        : String(repos || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
      const { data } = await axios.post(apiUrl('/api/connectors/github/pat'), {
        token,
        login: login || 'pat-user',
        repos: repoList,
        scope,
      })
      await query.reload?.()
      return { ok: true, data }
    } catch (e) {
      return { ok: false, error: e.response?.data || e.message }
    } finally {
      setBusy(false)
    }
  }, [query])

  const openGitHubInstall = useCallback(async () => {
    try {
      const { data } = await axios.get(apiUrl('/api/connectors/github/install-url'))
      if (data.install_url) {
        window.open(data.install_url, '_blank', 'noopener')
        return { ok: true, data }
      }
      return { ok: false, warn: true, error: data.note || 'GitHub App not configured' }
    } catch (e) {
      return { ok: false, error: e.response?.data || e.message }
    }
  }, [])

  const updateConnector = useCallback(async (id, { account_login, display_name, token } = {}) => {
    if (!id) return { ok: false, error: 'Missing connector id' }
    setBusy(true)
    try {
      const body = { account_login, display_name }
      if (token && String(token).trim()) body.token = String(token).trim()
      const { data } = await axios.patch(apiUrl(`/api/connectors/${encodeURIComponent(id)}`), body)
      await query.reload?.()
      return { ok: true, data }
    } catch (e) {
      return { ok: false, error: e.response?.data || e.message }
    } finally {
      setBusy(false)
    }
  }, [query])

  const deleteConnector = useCallback(async (id) => {
    if (!id) return { ok: false, error: 'Missing connector id' }
    setBusy(true)
    try {
      await axios.delete(apiUrl(`/api/connectors/${encodeURIComponent(id)}`))
      await query.reload?.()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.response?.data || e.message }
    } finally {
      setBusy(false)
    }
  }, [query])

  return {
    connectors,
    githubAppConfigured,
    canEditOrg,
    canEditAdmin,
    canEditUser,
    data: query.data,
    loading: query.loading,
    error: query.error,
    reload: query.reload,
    busy,
    connectPAT,
    openGitHubInstall,
    updateConnector,
    deleteConnector,
  }
}

/** Prefer a connector with a live token, else the first listed. */
export function preferredConnectorId(list = []) {
  if (!list.length) return ''
  const preferred = list.find((x) => x.has_token) || list[0]
  return preferred?.id || ''
}

export function connectorLabel(c) {
  if (!c) return ''
  const name = c.display_name || c.kind || 'connector'
  const who = c.account_login || c.installation_id || (c.id ? String(c.id).slice(0, 12) : '')
  const scope = c.scope ? ` · ${c.scope}` : ''
  return `${name} · ${who}${scope}${c.has_token ? '' : ' · no token'}`
}
