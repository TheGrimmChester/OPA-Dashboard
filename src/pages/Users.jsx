import React, { useState, useEffect } from 'react'
import { FiUsers, FiTrash2, FiUserPlus, FiRefreshCw } from 'react-icons/fi'
import axios from 'axios'
import './Users.css'

const API_URL = import.meta.env.VITE_API_URL || ''
const ROLES = ['viewer', 'editor', 'admin']

// Admin RBAC page: list users, change roles, create and delete users.
// Backed by /api/users (admin-gated when OPA_AUTH_REQUIRED=1).
function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'viewer' })
  const [busy, setBusy] = useState(false)

  const authHeaders = () => {
    const token = localStorage.getItem('auth_token')
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const load = async () => {
    setLoading(true)
    try {
      const r = await axios.get(`${API_URL}/api/users`, { headers: authHeaders() })
      setUsers(r.data?.users || [])
      setError('')
    } catch (e) {
      setError(e.response?.status === 403 ? 'Admin role required to manage users.' : (e.message || 'Failed to load users'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const changeRole = async (username, role) => {
    try {
      await axios.put(`${API_URL}/api/users`, { username, role }, { headers: authHeaders() })
      setUsers((us) => us.map((u) => (u.username === username ? { ...u, role } : u)))
    } catch (e) {
      setError(e.response?.data || e.message || 'Failed to update role')
    }
  }

  const removeUser = async (username) => {
    if (!window.confirm(`Delete user "${username}"?`)) return
    try {
      await axios.delete(`${API_URL}/api/users/${encodeURIComponent(username)}`, { headers: authHeaders() })
      setUsers((us) => us.filter((u) => u.username !== username))
    } catch (e) {
      setError(e.response?.data || e.message || 'Failed to delete user')
    }
  }

  const createUser = async (e) => {
    e.preventDefault()
    if (!form.username || !form.password) return
    setBusy(true)
    try {
      await axios.post(`${API_URL}/api/users`, form, { headers: authHeaders() })
      setForm({ username: '', email: '', password: '', role: 'viewer' })
      await load()
    } catch (e) {
      setError(e.response?.data || e.message || 'Failed to create user')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="users-page">
      <div className="users-header">
        <h2><FiUsers /> Users &amp; Roles</h2>
        <button className="users-refresh" onClick={load} title="Refresh"><FiRefreshCw /></button>
      </div>

      {error && <div className="users-error">{String(error)}</div>}

      <form className="users-create" onSubmit={createUser}>
        <input placeholder="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        <input placeholder="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input type="password" placeholder="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button type="submit" className="btn-add" disabled={busy}><FiUserPlus /> Add user</button>
      </form>

      {loading ? (
        <div className="users-loading">Loading users…</div>
      ) : (
        <table className="users-table">
          <thead>
            <tr><th>Username</th><th>Email</th><th>Role</th><th>Last login</th><th></th></tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={5} className="users-empty">No users.</td></tr>
            ) : users.map((u) => (
              <tr key={u.username}>
                <td className="users-name">{u.username}</td>
                <td>{u.email || '—'}</td>
                <td>
                  <select value={u.role} onChange={(e) => changeRole(u.username, e.target.value)}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td>{u.last_login || '—'}</td>
                <td><button className="users-del" onClick={() => removeUser(u.username)} title="Delete user"><FiTrash2 /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default Users
