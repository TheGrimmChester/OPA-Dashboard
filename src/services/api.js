import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const traceApi = {
  // Delete a single trace
  deleteTrace: async (traceId) => {
    const response = await api.delete(`/api/traces/${traceId}`)
    return response.data
  },

  // Batch delete traces
  deleteTraces: async (traceIds) => {
    const response = await api.post('/api/traces/batch-delete', {
      trace_ids: traceIds,
    })
    return response.data
  },

  // Purge all traces
  purgeAllTraces: async () => {
    const response = await api.delete('/api/control/purge')
    return response.data
  },
}

export default api

