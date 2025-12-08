import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

const authApi = {
  login: async (username, password) => {
    const response = await axios.post(`${API_URL}/api/auth/login`, {
      username,
      password,
    })
    return response.data
  },

  register: async (userData) => {
    const response = await axios.post(`${API_URL}/api/auth/register`, userData)
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

  getUsername: () => {
    return localStorage.getItem('username')
  },

  getRole: () => {
    return localStorage.getItem('role')
  },
}

// Add token to requests if available
axios.interceptors.request.use((config) => {
  const token = authApi.getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default authApi

