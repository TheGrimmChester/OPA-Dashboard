import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

// Single shared axios instance used for all authenticated app requests. The
// Bearer interceptor is attached to THIS instance only (not the global axios),
// so the token is never automatically added to unrelated / cross-origin
// requests. baseURL is same-origin (empty by default) which keeps the token
// scoped to our own backend.
const apiClient = axios.create({
  baseURL: API_URL,
})

const authApi = {
  login: async (username, password) => {
    const response = await apiClient.post(`/api/auth/login`, {
      username,
      password,
    })
    return response.data
  },

  register: async (userData) => {
    const response = await apiClient.post(`/api/auth/register`, userData)
    return response.data
  },

  logout: () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('username')
    localStorage.removeItem('role')
  },

  getToken: () => {
    return localStorage.getItem('auth_token')
  },

  isAuthenticated: () => {
    return !!localStorage.getItem('auth_token')
  },

  // NOTE: username/role stored in localStorage are DISPLAY-ONLY and untrusted.
  // They can be tampered with client-side and must never be used for access
  // control decisions. Authorization is enforced server-side on every request.
  getUsername: () => {
    return localStorage.getItem('username')
  },

  getRole: () => {
    return localStorage.getItem('role')
  },
}

// Add token to requests if available. Attached to the shared instance ONLY so
// the Bearer token is never sent on the global axios (cross-origin) requests.
apiClient.interceptors.request.use((config) => {
  const token = authApi.getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export { apiClient }
export default authApi
