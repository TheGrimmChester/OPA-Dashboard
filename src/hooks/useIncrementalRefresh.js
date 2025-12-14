import { useState, useCallback, useRef } from 'react'

/**
 * Hook for smooth incremental refresh of list data
 * Only updates items that have changed, preserving scroll position and user interactions
 * 
 * @param {Function} fetchFn - Function that fetches data and returns a promise
 * @param {Function} getItemId - Function to extract unique ID from an item
 * @param {Function} getItemTimestamp - Function to extract timestamp from an item (for comparison)
 * @param {Object} options - Options for the hook
 * @returns {Object} - { data, loading, refreshing, error, refresh, reset }
 */
export function useIncrementalRefresh(fetchFn, getItemId, getItemTimestamp, options = {}) {
  const {
    enabled = true,
    refreshInterval = null,
    mergeStrategy = 'replace', // 'replace' or 'merge'
  } = options

  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [lastFetchTime, setLastFetchTime] = useState(null)
  
  const intervalRef = useRef(null)
  const dataMapRef = useRef(new Map()) // Track items by ID for efficient updates

  // Merge new data with existing data
  const mergeData = useCallback((newData, existingData) => {
    if (mergeStrategy === 'replace') {
      return newData
    }

    // Merge strategy: keep existing items, update changed ones, add new ones
    const existingMap = new Map()
    existingData.forEach(item => {
      const id = getItemId(item)
      if (id) {
        existingMap.set(id, item)
      }
    })

    const newMap = new Map()
    newData.forEach(item => {
      const id = getItemId(item)
      if (id) {
        newMap.set(id, item)
      }
    })

    // Start with existing items
    const merged = [...existingData]

    // Update or add items from new data
    newData.forEach(newItem => {
      const id = getItemId(newItem)
      if (!id) return

      const existingItem = existingMap.get(id)
      if (existingItem) {
        // Item exists - check if it changed
        const existingTs = getItemTimestamp(existingItem)
        const newTs = getItemTimestamp(newItem)
        
        if (newTs && existingTs && newTs !== existingTs) {
          // Item changed - update it in place
          const index = merged.findIndex(item => getItemId(item) === id)
          if (index !== -1) {
            merged[index] = newItem
          }
        }
      } else {
        // New item - add it
        merged.push(newItem)
      }
    })

    // Sort merged data by timestamp (descending by default)
    merged.sort((a, b) => {
      const tsA = getItemTimestamp(a)
      const tsB = getItemTimestamp(b)
      if (!tsA && !tsB) return 0
      if (!tsA) return 1
      if (!tsB) return -1
      return tsB.localeCompare(tsA) // Descending order
    })

    return merged
  }, [mergeStrategy, getItemId, getItemTimestamp])

  const refresh = useCallback(async (isIncremental = false) => {
    if (!enabled) return

    if (isIncremental) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)

    try {
      const newData = await fetchFn()
      
      setData(prevData => {
        if (isIncremental && prevData.length > 0) {
          return mergeData(newData, prevData)
        }
        return newData
      })
      
      setLastFetchTime(Date.now())
      dataMapRef.current.clear()
      newData.forEach(item => {
        const id = getItemId(item)
        if (id) {
          dataMapRef.current.set(id, item)
        }
      })
    } catch (err) {
      console.error('Refresh error:', err)
      setError(err.message || 'Failed to refresh data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [fetchFn, enabled, mergeData, getItemId])

  const reset = useCallback(() => {
    setData([])
    setError(null)
    setLastFetchTime(null)
    dataMapRef.current.clear()
  }, [])

  // Set up auto-refresh interval
  useEffect(() => {
    if (!enabled || !refreshInterval) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    // Initial fetch
    refresh(false)

    // Set up interval for incremental refreshes
    intervalRef.current = setInterval(() => {
      refresh(true)
    }, refreshInterval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [enabled, refreshInterval, refresh])

  return {
    data,
    loading,
    refreshing,
    error,
    refresh,
    reset,
    lastFetchTime,
  }
}
