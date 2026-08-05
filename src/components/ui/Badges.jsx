import React from 'react'
import { Badge as FamilyBadge } from '@open-family/ui'

/** The legacy tone vocabulary, mapped onto the family's reserved status roles. */
const TONE = {
  ok: 'good',
  healthy: 'good',
  up: 'good',
  success: 'good',
  warn: 'warning',
  warning: 'warning',
  degraded: 'warning',
  error: 'critical',
  critical: 'critical',
  down: 'critical',
  unhealthy: 'critical',
  alert: 'critical',
  info: 'accent',
  neutral: 'neutral',
}

const toTone = (tone) => TONE[String(tone || '').toLowerCase()] || 'neutral'

/** A neutral chip. */
export function Badge({ children, title }) {
  return <FamilyBadge title={title}>{children}</FamilyBadge>
}

/** A status chip. The tone carries the state and the text names it. */
export function StatusPill({ tone = 'neutral', children, title }) {
  return <FamilyBadge tone={toTone(tone)} title={title}>{children}</FamilyBadge>
}

/**
 * Health, as a chip rather than a dot.
 *
 * This was a bare coloured dot whose only label was a `title` attribute — colour
 * alone, and a tooltip that no keyboard or screen-reader user reaches. A status
 * hue in this system never travels without a word, so the tone now ships with
 * text: the caller's `title` when there is one, otherwise the tone itself.
 */
export function HealthDot({ tone = 'neutral', title, children }) {
  return (
    <FamilyBadge tone={toTone(tone)} title={title}>
      {children || title || String(tone)}
    </FamilyBadge>
  )
}

/**
 * Language and framework chip.
 *
 * The per-language brand colours are gone. They were seven hard-coded hexes that
 * collided with the chart palette, sat at unknown contrast on both surfaces, and
 * encoded nothing a reader needs — the language is written right there.
 */
export function LanguageBadge({ language, version }) {
  if (!language) return null
  return (
    <FamilyBadge>
      {version ? `${language} ${version}` : String(language)}
    </FamilyBadge>
  )
}
