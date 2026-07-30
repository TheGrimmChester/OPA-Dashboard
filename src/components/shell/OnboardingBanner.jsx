import React, { useState } from 'react'
import { FiX } from 'react-icons/fi'

const SNIPPETS = {
  php: `opa_start(['service' => 'my-app']);`,
  node: `require('opa-node').start({ service: 'my-app' })`,
  python: `import opa_apm as opa\nopa.start(service="my-app")`,
  otlp: `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`,
}

/** Wave 14-5: first-run onboarding until dismissed. */
export default function OnboardingBanner() {
  const [open, setOpen] = useState(() => localStorage.getItem('opa_onboarded') !== '1')
  const [lang, setLang] = useState('node')
  if (!open) return null
  return (
    <div style={{
      marginBottom: 16, padding: '12px 14px', borderRadius: 8,
      border: '1px solid var(--border-strong)', background: 'var(--surface-2)',
      display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Waiting for your first trace</div>
        <div className="opa-muted" style={{ fontSize: 13, marginBottom: 8 }}>
          Instrument an app and point it at this agent. Live verification lands on Overview once spans arrive.
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {Object.keys(SNIPPETS).map((k) => (
            <button key={k} type="button" className="opa-btn ghost" style={{ fontSize: 12 }} onClick={() => setLang(k)}>{k}</button>
          ))}
        </div>
        <pre className="opa-mono" style={{ fontSize: 12, margin: 0, whiteSpace: 'pre-wrap' }}>{SNIPPETS[lang]}</pre>
      </div>
      <button
        type="button"
        className="opa-btn ghost"
        aria-label="Dismiss onboarding"
        onClick={() => { localStorage.setItem('opa_onboarded', '1'); setOpen(false) }}
      >
        <FiX />
      </button>
    </div>
  )
}
