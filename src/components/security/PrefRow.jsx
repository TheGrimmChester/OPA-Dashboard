import React from 'react'

/**
 * Preference row with optional static hint and live on/off effect copy.
 * Used by Agents + Watch policy controls.
 */
export default function PrefRow({
  label,
  hint,
  effect,
  effectOn,
  effectOff,
  on,
  children,
  as: Tag = 'div',
}) {
  const resolvedEffect = effect != null
    ? effect
    : (on == null ? null : (on ? effectOn : effectOff))

  return (
    <Tag className="opa-agents-pref-row">
      <span className="opa-agents-pref-label">
        <span className="cell-strong">{label}</span>
        {hint ? <span className="opa-agents-pref-hint">{hint}</span> : null}
        {resolvedEffect ? (
          <span className="opa-agents-pref-effect" role="status">
            <em>Now:</em> {resolvedEffect}
          </span>
        ) : null}
      </span>
      <span className="opa-agents-pref-control">
        {on != null ? (
          <span className={`opa-agents-pref-state${on ? ' on' : ''}`}>{on ? 'On' : 'Off'}</span>
        ) : null}
        {children}
      </span>
    </Tag>
  )
}
