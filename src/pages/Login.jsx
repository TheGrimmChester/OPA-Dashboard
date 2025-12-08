import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiLogIn, FiUser, FiLock } from 'react-icons/fi'
import axios from 'axios'
import './Login.css'

const API_URL = import.meta.env.VITE_API_URL || ''

function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        username,
        password,
      })

      // Store token
      localStorage.setItem('auth_token', response.data.token)
      localStorage.setItem('username', response.data.username)
      localStorage.setItem('role', response.data.role)

      // Redirect to home
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="Login">
      <div className="login-container">
        <div className="login-header">
          <FiLogIn className="login-icon" />
          <h2>OpenProfilingAgent Login</h2>
        </div>
        
        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="login-error">
              {error}
            </div>
          )}
          
          <div className="form-group">
            <label>
              <FiUser className="input-icon" />
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>
              <FiLock className="input-icon" />
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary btn-block"
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="login-footer">
          <p>Default credentials: admin / admin</p>
        </div>
      </div>
    </div>
  )
}

export default Login

