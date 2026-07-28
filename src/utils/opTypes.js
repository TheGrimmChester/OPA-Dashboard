// Operation-type convention shared by the profiling views (flame graph, call
// graph). function=blue, sql=purple, http=orange, redis=red, cache=green;
// anything unclassifiable is neutral.
//
// Deliberately var()-only: the dashboard re-declares --color-primary-* in
// theme/tokens.css AND theme/light.css, so any mirrored hex table goes stale
// the moment a token moves (FlameGraph's TYPE_HEX already has). Consumers that
// can render CSS variables directly (SVG, DOM) must use these strings.

export const TYPE_VARS = {
  function: 'var(--color-primary-blue)',
  sql: 'var(--color-primary-purple)',
  http: 'var(--color-primary-orange)',
  redis: 'var(--color-primary-red)',
  cache: 'var(--color-primary-green)',
}

export const NEUTRAL_VAR = 'var(--bg-tertiary)'

export const TYPE_LABELS = {
  function: 'Function',
  sql: 'SQL',
  http: 'HTTP',
  redis: 'Redis',
  cache: 'Cache',
}

// Index order is persisted in typed arrays (opType columns), so append only.
export const TYPE_ORDER = ['function', 'sql', 'http', 'redis', 'cache']

export function typeFill(type) {
  return type && TYPE_VARS[type] ? TYPE_VARS[type] : NEUTRAL_VAR
}

export function typeLabel(type) {
  return (type && TYPE_LABELS[type]) || 'Other'
}

// Classify one raw collector record. Explicit type hints win, then the
// presence of a non-empty sql/http/redis/cache detail array, then keyword
// detection on the class/file/function signature. Returns null when there is
// not even a function name to go on (callers render those neutral).
export function detectOpType(node) {
  if (!node) return null

  const explicit = node.type || node.Type
  if (explicit && TYPE_VARS[String(explicit).toLowerCase()]) {
    return String(explicit).toLowerCase()
  }

  const sql = node.sql_queries || node.SQLQueries || node.sqlQueries
  const http = node.http_requests || node.HttpRequests || node.httpRequests
  const redis = node.redis_operations || node.RedisOperations || node.redisOperations
  const cache = node.cache_operations || node.CacheOperations || node.cacheOperations
  if (Array.isArray(sql) && sql.length > 0) return 'sql'
  if (Array.isArray(http) && http.length > 0) return 'http'
  if (Array.isArray(redis) && redis.length > 0) return 'redis'
  if (Array.isArray(cache) && cache.length > 0) return 'cache'

  const name = node.function || node.Function || node.name
  const haystack = [node.class || node.Class, node.file || node.File, name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (haystack) {
    if (/\bredis\b|predis|phpredis/.test(haystack)) return 'redis'
    if (/cache|memcach/.test(haystack)) return 'cache'
    if (/\bsql\b|pdo|mysqli|doctrine|query|statement|database|\bdbal\b|eloquent/.test(haystack)) return 'sql'
    if (/http|curl|guzzle|\bclient\b|request|fetch|socket|stream_socket/.test(haystack)) return 'http'
  }

  if (!name || name === 'unknown') return null
  return 'function'
}

// function_type column emitted by the PHP extension.
export const FN_KIND_LABELS = { 0: 'User function', 1: 'Internal function', 2: 'Method' }

export function fnKindLabel(t) {
  return FN_KIND_LABELS[t] || 'Unknown'
}
