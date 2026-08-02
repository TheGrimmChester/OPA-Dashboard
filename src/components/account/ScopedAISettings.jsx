import React, { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { FiCheck, FiCpu, FiKey, FiRefreshCw, FiZap } from 'react-icons/fi'
import { Panel, StatusPill, Badge } from '../ui'
import { apiUrl } from '../../utils/apiBase'

const emptyForm = () => ({
  default_provider: 'auto',
  openai: { enabled: false, base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini', api_key: '', clear_key: false },
  anthropic: { enabled: false, base_url: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514', api_key: '', clear_key: false },
  cli_cursor: { enabled: true, model: 'auto', bin: 'agent', force: false, api_key: '', clear_key: false },
})

function keyChip(provider) {
  if (!provider) return <StatusPill tone="neutral">not set</StatusPill>
  if (!provider.api_key_set) return <StatusPill tone="neutral">not set</StatusPill>
  if (provider.inherited) {
    return <StatusPill tone="ok" title="Inherited from org">set · inherited from org</StatusPill>
  }
  const scope = provider.key_scope || ''
  return <StatusPill tone="ok">set{scope ? ` · ${scope}` : ''}</StatusPill>
}

/**
 * Scope-aware AI provider settings editor.
 * @param {'user'|'org'|'admin'} scope
 * @param {boolean} readOnly
 */
export default function ScopedAISettings({
  scope = 'user',
  title = 'AI providers',
  subtitle = '',
  readOnly = false,
}) {
  const [settings, setSettings] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(null)
  const [testResult, setTestResult] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await axios.get(apiUrl('/api/ai/settings'), { params: { scope } })
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
  }, [scope])

  useEffect(() => { load() }, [load])

  const save = async () => {
    if (readOnly) return
    setBusy(true)
    setFlash(null)
    try {
      const body = {
        scope,
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
      setFlash({ tone: 'ok', msg: `Saved (${scope} scope)` })
      await load()
    } catch (e) {
      setFlash({ tone: 'error', msg: e.response?.data || e.message || 'Save failed' })
    } finally {
      setBusy(false)
    }
  }

  const testProvider = async (provider) => {
    const draftKey = (form[provider]?.api_key || '').trim()
    const stored = !!settings?.[provider]?.api_key_set
    if (!stored && !draftKey) {
      setFlash({ tone: 'error', msg: `No ${provider} API key saved — enter a key and Save, then Test` })
      setTestResult({ ok: false, error: 'no api key saved for this scope — save first' })
      return
    }
    if (draftKey) {
      setFlash({ tone: 'error', msg: 'Unsaved API key — click Save first, then Test' })
      setTestResult({ ok: false, error: 'unsaved api key — save before testing' })
      return
    }
    setBusy(true)
    setTestResult(null)
    try {
      const { data } = await axios.post(apiUrl('/api/ai/settings/test'), { provider, scope })
      setTestResult(data)
      setFlash({ tone: data.ok ? 'ok' : 'error', msg: data.ok ? `Test OK (${provider})` : (data.error || 'Test failed') })
    } catch (e) {
      const err = e.response?.data || e.message
      setTestResult({ ok: false, error: err })
      setFlash({ tone: 'error', msg: typeof err === 'string' ? err.trim() : (e.message || 'Test failed') })
    } finally {
      setBusy(false)
    }
  }

  const scopeHint = scope === 'user'
    ? 'Personal overrides win over org defaults for your jobs. Clear a key to fall back to the org key.'
    : scope === 'org'
      ? 'Org defaults apply to members who have no personal override. Admin keys are never used here.'
      : 'Admin-only credentials — never inherited by org members or other users.'

  return (
    <div className="opa-stack" style={{ gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="cell-strong" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FiCpu size={14} /> {title}
            <Badge title={scopeHint}>{scope}</Badge>
          </div>
          {(subtitle || scopeHint) && (
            <div className="opa-muted" style={{ fontSize: 12, marginTop: 4 }}>{subtitle || scopeHint}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="opa-btn ghost" onClick={load} disabled={loading}><FiRefreshCw size={12} /> Refresh</button>
          {!readOnly && (
            <button type="button" className="opa-btn primary" onClick={save} disabled={busy || loading}>Save</button>
          )}
        </div>
      </div>

      {flash && (
        <div className={`opa-flash ${flash.tone === 'error' ? 'error' : 'ok'}`}>
          {String(flash.msg)}
        </div>
      )}

      <Panel title="Routing" icon={<FiZap />} loading={loading}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 320 }}>
          <span className="opa-muted" style={{ fontSize: 12 }}>Default provider (Dashboard tasks)</span>
          <select
            value={form.default_provider}
            disabled={readOnly}
            onChange={(e) => setForm((f) => ({ ...f, default_provider: e.target.value }))}
          >
            <option value="auto">Auto (CLI agent → OpenAI → Anthropic)</option>
            <option value="openai">OpenAI-compatible</option>
            <option value="anthropic">Anthropic-compatible</option>
            <option value="cli_cursor">CLI agent</option>
          </select>
        </label>
      </Panel>

      {[
        { id: 'openai', title: 'OpenAI-compatible', ph: 'sk-…' },
        { id: 'anthropic', title: 'Anthropic-compatible', ph: 'sk-ant-…' },
      ].map((p) => (
        <Panel
          key={p.id}
          title={p.title}
          icon={<FiKey />}
          actions={!readOnly && (
            <button type="button" className="opa-btn ghost" disabled={busy} onClick={() => testProvider(p.id)}>
              <FiCheck size={12} /> Test
            </button>
          )}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            {keyChip(settings?.[p.id])}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                disabled={readOnly}
                checked={form[p.id].enabled}
                onChange={(e) => setForm((f) => ({ ...f, [p.id]: { ...f[p.id], enabled: e.target.checked } }))}
              />
              Enabled
            </label>
          </div>
          <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
            <label>
              <span className="opa-muted" style={{ fontSize: 12 }}>Base URL</span>
              <input className="opa-mono" style={{ width: '100%' }} disabled={readOnly} value={form[p.id].base_url}
                onChange={(e) => setForm((f) => ({ ...f, [p.id]: { ...f[p.id], base_url: e.target.value } }))} />
            </label>
            <label>
              <span className="opa-muted" style={{ fontSize: 12 }}>Model</span>
              <input className="opa-mono" style={{ width: '100%' }} disabled={readOnly} value={form[p.id].model}
                onChange={(e) => setForm((f) => ({ ...f, [p.id]: { ...f[p.id], model: e.target.value } }))} />
            </label>
            {!readOnly && (
              <>
                <label>
                  <span className="opa-muted" style={{ fontSize: 12 }}>API key (write-only)</span>
                  <input type="password" className="opa-mono" style={{ width: '100%' }}
                    placeholder={settings?.[p.id]?.api_key_set ? '•••••••• (leave blank to keep)' : p.ph}
                    value={form[p.id].api_key}
                    onChange={(e) => setForm((f) => ({ ...f, [p.id]: { ...f[p.id], api_key: e.target.value, clear_key: false } }))} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <input type="checkbox" checked={form[p.id].clear_key}
                    onChange={(e) => setForm((f) => ({ ...f, [p.id]: { ...f[p.id], clear_key: e.target.checked, api_key: '' } }))} />
                  Clear stored key{scope === 'user' ? ' (fall back to org)' : ''}
                </label>
              </>
            )}
          </div>
        </Panel>
      ))}

      <Panel
        title="CLI agent (Cursor)"
        icon={<FiCpu />}
        actions={!readOnly && (
          <button type="button" className="opa-btn ghost" disabled={busy} onClick={() => testProvider('cli_cursor')}>
            <FiCheck size={12} /> Test
          </button>
        )}
      >
        <p className="opa-muted" style={{ marginTop: 0, fontSize: 13 }}>
          Used by OPA Review / Auto-fix. Jobs resolve <strong>user → org</strong> and fail closed — never admin keys, never process env.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          {keyChip(settings?.cli_cursor)}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" disabled={readOnly} checked={form.cli_cursor.enabled}
              onChange={(e) => setForm((f) => ({ ...f, cli_cursor: { ...f.cli_cursor, enabled: e.target.checked } }))} />
            Enabled
          </label>
        </div>
        <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
          <label>
            <span className="opa-muted" style={{ fontSize: 12 }}>Model</span>
            <input className="opa-mono" style={{ width: '100%' }} disabled={readOnly} value={form.cli_cursor.model}
              onChange={(e) => setForm((f) => ({ ...f, cli_cursor: { ...f.cli_cursor, model: e.target.value } }))} />
          </label>
          <label>
            <span className="opa-muted" style={{ fontSize: 12 }}>Binary path</span>
            <input className="opa-mono" style={{ width: '100%' }} disabled={readOnly} value={form.cli_cursor.bin}
              onChange={(e) => setForm((f) => ({ ...f, cli_cursor: { ...f.cli_cursor, bin: e.target.value } }))} />
          </label>
          {!readOnly && (
            <>
              <label>
                <span className="opa-muted" style={{ fontSize: 12 }}>API key (write-only)</span>
                <input type="password" className="opa-mono" style={{ width: '100%' }}
                  placeholder={settings?.cli_cursor?.api_key_set ? '•••••••• (leave blank to keep)' : 'API key'}
                  value={form.cli_cursor.api_key}
                  onChange={(e) => setForm((f) => ({ ...f, cli_cursor: { ...f.cli_cursor, api_key: e.target.value, clear_key: false } }))} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={form.cli_cursor.clear_key}
                  onChange={(e) => setForm((f) => ({ ...f, cli_cursor: { ...f.cli_cursor, clear_key: e.target.checked, api_key: '' } }))} />
                Clear stored key{scope === 'user' ? ' (fall back to org)' : ''}
              </label>
            </>
          )}
        </div>
      </Panel>

      {testResult && (
        <pre className="opa-mono" style={{ fontSize: 12, background: 'var(--surface-2)', padding: 12, overflow: 'auto' }}>
          {JSON.stringify(testResult, null, 2)}
        </pre>
      )}
    </div>
  )
}
