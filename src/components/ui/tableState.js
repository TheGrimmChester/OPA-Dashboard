/**
 * Which of the four states a table is in.
 *
 * This exists as its own function, with its own test, because getting the
 * *precedence* wrong is the defect it was written to fix: the table this replaced
 * checked `rows.length === 0` first and rendered the words "No rows", so an
 * in-flight request looked exactly like a query that genuinely returned nothing.
 * A user could not tell "still loading" from "there is nothing here", and the two
 * call for completely different reactions.
 *
 * Loading wins over error, and error wins over empty:
 *
 *   - loading — a request is in flight. Never report a result yet, of any kind.
 *   - error   — the request finished and failed. An empty table would be a lie.
 *   - empty   — the request finished, succeeded, and there is genuinely nothing.
 *   - ready   — there are rows.
 *
 * @param {{loading?: boolean, error?: unknown, rowCount?: number}} input
 * @returns {'loading'|'error'|'empty'|'ready'}
 */
export function tableStateFrom({ loading = false, error = null, rowCount = 0 } = {}) {
  if (loading) return 'loading'
  if (error) return 'error'
  return rowCount > 0 ? 'ready' : 'empty'
}

export default tableStateFrom
