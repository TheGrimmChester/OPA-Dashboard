import React, { useState, useMemo } from 'react'
import { FiChevronDown, FiChevronUp } from 'react-icons/fi'

// Dense, sortable table.
// columns: [{ key, header, num?, sortable?, width?, mono?, render?(row,i), sortValue?(row), align? }]
export default function DataTable({
  columns = [], rows = [], rowKey, onRowClick, selectedKey, initialSort, emptyText = 'No rows', maxHeight, className = '',
}) {
  const [sort, setSort] = useState(initialSort || null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows
    const val = col.sortValue || ((r) => r[sort.key])
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = val(a), bv = val(b)
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  }, [rows, sort, columns])

  const toggleSort = (col) => {
    if (col.sortable === false) return
    setSort((s) => {
      if (!s || s.key !== col.key) return { key: col.key, dir: col.num ? 'desc' : 'asc' }
      return { key: col.key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
    })
  }

  return (
    <div className="opa-table-wrap" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
      <table className={`opa-table ${className}`}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`${c.num ? 'num' : ''} ${c.sortable !== false ? 'sortable' : ''}`}
                style={c.width ? { width: c.width } : undefined}
                onClick={() => toggleSort(c)}
              >
                {c.header}
                {sort && sort.key === c.key && (
                  <span className="sort-ind">{sort.dir === 'asc' ? <FiChevronUp size={11} /> : <FiChevronDown size={11} />}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr><td className="opa-table-empty" colSpan={columns.length}>{emptyText}</td></tr>
          ) : sorted.map((row, i) => {
            const key = rowKey ? rowKey(row, i) : i
            const selected = selectedKey != null && String(selectedKey) === String(key)
            return (
              <tr
                key={key}
                className={[onRowClick ? 'clickable' : '', selected ? 'selected' : ''].filter(Boolean).join(' ')}
                onClick={onRowClick ? () => onRowClick(row, i) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`${c.num ? 'num' : ''} ${c.mono ? 'mono' : ''}`} style={c.align ? { textAlign: c.align } : undefined}>
                    {c.render ? c.render(row, i) : (row[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
