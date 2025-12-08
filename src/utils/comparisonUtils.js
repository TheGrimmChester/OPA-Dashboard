// Utility functions for trace comparison

// Format percentage differences with +/- signs
export function formatPercentageDiff(diff) {
  if (diff === 0 || (isNaN(diff) && !isFinite(diff))) return '0%'
  const sign = diff > 0 ? '+' : ''
  return `${sign}${diff.toFixed(1)}%`
}

// Determine if change is improvement/degradation/no-change
export function getChangeType(diff, threshold = 5) {
  if (Math.abs(diff) < threshold) return 'no-change'
  return diff > 0 ? 'degradation' : 'improvement'
}

// Calculate cache/Redis hit rates
export function calculateHitRate(operations) {
  if (!operations || operations.length === 0) return { hitRate: 0, hits: 0, misses: 0, total: 0 }
  
  let hits = 0
  let misses = 0
  
  operations.forEach(op => {
    const hit = op.operation?.hit !== undefined ? op.operation.hit : op.hit
    if (hit === true) hits++
    else if (hit === false) misses++
  })
  
  const total = hits + misses
  const hitRate = total > 0 ? (hits / total) * 100 : 0
  
  return { hitRate, hits, misses, total }
}

// Group SQL queries by fingerprint (simplified - use query text as fingerprint)
export function groupByFingerprint(queries) {
  const grouped = new Map()
  
  queries.forEach(item => {
    const query = item.query || item
    const queryText = typeof query === 'string' ? query : (query.query || query.sql || JSON.stringify(query))
    const fingerprint = queryText.trim().substring(0, 100) // Use first 100 chars as fingerprint
    
    if (!grouped.has(fingerprint)) {
      grouped.set(fingerprint, {
        fingerprint,
        queryText: queryText.length > 200 ? queryText.substring(0, 200) + '...' : queryText,
        count: 0,
        totalDuration: 0,
        queries: []
      })
    }
    
    const group = grouped.get(fingerprint)
    group.count++
    const duration = query.duration_ms || query.duration || 0
    group.totalDuration += duration
    group.queries.push(item)
  })
  
  return Array.from(grouped.values())
}

