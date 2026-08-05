import { useCallback, useMemo, useState } from 'react'

/**
 * Client-side sorting for the kit's `Table`.
 *
 * The kit deliberately leaves sorting to the caller — a table that sorts its own
 * rows cannot also be server-paginated, and half the tables in this dashboard
 * will eventually be. The component this replaced sorted internally, so this
 * hook exists to keep that behaviour identical rather than quietly dropping it
 * from thirty call sites.
 *
 * Pass kit-shaped columns. Two extra keys are honoured:
 *   - `sortValue(row)` — the value to compare, when the cell renders something
 *     other than the raw field (a formatted duration, a computed total).
 *   - `sortable: false` — opt a column out. Everything else is sortable, which
 *     matches the previous behaviour.
 *
 * A `numeric` column sorts descending on first click, because the interesting end
 * of a latency or error-count column is the top.
 *
 * @param {readonly object[]} rows
 * @param {readonly object[]} columns
 * @param {{key: string, dir: 'asc'|'desc'}} [initial]
 */
export function useTableSort(rows, columns, initial = null) {
  const [sort, setSort] = useState(initial)

  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const column = columns.find((c) => c.key === sort.key)
    if (!column) return rows
    const read = column.sortValue || ((row) => row[sort.key])
    const direction = sort.dir === 'asc' ? 1 : -1
    // Nulls sort last in both directions: an absent measurement is not a small
    // one, and floating it to the top of a "slowest first" list is a lie.
    return [...rows].sort((a, b) => {
      const av = read(a)
      const bv = read(b)
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction
      return String(av).localeCompare(String(bv)) * direction
    })
  }, [rows, sort, columns])

  const onSort = useCallback((key) => {
    const column = columns.find((c) => c.key === key)
    if (!column || column.sortable === false) return
    setSort((current) => {
      if (!current || current.key !== key) {
        return { key, dir: column.numeric ? 'desc' : 'asc' }
      }
      return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
    })
  }, [columns])

  // `aria-sort` needs the state per column, which is what `sort` carries.
  const sortableColumns = useMemo(
    () => columns.map((column) => {
      if (column.sortable === false) {
        const { sortValue, ...rest } = column
        return rest
      }
      const { sortValue, ...rest } = column
      return {
        ...rest,
        sortable: true,
        sort: sort?.key === column.key
          ? (sort.dir === 'asc' ? 'ascending' : 'descending')
          : 'none',
      }
    }),
    [columns, sort]
  )

  return { rows: sortedRows, columns: sortableColumns, onSort, sort }
}

export default useTableSort
