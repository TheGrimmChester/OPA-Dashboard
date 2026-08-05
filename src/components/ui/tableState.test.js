import { describe, it, expect } from 'vitest'
import { tableStateFrom } from './tableState'

/**
 * The defect this function exists to prevent: the table component checked
 * `rows.length === 0` first and rendered the words "No rows", so a request in
 * flight was indistinguishable from a query that genuinely returned nothing.
 *
 * The precedence is the contract, so it is what gets asserted.
 */
describe('tableStateFrom', () => {
  it('reports loading while a request is in flight, even with no rows', () => {
    // This is the case that used to render "No rows".
    expect(tableStateFrom({ loading: true, rowCount: 0 })).toBe('loading')
  })

  it('still reports loading when rows from a previous fetch are on screen', () => {
    expect(tableStateFrom({ loading: true, rowCount: 25 })).toBe('loading')
  })

  it('prefers loading over error, so a retry in flight does not look failed', () => {
    expect(tableStateFrom({ loading: true, error: 'boom', rowCount: 0 })).toBe('loading')
  })

  it('reports an error rather than an empty result when the request failed', () => {
    // An empty table after a failure would claim the query returned nothing.
    expect(tableStateFrom({ loading: false, error: 'HTTP 500', rowCount: 0 })).toBe('error')
  })

  it('reports empty only when the request finished, succeeded, and found nothing', () => {
    expect(tableStateFrom({ loading: false, error: null, rowCount: 0 })).toBe('empty')
  })

  it('reports ready when there are rows', () => {
    expect(tableStateFrom({ loading: false, error: null, rowCount: 1 })).toBe('ready')
  })

  it('treats a missing input as empty rather than throwing', () => {
    expect(tableStateFrom()).toBe('empty')
    expect(tableStateFrom({})).toBe('empty')
  })

  it('treats any truthy error as an error, not just a string', () => {
    expect(tableStateFrom({ error: new Error('nope') })).toBe('error')
    expect(tableStateFrom({ error: { message: 'nope' } })).toBe('error')
  })

  it('does not treat an empty-string error as a failure', () => {
    // `formatApiError` returns a string; an empty one means no error.
    expect(tableStateFrom({ error: '', rowCount: 3 })).toBe('ready')
  })
})
