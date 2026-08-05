import React, { useEffect, useState } from 'react'
import { FiX } from 'react-icons/fi'
import { useApi } from '../../hooks/useApi'

const SNIPPETS = {
  php: `opa_start(['service' => 'my-app']);`,
  node: `require('opa-node').start({ service: 'my-app' })`,
  python: `import opa_apm as opa\nopa.start(service="my-app")`,
  otlp: `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`,
}

const STORAGE_KEY = 'opa_onboarded'

function hasIngestedTraces(data) {
  if (!data) return false
  const total = Number(data.total)
  if (Number.isFinite(total) && total > 0) return true
  const list = data.traces || data.items || data.data
  return Array.isArray(list) && list.length > 0
}

/** Dashboards: first-run onboarding until dismissed or traces arrive. */
export default function OnboardingBanner() {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) !== '1' } catch { return true }
  })
  const [lang, setLang] = useState('node')
  // Only probe while the banner would show — once onboarded, skip the call.
  const traces = useApi('/api/traces', { limit: 1 }, { noRange: true, skip: !open })

  useEffect(() => {
    if (!open || traces.loading || traces.error) return
    if (!hasIngestedTraces(traces.data)) return
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* ignore */ }
    setOpen(false)
  }, [open, traces.loading, traces.error, traces.data])

  if (!open) return null
  // Avoid a flash of "waiting" while we confirm whether traces already exist.
  if (traces.loading) return null

  return (
    <div style={{
      marginBottom: 16, padding: '12px 14px', borderRadius: 8,
      border: '1px solid var(--border-strong)', background: 'var(--surface-2)',
      display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Waiting for your first trace</div>
        <div className="oui-text-muted" style={{ fontSize: 13, marginBottom: 8 }}>
          Instrument an app and point it at this agent. Live verification lands on Service once spans arrive.
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {Object.keys(SNIPPETS).map((k) => (
            <button key={k} type="button" className="oui-btn is-ghost" style={{ fontSize: 12 }} onClick={() => setLang(k)}>{k}</button>
          ))}
        </div>
        <pre className="oui-mono" style={{ fontSize: 12, margin: 0, whiteSpace: 'pre-wrap' }}>{SNIPPETS[lang]}</pre>
      </div>
      <button
        type="button"
        className="oui-btn is-ghost"
        aria-label="Dismiss onboarding"
        onClick={() => {
          try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* ignore */ }
          setOpen(false)
        }}
      >
        <FiX />
      </button>
    </div>
  )
}
