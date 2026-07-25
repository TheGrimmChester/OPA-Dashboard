import React from 'react'

// Segmented control. options: [{value,label}] or [string].
export function SegmentedControl({ options = [], value, onChange }) {
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
  return (
    <div className="opa-seg">
      {opts.map((o) => (
        <button key={o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

// Underline tabs. tabs: [{value,label,icon?}].
export function Tabs({ tabs = [], value, onChange }) {
  return (
    <div className="opa-tabs">
      {tabs.map((t) => (
        <button key={t.value} className={`opa-tab ${value === t.value ? 'active' : ''}`} onClick={() => onChange(t.value)}>
          {t.icon}{t.label}
        </button>
      ))}
    </div>
  )
}
