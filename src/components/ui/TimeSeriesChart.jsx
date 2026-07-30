import React from 'react'
import {
  ResponsiveContainer, ComposedChart, Area, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Brush, ReferenceLine,
} from 'recharts'
import { useTimeRange } from '../../contexts/TimeRangeContext'

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

/**
 * Wave 14-3: optional brush-to-zoom writes an absolute window into TimeRangeContext.
 * annotations: [{ occurred_at|t, title, kind }]
 */
export default function TimeSeriesChart({
  data = [], xKey = 'time', series = [], height = 220, valueFmt, yFmt, legend = true, stacked = false,
  brushZoom = false, annotations = [],
}) {
  const tr = useTimeRange()

  const onBrush = (range) => {
    if (!brushZoom || !tr?.setAbsoluteRange || !range || range.startIndex == null || range.endIndex == null) return
    const a = data[range.startIndex]
    const b = data[range.endIndex]
    if (!a || !b) return
    const parse = (row) => {
      const raw = row[xKey]
      const ms = Date.parse(raw) || Date.parse(String(raw).replace(' ', 'T') + 'Z')
      return ms
    }
    const fromMs = parse(a)
    const toMs = parse(b)
    if (fromMs && toMs && toMs > fromMs) tr.setAbsoluteRange(fromMs, toMs)
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: brushZoom ? 8 : 0 }}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--border-default)' }} minTickGap={28} />
        <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={44} tickFormatter={yFmt} />
        <Tooltip content={<OpaTooltip valueFmt={valueFmt} />} cursor={{ stroke: 'var(--border-strong)' }} />
        {legend && <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} iconType="plainline" />}
        {(annotations || []).slice(0, 20).map((ann, i) => {
          const x = ann.t || ann.occurred_at || ann.time
          if (!x) return null
          return <ReferenceLine key={i} x={x} stroke="var(--warn, #c9a227)" strokeDasharray="3 3" label={{ value: ann.title || ann.kind || '', fill: 'var(--text-muted)', fontSize: 10 }} />
        })}
        {series.map((s) => {
          const stackId = stacked ? 'a' : undefined
          if (s.type === 'bar') return <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={stackId} radius={[2, 2, 0, 0]} />
          if (s.type === 'line') return <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={1.8} strokeDasharray={s.dashed ? '4 3' : undefined} dot={false} />
          return (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} fill={s.color} fillOpacity={s.fill ?? (stacked ? 0.35 : 0.12)} strokeWidth={1.8} stackId={stackId} dot={false} />
          )
        })}
        {brushZoom && data.length > 2 && (
          <Brush dataKey={xKey} height={22} stroke="var(--accent)" fill="var(--surface-2)" travellerWidth={8} onChange={onBrush} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
