import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

const sqlApi = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const sqlService = {
  // List SQL queries with stats
  listQueries: async (params = {}) => {
    const queryParams = new URLSearchParams()
    if (params.service) queryParams.append('service', params.service)
    if (params.from) queryParams.append('from', params.from)
    if (params.to) queryParams.append('to', params.to)
    if (params.min_duration) queryParams.append('min_duration', params.min_duration)
    if (params.limit) queryParams.append('limit', params.limit)
    if (params.offset) queryParams.append('offset', params.offset)

    const response = await sqlApi.get(`/api/sql/queries?${queryParams}`)
    return response.data
  },

  // Get SQL query details by fingerprint
  getQueryDetails: async (fingerprint) => {
    const response = await sqlApi.get(`/api/sql/queries/${encodeURIComponent(fingerprint)}`)
    return response.data
  },
}

export default sqlService

