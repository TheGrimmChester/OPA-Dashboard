import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const statsApi = {
  getStats: async (from, to) => {
    const params = new URLSearchParams()
    if (from) params.append('from', from)
    if (to) params.append('to', to)
    
    const url = `/api/stats${params.toString() ? '?' + params.toString() : ''}`
    const response = await api.get(url)
    return response.data
  },
}

export default statsApi
