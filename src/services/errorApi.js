import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

const errorApi = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const errorService = {
  // List errors
  listErrors: async (params = {}) => {
    const queryParams = new URLSearchParams()
    if (params.service) queryParams.append('service', params.service)
    if (params.from) queryParams.append('from', params.from)
    if (params.to) queryParams.append('to', params.to)
    if (params.limit) queryParams.append('limit', params.limit)
    if (params.offset) queryParams.append('offset', params.offset)
    if (params.sort) queryParams.append('sort', params.sort)
    if (params.order) queryParams.append('order', params.order)

    const response = await errorApi.get(`/api/errors?${queryParams}`)
    return response.data
  },

  // Get error details
  getErrorDetails: async (errorId) => {
    const response = await errorApi.get(`/api/errors/${encodeURIComponent(errorId)}`)
    return response.data
  },
}

export default errorService

