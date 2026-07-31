import React from 'react'
import { Link } from 'react-router-dom'

/**
 * Clickable entity chip. When `to` is missing/empty, renders plain text
 * (never a dead link). Optional `secondary` is a quieter follow-on link.
 */
export default function EntityChip({
  to,
  children,
  title,
  mono = true,
  secondary,
  secondaryLabel,
  className = '',
  onClick,
}) {
  const label = children
  if (!to) {
    return (
      <span
        className={`opa-entity-chip is-plain ${mono ? 'opa-mono' : ''} ${className}`.trim()}
        title={title}
      >
        {label || '—'}
      </span>
    )
  }
  return (
    <span className={`opa-entity-chip-wrap ${className}`.trim()}>
      <Link
        to={to}
        className={`opa-entity-chip ${mono ? 'opa-mono' : ''}`}
        title={title}
        onClick={onClick}
      >
        {label}
      </Link>
      {secondary && (
        <Link
          to={secondary}
          className="opa-entity-chip is-secondary"
          title={secondaryLabel || title}
          onClick={onClick}
        >
          {secondaryLabel || 'related'}
        </Link>
      )}
    </span>
  )
}

/** Compact row of EntityChips from collectCorrelationTags / spanAttributeLinks. */
export function EntityChipRow({ items, empty = null }) {
  const list = (items || []).filter((i) => i && i.to)
  if (!list.length) return empty
  return (
    <div className="opa-entity-chip-row">
      {list.map((i) => (
        <EntityChip
          key={`${i.kind || i.key}:${i.value || i.to}`}
          to={i.to}
          title={i.title}
          secondary={i.secondary}
          secondaryLabel={i.kind === 'session' ? 'traces' : i.kind === 'check' ? 'traces' : undefined}
        >
          {i.label || i.value}
        </EntityChip>
      ))}
    </div>
  )
}
