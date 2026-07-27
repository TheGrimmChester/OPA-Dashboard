import React from 'react'
import {
  ResponsiveContainer, ComposedChart, Area, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

// Themed recharts wrapper used across the app so every time-series looks the same.
// series: [{ key, name, color, type?('area'|'line'|'bar'), fill?, dashed? }]
function OpaTooltip({ active, payload, label, valueFmt }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '8px 10px', boxShadow: 'var(--shadow-pop)', fontSize: 12 }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 4, fontSize: 11 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
          <span style={{ color: 'var(--text-secondary)' }}>{p.name}</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>{valueFmt ? valueFmt(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function TimeSeriesChart({ data = [], xKey = 'time', series = [], height = 220, valueFmt, yFmt, legend = true, stacked = false }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--border-default)' }} minTickGap={28} />
        <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={44} tickFormatter={yFmt} />
        <Tooltip content={<OpaTooltip valueFmt={valueFmt} />} cursor={{ stroke: 'var(--border-strong)' }} />
        {legend && <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} iconType="plainline" />}
        {series.map((s, i) => {
          const stackId = stacked ? 'a' : undefined
          if (s.type === 'bar') return <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={stackId} radius={[2, 2, 0, 0]} />
          if (s.type === 'line') return <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={1.8} strokeDasharray={s.dashed ? '4 3' : undefined} dot={false} />
          return (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} fill={s.color} fillOpacity={s.fill ?? (stacked ? 0.35 : 0.12)} strokeWidth={1.8} stackId={stackId} dot={false} />
          )
        })}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
