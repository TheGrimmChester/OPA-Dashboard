import React from 'react'

// Tiny inline SVG sparkline (line + optional area fill). No chart lib needed.
export default function Sparkline({ data = [], width = 96, height = 28, color = 'var(--accent)', area = true, strokeWidth = 1.5 }) {
  const vals = (data || []).map((d) => (typeof d === 'number' ? d : d?.value)).filter((v) => v != null && !isNaN(v))
  if (vals.length < 2) return <svg width={width} height={height} />
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const stepX = width / (vals.length - 1)
  const y = (v) => height - 2 - ((v - min) / span) * (height - 4)
  const pts = vals.map((v, i) => `${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`)
  const line = `M${pts.join('L')}`
  const fill = `${line}L${width},${height}L0,${height}Z`
  const gid = `spk${Math.round(width)}${vals.length}${Math.round(min)}`
  return (
    <svg width={width} height={height} preserveAspectRatio="none" style={{ display: 'block' }}>
      {area && (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={fill} fill={`url(#${gid})`} />
        </>
      )}
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
