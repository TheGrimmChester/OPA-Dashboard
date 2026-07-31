import React from 'react'

// Neutral chip.
export function Badge({ children, title }) {
  return <span className="opa-badge" title={title}>{children}</span>
}

// Status pill: tone in ok|warn|error|neutral|info|alert.
export function StatusPill({ tone = 'neutral', children, title }) {
  return <span className={`opa-pill ${tone}`} title={title}>{children}</span>
}

// Colored health dot; tone in ok|warn|error|neutral, optional pulse.
export function HealthDot({ tone = 'neutral', pulse = false, title }) {
  const color = { ok: 'var(--ok)', warn: 'var(--warn)', error: 'var(--error)', down: 'var(--down)', neutral: 'var(--neutral)' }[tone] || 'var(--neutral)'
  return <span className={`opa-dot ${pulse ? 'pulse' : ''}`} style={{ background: color, color }} title={title} />
}

// Language / framework chips with a small colored dot.
const LANG_COLOR = { php: '#8892BF', go: '#00ADD8', javascript: '#F7DF1E', python: '#3776AB', java: '#E76F00', ruby: '#CC342D', node: '#83CD29' }
export function LanguageBadge({ language, version }) {
  if (!language) return null
  const c = LANG_COLOR[String(language).toLowerCase()] || 'var(--neutral)'
  return <span className="opa-badge"><span className="opa-dot" style={{ background: c, width: 7, height: 7 }} />{language}{version ? ` ${version}` : ''}</span>
}
