import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

const redisApi = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const redisService = {
  // List Redis operations with stats
  listOperations: async (params = {}) => {
    const queryParams = new URLSearchParams()
    if (params.service) queryParams.append('service', params.service)
    if (params.from) queryParams.append('from', params.from)
    if (params.to) queryParams.append('to', params.to)
    if (params.min_duration) queryParams.append('min_duration', params.min_duration)
    if (params.filter) queryParams.append('filter', params.filter)
    if (params.limit) queryParams.append('limit', params.limit)
    if (params.offset) queryParams.append('offset', params.offset)
    if (params.sort) queryParams.append('sort', params.sort)
    if (params.order) queryParams.append('order', params.order)

    const response = await redisApi.get(`/api/redis/operations?${queryParams}`)
    return response.data
  },
}

export default redisService