// Normalize URLs for comparison (remove query params, etc.)
export function normalizeUrl(url) {
  if (!url) return ''
  try {
    const urlObj = new URL(url)
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`
  } catch {
    // If URL parsing fails, try to extract path
    const match = url.match(/https?:\/\/[^\/]+(\/[^?]*)/)
    return match ? match[1] : url
  }
}

// Extract SQL queries from trace
export function extractSqlQueries(trace) {
  if (!trace || !trace.spans) return []
  
  const allSqlQueries = []
  
  const collectSQLFromStack = (stack) => {
    if (!Array.isArray(stack)) return []
    const queries = []
    stack.forEach(node => {
      if (node.sql_queries && Array.isArray(node.sql_queries) && node.sql_queries.length > 0) {
        queries.push(...node.sql_queries)
      }
      if (node.SQLQueries && Array.isArray(node.SQLQueries) && node.SQLQueries.length > 0) {
        queries.push(...node.SQLQueries)
      }
      if (node.children && Array.isArray(node.children) && node.children.length > 0) {
        queries.push(...collectSQLFromStack(node.children))
      }
    })
    return queries
  }
  
  const collectSql = (spans) => {
    spans.forEach(span => {
      if (span.sql && Array.isArray(span.sql) && span.sql.length > 0) {
        span.sql.forEach(query => {
          allSqlQueries.push({
            span: span.name,
            spanId: span.span_id,
            query: query,
          })
        })
      }
      
      const stackData = span.stack_flat && Array.isArray(span.stack_flat) && span.stack_flat.length > 0
        ? span.stack_flat
        : (span.stack && Array.isArray(span.stack) && span.stack.length > 0 ? span.stack : null)
      
      if (stackData) {
        const stackQueries = collectSQLFromStack(stackData)
        stackQueries.forEach(query => {
          allSqlQueries.push({
            span: span.name,
            spanId: span.span_id,
            query: query,
          })
        })
      }
      
      if (span.children) {
        collectSql(span.children)
      }
    })
  }
  
  if (trace.spans) {
    collectSql(trace.spans)
  }
  
  return allSqlQueries
}

// Extract HTTP requests from trace
export function extractHttpRequests(trace) {
  if (!trace || !trace.spans) return []
  
  const allNetworkRequests = []
  
  const collectHTTPFromStack = (stack) => {
    if (!Array.isArray(stack)) return []
    const requests = []
    stack.forEach(node => {
      if (node.http_requests && Array.isArray(node.http_requests) && node.http_requests.length > 0) {
        requests.push(...node.http_requests)
      }
      if (node.HttpRequests && Array.isArray(node.HttpRequests) && node.HttpRequests.length > 0) {
        requests.push(...node.HttpRequests)
      }
      if (node.children && Array.isArray(node.children) && node.children.length > 0) {
        requests.push(...collectHTTPFromStack(node.children))
      }
    })
    return requests
  }
  
  const collectNetwork = (spans) => {
    spans.forEach(span => {
      if (span.net && typeof span.net === 'object' && Object.keys(span.net).length > 0) {
        allNetworkRequests.push({
          span: span.name,
          spanId: span.span_id,
          net: span.net,
          type: 'legacy',
        })
      }
      
      const stackData = span.stack_flat && Array.isArray(span.stack_flat) && span.stack_flat.length > 0
        ? span.stack_flat
        : (span.stack && Array.isArray(span.stack) && span.stack.length > 0 ? span.stack : null)
      
      if (stackData) {
        const stackRequests = collectHTTPFromStack(stackData)
        stackRequests.forEach(request => {
          allNetworkRequests.push({
            span: span.name,
            spanId: span.span_id,
            request: request,
            type: 'http',
          })
        })
      }
      
      if (span.children) {
        collectNetwork(span.children)
      }
    })
  }
  
  if (trace.spans) {
    collectNetwork(trace.spans)
  }
  
  return allNetworkRequests.filter(r => r.type === 'http' && r.request)
}

// Extract cache operations from trace
export function extractCacheOperations(trace) {
  if (!trace || !trace.spans) return []
  
  const allCacheOperations = []
  
  const collectCacheFromStack = (stack) => {
    if (!Array.isArray(stack)) return []
    const operations = []
    stack.forEach(node => {
      if (node.cache_operations && Array.isArray(node.cache_operations) && node.cache_operations.length > 0) {
        operations.push(...node.cache_operations)
      }
      if (node.CacheOperations && Array.isArray(node.CacheOperations) && node.CacheOperations.length > 0) {
        operations.push(...node.CacheOperations)
      }
      if (node.children && Array.isArray(node.children) && node.children.length > 0) {
        operations.push(...collectCacheFromStack(node.children))
      }
    })
    return operations
  }
  
  const collectCache = (spans) => {
    spans.forEach(span => {
      const stackData = span.stack_flat && Array.isArray(span.stack_flat) && span.stack_flat.length > 0
        ? span.stack_flat
        : (span.stack && Array.isArray(span.stack) && span.stack.length > 0 ? span.stack : null)
      
      if (stackData) {
        const stackOps = collectCacheFromStack(stackData)
        stackOps.forEach(op => {
          allCacheOperations.push({
            span: span.name,
            spanId: span.span_id,
            operation: op,
          })
        })
      }
      
      if (span.children) {
        collectCache(span.children)
      }
    })
  }
  
  if (trace.spans) {
    collectCache(trace.spans)
  }
  
  return allCacheOperations
}

// Extract Redis operations from trace
export function extractRedisOperations(trace) {
  if (!trace || !trace.spans) return []
  
  const allRedisOperations = []
  
  const collectRedisFromStack = (stack) => {
    if (!Array.isArray(stack)) return []
    const operations = []
    stack.forEach(node => {
      if (node.redis_operations && Array.isArray(node.redis_operations) && node.redis_operations.length > 0) {
        operations.push(...node.redis_operations)
      }
      if (node.RedisOperations && Array.isArray(node.RedisOperations) && node.RedisOperations.length > 0) {
        operations.push(...node.RedisOperations)
      }
      if (node.children && Array.isArray(node.children) && node.children.length > 0) {
        operations.push(...collectRedisFromStack(node.children))
      }
    })
    return operations
  }
  
  const collectRedis = (spans) => {
    spans.forEach(span => {
      const stackData = span.stack_flat && Array.isArray(span.stack_flat) && span.stack_flat.length > 0
        ? span.stack_flat
        : (span.stack && Array.isArray(span.stack) && span.stack.length > 0 ? span.stack : null)
      
      if (stackData) {
        const stackOps = collectRedisFromStack(stackData)
        stackOps.forEach(op => {
          allRedisOperations.push({
            span: span.name,
            spanId: span.span_id,
            operation: op,
          })
        })
      }
      
      if (span.children) {
        collectRedis(span.children)
      }
    })
  }
  
  if (trace.spans) {
    collectRedis(trace.spans)
  }
  
  return allRedisOperations
}

// Extract stack traces from trace
export function extractStackTraces(trace) {
  if (!trace || !trace.spans) return []
  
  const allStackTraces = []
  
  const flattenStackRecursive = (stack) => {
    if (!Array.isArray(stack)) return []
    const flat = []
    const flatten = (nodes) => {
      nodes.forEach(node => {
        flat.push(node)
        if (node.children && Array.isArray(node.children) && node.children.length > 0) {
          flatten(node.children)
        }
      })
    }
    flatten(stack)
    return flat
  }
  
  const collectStacks = (spans) => {
    spans.forEach(span => {
      const stackData = span.stack_flat && Array.isArray(span.stack_flat) && span.stack_flat.length > 0
        ? span.stack_flat
        : (span.stack && Array.isArray(span.stack) && span.stack.length > 0 ? span.stack : null)
      
      if (stackData) {
        const flatStack = span.stack_flat || flattenStackRecursive(span.stack)
        allStackTraces.push({
          span: span.name,
          spanId: span.span_id,
          stack: flatStack,
        })
      }
      if (span.children) {
        collectStacks(span.children)
      }
    })
  }
  
  if (trace.spans) {
    collectStacks(trace.spans)
  }
  
  return allStackTraces
}

// Extract tags from trace
export function extractTags(trace) {
  if (!trace || !trace.spans) return []
  
  const allTags = []
  
  const collectTags = (spans) => {
    spans.forEach(span => {
      if (span.tags && typeof span.tags === 'object' && Object.keys(span.tags).length > 0) {
        allTags.push({
          span: span.name,
          spanId: span.span_id,
          tags: span.tags,
        })
      }
      if (span.children) {
        collectTags(span.children)
      }
    })
  }
  
  if (trace.spans) {
    collectTags(trace.spans)
  }
  
  return allTags
}

// Extract dumps from trace
export function extractDumps(trace) {
  if (!trace || !trace.spans) return []
  
  const allDumps = []
  
  const collectDumps = (spans) => {
    spans.forEach(span => {
      if (span.dumps && Array.isArray(span.dumps) && span.dumps.length > 0) {
        allDumps.push({
          span: span.name,
          spanId: span.span_id,
          dumps: span.dumps,
        })
      }
      if (span.children) {
        collectDumps(span.children)
      }
    })
  }
  
  if (trace.spans) {
    collectDumps(trace.spans)
  }
  
  return allDumps
}

// Calculate overall metrics from trace
export function calculateOverallMetrics(trace) {
  if (!trace || !trace.spans || trace.spans.length === 0) {
    return {
      duration: 0,
      cpu: 0,
      memory: 0,
      networkSent: 0,
      networkReceived: 0,
      spans: 0,
      sqlQueries: 0,
      httpRequests: 0,
      cacheOperations: 0,
      redisOperations: 0,
      stackTraces: 0,
      tags: 0,
    }
  }
  
  const rootSpan = trace.spans.find(s => !s.parent_id) || trace.spans[0]
  
  // Calculate network bytes from call stack
  let networkSent = 0
  let networkReceived = 0
  let memoryDelta = 0
  
  const collectNetworkFromStack = (stack) => {
    if (!Array.isArray(stack)) return
    stack.forEach(node => {
      networkSent += node.network_bytes_sent || node.NetworkBytesSent || 0
      networkReceived += node.network_bytes_received || node.NetworkBytesReceived || 0
      memoryDelta += node.memory_delta || node.MemoryDelta || 0
      if (node.children && Array.isArray(node.children) && node.children.length > 0) {
        collectNetworkFromStack(node.children)
      }
    })
  }
  
  if (rootSpan?.stack) {
    collectNetworkFromStack(rootSpan.stack)
  }
  
  // Also check span.net for legacy format
  if (rootSpan?.net) {
    networkSent += rootSpan.net.bytes_sent || 0
    networkReceived += rootSpan.net.bytes_received || 0
  }
  
  const sqlQueries = extractSqlQueries(trace)
  const httpRequests = extractHttpRequests(trace)
  const cacheOperations = extractCacheOperations(trace)
  const redisOperations = extractRedisOperations(trace)
  const stackTraces = extractStackTraces(trace)
  const tags = extractTags(trace)
  
  return {
    duration: rootSpan.duration_ms || 0,
    cpu: rootSpan.cpu_ms || 0,
    memory: Math.abs(memoryDelta),
    networkSent,
    networkReceived,
    spans: trace.spans.length,
    sqlQueries: sqlQueries.length,
    httpRequests: httpRequests.length,
    cacheOperations: cacheOperations.length,
    redisOperations: redisOperations.length,
    stackTraces: stackTraces.length,
    tags: tags.length,
  }
}

// Compare two metrics and return difference
export function compareMetrics(metric1, metric2) {
  if (metric1 === 0 && metric2 === 0) {
    return { old: 0, new: 0, diff: 0, changeType: 'no-change' }
  }
  
  const diff = metric1 > 0 ? ((metric2 - metric1) / metric1) * 100 : (metric2 > 0 ? 100 : 0)
  const changeType = getChangeType(diff)
  
  return { old: metric1, new: metric2, diff, changeType }
}

// Compare SQL queries
export function compareSqlQueries(queries1, queries2) {
  const grouped1 = groupByFingerprint(queries1)
  const grouped2 = groupByFingerprint(queries2)
  
  const fingerprintMap = new Map()
  
  // Index queries from trace 1
  grouped1.forEach(group => {
    fingerprintMap.set(group.fingerprint, { trace1: group, trace2: null })
  })
  
  // Add queries from trace 2
  grouped2.forEach(group => {
    if (fingerprintMap.has(group.fingerprint)) {
      fingerprintMap.get(group.fingerprint).trace2 = group
    } else {
      fingerprintMap.set(group.fingerprint, { trace1: null, trace2: group })
    }
  })
  
  const comparison = Array.from(fingerprintMap.values()).map(({ trace1, trace2 }) => {
    const count1 = trace1?.count || 0
    const count2 = trace2?.count || 0
    const duration1 = trace1?.totalDuration || 0
    const duration2 = trace2?.totalDuration || 0
    
    const countDiff = compareMetrics(count1, count2)
    const durationDiff = compareMetrics(duration1, duration2)
    
    return {
      fingerprint: trace1?.fingerprint || trace2?.fingerprint,
      queryText: trace1?.queryText || trace2?.queryText,
      count1,
      count2,
      countDiff,
      duration1,
      duration2,
      durationDiff,
      existsInBoth: trace1 !== null && trace2 !== null,
    }
  })
  
  return {
    total1: queries1.length,
    total2: queries2.length,
    totalDiff: compareMetrics(queries1.length, queries2.length),
    unique1: grouped1.length,
    unique2: grouped2.length,
    uniqueDiff: compareMetrics(grouped1.length, grouped2.length),
    comparison,
  }
}

// Compare HTTP requests
export function compareHttpRequests(requests1, requests2) {
  const normalizeRequest = (req) => {
    const url = req.request?.url || req.url || ''
    return normalizeUrl(url)
  }
  
  const groupByUrl = (requests) => {
    const grouped = new Map()
    requests.forEach(req => {
      const normalized = normalizeRequest(req)
      if (!grouped.has(normalized)) {
        grouped.set(normalized, {
          url: normalized,
          count: 0,
          totalDuration: 0,
          statusCodes: new Map(),
          totalBytesSent: 0,
          totalBytesReceived: 0,
          requests: [],
        })
      }
      const group = grouped.get(normalized)
      group.count++
      const duration = req.request?.duration_ms || req.duration_ms || 0
      group.totalDuration += duration
      const statusCode = req.request?.status_code || req.status_code || 0
      group.statusCodes.set(statusCode, (group.statusCodes.get(statusCode) || 0) + 1)
      group.totalBytesSent += req.request?.bytes_sent || req.bytes_sent || 0
      group.totalBytesReceived += req.request?.bytes_received || req.bytes_received || 0
      group.requests.push(req)
    })
    return grouped
  }
  
  const grouped1 = groupByUrl(requests1)
  const grouped2 = groupByUrl(requests2)
  
  const urlMap = new Map()
  
  grouped1.forEach((group, url) => {
    urlMap.set(url, { trace1: group, trace2: null })
  })
  
  grouped2.forEach((group, url) => {
    if (urlMap.has(url)) {
      urlMap.get(url).trace2 = group
    } else {
      urlMap.set(url, { trace1: null, trace2: group })
    }
  })
  
  const comparison = Array.from(urlMap.values()).map(({ trace1, trace2 }) => {
    const count1 = trace1?.count || 0
    const count2 = trace2?.count || 0
    const duration1 = trace1?.totalDuration || 0
    const duration2 = trace2?.totalDuration || 0
    const bytesSent1 = trace1?.totalBytesSent || 0
    const bytesSent2 = trace2?.totalBytesSent || 0
    const bytesReceived1 = trace1?.totalBytesReceived || 0
    const bytesReceived2 = trace2?.totalBytesReceived || 0
    
    return {
      url: trace1?.url || trace2?.url,
      count1,
      count2,
      countDiff: compareMetrics(count1, count2),
      duration1,
      duration2,
      durationDiff: compareMetrics(duration1, duration2),
      bytesSent1,
      bytesSent2,
      bytesSentDiff: compareMetrics(bytesSent1, bytesSent2),
      bytesReceived1,
      bytesReceived2,
      bytesReceivedDiff: compareMetrics(bytesReceived1, bytesReceived2),
      statusCodes1: trace1 ? Object.fromEntries(trace1.statusCodes) : {},
      statusCodes2: trace2 ? Object.fromEntries(trace2.statusCodes) : {},
      existsInBoth: trace1 !== null && trace2 !== null,
    }
  })
  
  return {
    total1: requests1.length,
    total2: requests2.length,
    totalDiff: compareMetrics(requests1.length, requests2.length),
    comparison,
  }
}

// Compare cache operations
export function compareCacheOperations(ops1, ops2) {
  const hitRate1 = calculateHitRate(ops1)
  const hitRate2 = calculateHitRate(ops2)
  
  const groupByOperation = (ops) => {
    const grouped = new Map()
    ops.forEach(op => {
      const operation = op.operation || op
      const opType = operation.operation || operation.type || 'unknown'
      if (!grouped.has(opType)) {
        grouped.set(opType, {
          type: opType,
          count: 0,
          hits: 0,
          misses: 0,
          totalDuration: 0,
        })
      }
      const group = grouped.get(opType)
      group.count++
      const hit = operation.hit !== undefined ? operation.hit : null
      if (hit === true) group.hits++
      else if (hit === false) group.misses++
      group.totalDuration += operation.duration_ms || operation.duration || 0
    })
    return grouped
  }
  
  const grouped1 = groupByOperation(ops1)
  const grouped2 = groupByOperation(ops2)
  
  const opTypeMap = new Map()
  
  grouped1.forEach((group, type) => {
    opTypeMap.set(type, { trace1: group, trace2: null })
  })
  
  grouped2.forEach((group, type) => {
    if (opTypeMap.has(type)) {
      opTypeMap.get(type).trace2 = group
    } else {
      opTypeMap.set(type, { trace1: null, trace2: group })
    }
  })
  
  const comparison = Array.from(opTypeMap.values()).map(({ trace1, trace2 }) => {
    const count1 = trace1?.count || 0
    const count2 = trace2?.count || 0
    const hits1 = trace1?.hits || 0
    const hits2 = trace2?.hits || 0
    const misses1 = trace1?.misses || 0
    const misses2 = trace2?.misses || 0
    const duration1 = trace1?.totalDuration || 0
    const duration2 = trace2?.totalDuration || 0
    
    return {
      type: trace1?.type || trace2?.type,
      count1,
      count2,
      countDiff: compareMetrics(count1, count2),
      hits1,
      hits2,
      hitsDiff: compareMetrics(hits1, hits2),
      misses1,
      misses2,
      missesDiff: compareMetrics(misses1, misses2),
      duration1,
      duration2,
      durationDiff: compareMetrics(duration1, duration2),
      existsInBoth: trace1 !== null && trace2 !== null,
    }
  })
  
  return {
    total1: ops1.length,
    total2: ops2.length,
    totalDiff: compareMetrics(ops1.length, ops2.length),
    hitRate1: hitRate1.hitRate,
    hitRate2: hitRate2.hitRate,
    hitRateDiff: compareMetrics(hitRate1.hitRate, hitRate2.hitRate),
    comparison,
  }
}

// Compare Redis operations
export function compareRedisOperations(ops1, ops2) {
  const hitRate1 = calculateHitRate(ops1)
  const hitRate2 = calculateHitRate(ops2)
  
  const groupByCommand = (ops) => {
    const grouped = new Map()
    ops.forEach(op => {
      const operation = op.operation || op
      const command = operation.command || operation.cmd || 'unknown'
      if (!grouped.has(command)) {
        grouped.set(command, {
          command,
          count: 0,
          hits: 0,
          misses: 0,
          totalDuration: 0,
        })
      }
      const group = grouped.get(command)
      group.count++
      const hit = operation.hit !== undefined ? operation.hit : null
      if (hit === true) group.hits++
      else if (hit === false) group.misses++
      group.totalDuration += operation.duration_ms || operation.duration || 0
    })
    return grouped
  }
  
  const grouped1 = groupByCommand(ops1)
  const grouped2 = groupByCommand(ops2)
  
  const commandMap = new Map()
  
  grouped1.forEach((group, command) => {
    commandMap.set(command, { trace1: group, trace2: null })
  })
  
  grouped2.forEach((group, command) => {
    if (commandMap.has(command)) {
      commandMap.get(command).trace2 = group
    } else {
      commandMap.set(command, { trace1: null, trace2: group })
    }
  })
  
  const comparison = Array.from(commandMap.values()).map(({ trace1, trace2 }) => {
    const count1 = trace1?.count || 0
    const count2 = trace2?.count || 0
    const hits1 = trace1?.hits || 0
    const hits2 = trace2?.hits || 0
    const misses1 = trace1?.misses || 0
    const misses2 = trace2?.misses || 0
    const duration1 = trace1?.totalDuration || 0
    const duration2 = trace2?.totalDuration || 0
    
    return {
      command: trace1?.command || trace2?.command,
      count1,
      count2,
      countDiff: compareMetrics(count1, count2),
      hits1,
      hits2,
      hitsDiff: compareMetrics(hits1, hits2),
      misses1,
      misses2,
      missesDiff: compareMetrics(misses1, misses2),
      duration1,
      duration2,
      durationDiff: compareMetrics(duration1, duration2),
      existsInBoth: trace1 !== null && trace2 !== null,
    }
  })
  
  return {
    total1: ops1.length,
    total2: ops2.length,
    totalDiff: compareMetrics(ops1.length, ops2.length),
    hitRate1: hitRate1.hitRate,
    hitRate2: hitRate2.hitRate,
    hitRateDiff: compareMetrics(hitRate1.hitRate, hitRate2.hitRate),
    comparison,
  }
}

// Compare tags
export function compareTags(tags1, tags2) {
  const collectAllTags = (tagItems) => {
    const allTags = new Map()
    tagItems.forEach(item => {
      Object.entries(item.tags || {}).forEach(([key, value]) => {
        if (!allTags.has(key)) {
          allTags.set(key, new Set())
        }
        allTags.get(key).add(String(value))
      })
    })
    return allTags
  }
  
  const tagsMap1 = collectAllTags(tags1)
  const tagsMap2 = collectAllTags(tags2)
  
  const allKeys = new Set([...tagsMap1.keys(), ...tagsMap2.keys()])
  
  const comparison = Array.from(allKeys).map(key => {
    const values1 = tagsMap1.get(key) || new Set()
    const values2 = tagsMap2.get(key) || new Set()
    
    return {
      key,
      values1: Array.from(values1),
      values2: Array.from(values2),
      count1: values1.size,
      count2: values2.size,
      countDiff: compareMetrics(values1.size, values2.size),
      existsInBoth: values1.size > 0 && values2.size > 0,
      isEqual: values1.size === values2.size && 
               Array.from(values1).every(v => values2.has(v)) &&
               Array.from(values2).every(v => values1.has(v)),
    }
  })
  
  return {
    total1: tags1.length,
    total2: tags2.length,
    totalDiff: compareMetrics(tags1.length, tags2.length),
    uniqueKeys1: tagsMap1.size,
    uniqueKeys2: tagsMap2.size,
    uniqueKeysDiff: compareMetrics(tagsMap1.size, tagsMap2.size),
    comparison,
  }
}

