import React, { useMemo } from 'react'
import { FiAlertCircle, FiRefreshCw } from 'react-icons/fi'
import { Table, EmptyState, Button } from '@open-family/ui'
import { useTableSort } from '../../hooks/useTableSort'
import { tableStateFrom } from './tableState'

/**
 * The product's table: the family `Table` plus the two things it deliberately
 * leaves to the caller — client-side sorting, and the mapping from a fetch result
 * to a table state.
 *
 * The state handling is the point. This component used to render the literal
 * words "No rows" whenever `rows` was empty, which is what an in-flight fetch
 * looks like before it resolves — so "loading" and "there is genuinely nothing
 * here" were the same picture. A caller must now say which it is, and the three
 * states render differently: a skeleton, an empty state that says what is absent,
 * or an error state with a retry.
 *
 * Pass the `useApi()` result straight through:
 *
 *     const svc = useApi('/api/services')
 *     <DataTable loading={svc.loading} error={svc.error} onRetry={svc.reload} … />
 */
export default function DataTable({
  columns = [],
  rows = [],
  rowKey,
  onRowClick,
  selectedKey,
  initialSort,
  /** True while the request is in flight. Renders a skeleton, never an empty state. */
  loading = false,
  /** Truthy on failure. Renders the error state with a retry. */
  error = null,
  /** Reloads only this panel. */
  onRetry,
  /** What is absent, and what to do about it. */
  emptyTitle = 'Nothing to show',
  emptyText,
  emptyAction,
  label,
  compact = false,
  className = '',
}) {
  // The legacy column shape used `num`; the family uses `numeric`. Accept both so
  // a call site can be converted independently of this component.
  const normalised = useMemo(
    () => columns.map(({ num, align, sortable, ...rest }) => ({
      ...rest,
      numeric: rest.numeric ?? num ?? align === 'right',
      ...(sortable === false ? { sortable: false } : {}),
    })),
    [columns]
  )

  const sorted = useTableSort(rows, normalised, initialSort || null)

  // The precedence is the whole fix, so it lives in one tested place.
  const state = tableStateFrom({ loading, error, rowCount: rows.length })

  return (
    <Table
      aria-label={label}
      className={className}
      compact={compact}
      state={state}
      columns={sorted.columns}
      rows={sorted.rows}
      onSort={sorted.onSort}
      getRowKey={(row, index) => String(rowKey ? rowKey(row, index) : index)}
      onRowClick={onRowClick ? (row) => onRowClick(row) : undefined}
      isRowSelected={
        selectedKey != null && rowKey
          ? (row) => String(rowKey(row)) === String(selectedKey)
          : undefined
      }
      emptyState={
        <EmptyState
          inline
          title={emptyTitle}
          description={emptyText}
          actions={emptyAction}
        />
      }
      errorState={
        <EmptyState
          inline
          icon={<FiAlertCircle />}
          title="This table failed to load"
          description={String(error || 'The request did not complete.')}
          actions={
            onRetry
              ? <Button icon={<FiRefreshCw />} onClick={onRetry}>Retry</Button>
              : undefined
          }
        />
      }
    />
  )
}
