import React, { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { FiCpu, FiCheck, FiKey, FiRefreshCw, FiZap } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { Panel, StatusPill } from '../components/ui'
import { apiUrl } from '../utils/apiBase'

const emptyForm = () => ({
  default_provider: 'auto',
  openai: { enabled: false, base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini', api_key: '', clear_key: false },
  anthropic: { enabled: false, base_url: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514', api_key: '', clear_key: false },
  cli_cursor: { enabled: true, model: 'auto', bin: 'agent', force: false, api_key: '', clear_key: false },
})

export default function AISettings() {
  const [settings, setSettings] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(null)
  const [testResult, setTestResult] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await axios.get(apiUrl('/api/ai/settings'))
      setSettings(data)
      setForm({
        default_provider: data.default_provider || 'auto',
        openai: {
          enabled: !!data.openai?.enabled,
          base_url: data.openai?.base_url || 'https://api.openai.com/v1',
          model: data.openai?.model || 'gpt-4o-mini',
          api_key: '',
          clear_key: false,
        },
        anthropic: {
          enabled: !!data.anthropic?.enabled,
          base_url: data.anthropic?.base_url || 'https://api.anthropic.com',
          model: data.anthropic?.model || 'claude-sonnet-4-20250514',
          api_key: '',
          clear_key: false,
        },
        cli_cursor: {
          enabled: data.cli_cursor?.enabled !== false,
          model: data.cli_cursor?.model || 'auto',
          bin: data.cli_cursor?.bin || 'agent',
          force: !!data.cli_cursor?.force,
          api_key: '',
          clear_key: false,
        },
      })
    } catch (e) {
      setFlash({ tone: 'error', msg: e.response?.data || e.message || 'Failed to load AI settings' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    setBusy(true)
    setFlash(null)
    try {
      const body = {
        default_provider: form.default_provider,
        openai: {
          enabled: form.openai.enabled,
          base_url: form.openai.base_url,
          model: form.openai.model,
          ...(form.openai.clear_key ? { clear_key: true } : form.openai.api_key ? { api_key: form.openai.api_key } : {}),
        },
        anthropic: {
          enabled: form.anthropic.enabled,
          base_url: form.anthropic.base_url,
          model: form.anthropic.model,
          ...(form.anthropic.clear_key ? { clear_key: true } : form.anthropic.api_key ? { api_key: form.anthropic.api_key } : {}),
        },
        cli_cursor: {
          enabled: form.cli_cursor.enabled,
          model: form.cli_cursor.model,
          bin: form.cli_cursor.bin,
          force: form.cli_cursor.force,
          ...(form.cli_cursor.clear_key ? { clear_key: true } : form.cli_cursor.api_key ? { api_key: form.cli_cursor.api_key } : {}),
        },
      }
      const { data } = await axios.put(apiUrl('/api/ai/settings'), body)
      setSettings(data.settings || data)
      setForm((f) => ({
        ...f,
        openai: { ...f.openai, api_key: '', clear_key: false },
        anthropic: { ...f.anthropic, api_key: '', clear_key: false },
        cli_cursor: { ...f.cli_cursor, api_key: '', clear_key: false },
      }))
      setFlash({ tone: 'ok', msg: 'AI settings saved' })
      await load()
    } catch (e) {
      setFlash({ tone: 'error', msg: e.response?.data || e.message || 'Save failed' })
    } finally {
      setBusy(false)
    }
  }

  const testProvider = async (provider) => {
    setBusy(true)
    setTestResult(null)
    try {
      const { data } = await axios.post(apiUrl('/api/ai/settings/test'), { provider })
      setTestResult(data)
      setFlash({ tone: data.ok ? 'ok' : 'error', msg: data.ok ? `Test OK (${provider})` : (data.error || 'Test failed') })
    } catch (e) {
      setTestResult({ ok: false, error: e.response?.data || e.message })
      setFlash({ tone: 'error', msg: e.response?.data || e.message || 'Test failed' })
    } finally {
      setBusy(false)
    }
  }

  const keyChip = (set, env) => {
    if (set) return <StatusPill tone="ok">{env ? 'set (env)' : 'set'}</StatusPill>
    return <StatusPill tone="neutral">not set</StatusPill>
  }

  return (
    <div className="opa-page">
      <div className="opa-page-header">
        <div>
          <div className="opa-page-title"><FiCpu /> AI settings</div>
          <div className="opa-page-sub">
            Global providers for Dashboard AI tasks and OPA Review. Keys stay on the Orchestrator — never on the profiling Agent.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="opa-btn ghost" onClick={load} disabled={loading}><FiRefreshCw size={12} /> Refresh</button>
          <button type="button" className="opa-btn primary" onClick={save} disabled={busy || loading}>Save</button>
        </div>
      </div>

      {flash && (
        <div className={`opa-flash ${flash.tone === 'error' ? 'error' : 'ok'}`} style={{ marginBottom: 12 }}>
          {String(flash.msg)}
        </div>
      )}

      <Panel title="Routing" icon={<FiZap />} loading={loading}>
        <p className="opa-muted" style={{ marginTop: 0, fontSize: 13 }}>
          Dashboard tasks (metrics explain, trace analyze) use <strong>OpenAI-compatible</strong> then <strong>Anthropic-compatible</strong>.
          OPA Review / Auto-fix use <strong>CLI agent</strong> first, with HTTP fallback if CLI is unavailable.
        </p>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 320 }}>
          <span className="opa-muted" style={{ fontSize: 12 }}>Default provider (Dashboard tasks)</span>
          <select
            value={form.default_provider}
            onChange={(e) => setForm((f) => ({ ...f, default_provider: e.target.value }))}
          >
            <option value="auto">Auto (OpenAI → Anthropic)</option>
            <option value="openai">OpenAI-compatible</option>
            <option value="anthropic">Anthropic-compatible</option>
            <option value="cli_cursor">CLI agent</option>
          </select>
        </label>
        <div className="opa-muted" style={{ fontSize: 12, marginTop: 8 }}>
          Also used by <Link to="/security?tab=watch">Security · Repo Watch</Link> for OPA Review.
        </div>
      </Panel>

      <Panel
        title="OpenAI-compatible"
        icon={<FiKey />}
        actions={
          <button type="button" className="opa-btn ghost" disabled={busy} onClick={() => testProvider('openai')}>
            <FiCheck size={12} /> Test connection
          </button>
        }
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          {keyChip(settings?.openai?.api_key_set, settings?.openai?.env_override)}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={form.openai.enabled}
              onChange={(e) => setForm((f) => ({ ...f, openai: { ...f.openai, enabled: e.target.checked } }))}
            />
            Enabled
          </label>
        </div>
        <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
          <label>
            <span className="opa-muted" style={{ fontSize: 12 }}>Base URL</span>
            <input
              className="opa-mono"
              style={{ width: '100%' }}
              value={form.openai.base_url}
              onChange={(e) => setForm((f) => ({ ...f, openai: { ...f.openai, base_url: e.target.value } }))}
            />
          </label>
          <label>
            <span className="opa-muted" style={{ fontSize: 12 }}>Model</span>
            <input
              className="opa-mono"
              style={{ width: '100%' }}
              value={form.openai.model}
              onChange={(e) => setForm((f) => ({ ...f, openai: { ...f.openai, model: e.target.value } }))}
            />
          </label>
          <label>
            <span className="opa-muted" style={{ fontSize: 12 }}>API key (write-only)</span>
            <input
              type="password"
              className="opa-mono"
              style={{ width: '100%' }}
              placeholder={settings?.openai?.api_key_set ? '•••••••• (leave blank to keep)' : 'sk-…'}
              value={form.openai.api_key}
              onChange={(e) => setForm((f) => ({ ...f, openai: { ...f.openai, api_key: e.target.value, clear_key: false } }))}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={form.openai.clear_key}
              onChange={(e) => setForm((f) => ({ ...f, openai: { ...f.openai, clear_key: e.target.checked, api_key: '' } }))}
            />
            Clear stored key
          </label>
        </div>
      </Panel>

      <Panel
        title="Anthropic-compatible"
        icon={<FiKey />}
        actions={
          <button type="button" className="opa-btn ghost" disabled={busy} onClick={() => testProvider('anthropic')}>
            <FiCheck size={12} /> Test connection
          </button>
        }
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          {keyChip(settings?.anthropic?.api_key_set, settings?.anthropic?.env_override)}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={form.anthropic.enabled}
              onChange={(e) => setForm((f) => ({ ...f, anthropic: { ...f.anthropic, enabled: e.target.checked } }))}
            />
            Enabled
          </label>
        </div>
        <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
          <label>
            <span className="opa-muted" style={{ fontSize: 12 }}>Base URL</span>
            <input
              className="opa-mono"
              style={{ width: '100%' }}
              value={form.anthropic.base_url}
              onChange={(e) => setForm((f) => ({ ...f, anthropic: { ...f.anthropic, base_url: e.target.value } }))}
            />
          </label>
          <label>
            <span className="opa-muted" style={{ fontSize: 12 }}>Model</span>
            <input
              className="opa-mono"
              style={{ width: '100%' }}
              value={form.anthropic.model}
              onChange={(e) => setForm((f) => ({ ...f, anthropic: { ...f.anthropic, model: e.target.value } }))}
            />
          </label>
          <label>
            <span className="opa-muted" style={{ fontSize: 12 }}>API key (write-only)</span>
            <input
              type="password"
              className="opa-mono"
              style={{ width: '100%' }}
              placeholder={settings?.anthropic?.api_key_set ? '•••••••• (leave blank to keep)' : 'sk-ant-…'}
              value={form.anthropic.api_key}
              onChange={(e) => setForm((f) => ({ ...f, anthropic: { ...f.anthropic, api_key: e.target.value, clear_key: false } }))}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={form.anthropic.clear_key}
              onChange={(e) => setForm((f) => ({ ...f, anthropic: { ...f.anthropic, clear_key: e.target.checked, api_key: '' } }))}
            />
            Clear stored key
          </label>
        </div>
      </Panel>

      <Panel
        title="CLI agent"
        icon={<FiCpu />}
        actions={
          <button type="button" className="opa-btn ghost" disabled={busy} onClick={() => testProvider('cli_cursor')}>
            <FiCheck size={12} /> Test connection
          </button>
        }
      >
        <p className="opa-muted" style={{ marginTop: 0, fontSize: 13 }}>
          First CLI provider: <strong>Cursor</strong>. Used by OPA Review and Auto-fix.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          {keyChip(settings?.cli_cursor?.api_key_set, settings?.cli_cursor?.env_override)}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={form.cli_cursor.enabled}
              onChange={(e) => setForm((f) => ({ ...f, cli_cursor: { ...f.cli_cursor, enabled: e.target.checked } }))}
            />
            Enabled
          </label>
        </div>
        <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
          <label>
            <span className="opa-muted" style={{ fontSize: 12 }}>Provider</span>
            <select disabled value="cursor">
              <option value="cursor">Cursor</option>
            </select>
          </label>
          <label>
            <span className="opa-muted" style={{ fontSize: 12 }}>Model</span>
            <input
              className="opa-mono"
              style={{ width: '100%' }}
              value={form.cli_cursor.model}
              onChange={(e) => setForm((f) => ({ ...f, cli_cursor: { ...f.cli_cursor, model: e.target.value } }))}
            />
          </label>
          <label>
            <span className="opa-muted" style={{ fontSize: 12 }}>Binary path</span>
            <input
              className="opa-mono"
              style={{ width: '100%' }}
              value={form.cli_cursor.bin}
              onChange={(e) => setForm((f) => ({ ...f, cli_cursor: { ...f.cli_cursor, bin: e.target.value } }))}
            />
          </label>
          <label>
            <span className="opa-muted" style={{ fontSize: 12 }}>API key (write-only)</span>
            <input
              type="password"
              className="opa-mono"
              style={{ width: '100%' }}
              placeholder={settings?.cli_cursor?.api_key_set ? '•••••••• (leave blank to keep)' : 'API key'}
              value={form.cli_cursor.api_key}
              onChange={(e) => setForm((f) => ({ ...f, cli_cursor: { ...f.cli_cursor, api_key: e.target.value, clear_key: false } }))}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={form.cli_cursor.force}
              onChange={(e) => setForm((f) => ({ ...f, cli_cursor: { ...f.cli_cursor, force: e.target.checked } }))}
            />
            Pass --force to agent
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={form.cli_cursor.clear_key}
              onChange={(e) => setForm((f) => ({ ...f, cli_cursor: { ...f.cli_cursor, clear_key: e.target.checked, api_key: '' } }))}
            />
            Clear stored key
          </label>
        </div>
      </Panel>

      {testResult && (
        <Panel title="Last test result" icon={<FiCheck />}>
          <pre className="opa-mono" style={{ fontSize: 12, background: 'var(--surface-2)', padding: 12, overflow: 'auto' }}>
            {JSON.stringify(testResult, null, 2)}
          </pre>
        </Panel>
      )}

      {settings?.honesty && (
        <p className="opa-muted" style={{ fontSize: 12 }}>{settings.honesty}</p>
      )}
    </div>
  )
}
