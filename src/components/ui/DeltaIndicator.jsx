import React from 'react'
import { FiArrowUp, FiArrowDown, FiMinus } from 'react-icons/fi'

// Signed % change vs a previous period. `invert` = up-is-bad (latency, errors).
export default function DeltaIndicator({ current, previous, invert = false, suffix = '' }) {
  if (current == null || previous == null || isNaN(current) || isNaN(previous)) {
    return <span className="opa-delta flat">—</span>
  }
  if (previous === 0) {
    if (current === 0) return <span className="opa-delta flat"><FiMinus size={11} /> 0%</span>
    return <span className={`opa-delta ${invert ? 'invert up' : 'up'}`}><FiArrowUp size={11} /> new</span>
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100
  const dir = Math.abs(pct) < 0.5 ? 'flat' : pct > 0 ? 'up' : 'down'
  const Icon = dir === 'up' ? FiArrowUp : dir === 'down' ? FiArrowDown : FiMinus
  return (
    <span className={`opa-delta ${invert ? 'invert' : ''} ${dir}`}>
      <Icon size={11} /> {Math.abs(pct).toFixed(1)}%{suffix}
    </span>
  )
}
