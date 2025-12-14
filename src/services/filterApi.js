import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

const filterApi = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

/**
 * Get filter key suggestions
 * @param {string} prefix - Optional prefix to filter keys
 * @param {string} context - Optional context (e.g., 'http', 'sql', 'tags')
 */
export const getFilterKeySuggestions = async (prefix = '', context = '') => {
  const params = new URLSearchParams()
  if (prefix) params.append('prefix', prefix)
  if (context) params.append('context', context)

  try {
    const response = await filterApi.get(`/api/filter-suggestions/keys?${params}`)
    return response.data.keys || []
  } catch (error) {
    console.error('Error fetching filter key suggestions:', error)
    return []
  }
}

/**
 * Get filter value suggestions for a given key
 * @param {string} key - The filter key (e.g., 'service', 'http.method', 'tags.http_request.status_code')
 * @param {string} prefix - Optional prefix to filter values
 * @param {number} limit - Maximum number of suggestions to return
 */
export const getFilterValueSuggestions = async (key, prefix = '', limit = 50) => {
  const params = new URLSearchParams()
  params.append('key', key)
  if (prefix) params.append('prefix', prefix)
  params.append('limit', limit.toString())

  try {
    const response = await filterApi.get(`/api/filter-suggestions/values?${params}`)
    return response.data.values || []
  } catch (error) {
    console.error('Error fetching filter value suggestions:', error)
    return []
  }
}

/**
 * Get all available filter keys with metadata
 */
export const getAllFilterKeys = async () => {
  try {
    const response = await filterApi.get('/api/filter-suggestions/keys')
    return response.data.keys || []
  } catch (error) {
    console.error('Error fetching all filter keys:', error)
    return []
  }
}

export default {
  getFilterKeySuggestions,
  getFilterValueSuggestions,
  getAllFilterKeys
}

