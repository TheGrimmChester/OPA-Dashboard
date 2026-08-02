import React from 'react'

/** Checkbox + label + one-line purpose (Watch check policy). */
export default function CheckWithHint({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}) {
  const hintId = id ? `${id}-hint` : undefined
  return (
    <label className={`opa-check-hint${checked ? ' on' : ''}${disabled ? ' disabled' : ''}`}>
      <input
        id={id}
        type="checkbox"
        checked={!!checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        aria-describedby={hintId}
      />
      <span className="opa-check-hint-body">
        <span className="opa-check-hint-label">{label}</span>
        {hint ? <span id={hintId} className="opa-check-hint-desc">{hint}</span> : null}
      </span>
    </label>
  )
}
