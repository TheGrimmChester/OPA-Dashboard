import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

const httpApi = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const httpService = {
  // List HTTP calls with stats
  listHttpCalls: async (params = {}) => {
    const queryParams = new URLSearchParams()
    if (params.service) queryParams.append('service', params.service)
    if (params.from) queryParams.append('from', params.from)
    if (params.to) queryParams.append('to', params.to)
    if (params.limit) queryParams.append('limit', params.limit)
    if (params.offset) queryParams.append('offset', params.offset)
    if (params.filter) queryParams.append('filter', params.filter)
    if (params.sort) queryParams.append('sort', params.sort)
    if (params.order) queryParams.append('order', params.order)

    const response = await httpApi.get(`/api/http-calls?${queryParams}`)
    return response.data
  },
}

export default httpService

