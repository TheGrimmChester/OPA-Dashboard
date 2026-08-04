import React, { useState } from 'react'
import axios from 'axios'
import { FiUsers, FiUserPlus, FiTrash2, FiRefreshCw, FiShield, FiEdit3, FiEye } from 'react-icons/fi'
import { useApi } from '../hooks/useApi'
import { Panel, KpiTile, DataTable, StatusPill } from '../components/ui'
import { fmtNum, fmtAgo } from '../theme/format'
import './Users.css'

const API_URL = import.meta.env.VITE_API_URL || ''
const ROLES = ['viewer', 'editor', 'admin']

// admin -> elevated privilege (notable), editor -> active, viewer -> neutral.
const ROLE_TONE = { admin: 'warn', editor: 'ok', viewer: 'neutral' }

// Surface the friendly admin-only message for permission failures, otherwise the raw error.
function loadMessage(err) {
  if (!err) return ''
  const s = String(err.error || err.message || err)
  if (/403|forbidden|admin|permission/i.test(s)) return 'Admin role required to manage users.'
  return s
}

// Admin RBAC page: list users, change roles, create and delete users.
// Backed by /api/users (admin-gated when OPA_AUTH_REQUIRED=1). The global axios
// request interceptor (src/main.jsx) attaches the bearer token automatically.
export default function Users() {
  const q = useApi('/api/users', {}, { noRange: true })
  const users = q.data?.users || []

  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'viewer' })
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  const counts = ROLES.reduce((acc, r) => ({ ...acc, [r]: users.filter((u) => u.role === r).length }), {})

  const changeRole = async (username, role) => {
    setActionError('')
    try {
      await axios.put(`${API_URL}/api/users`, { username, role })
      q.reload()
    } catch (e) {
      setActionError(e.response?.data?.error || e.response?.data || e.message || 'Failed to update role')
    }
  }

  const removeUser = async (username) => {
    if (!window.confirm(`Delete user "${username}"?`)) return
    setActionError('')
    try {
      await axios.delete(`${API_URL}/api/users/${encodeURIComponent(username)}`)
      q.reload()
    } catch (e) {
      setActionError(e.response?.data?.error || e.response?.data || e.message || 'Failed to delete user')
    }
  }

  const createUser = async (e) => {
    e.preventDefault()
    if (!form.username || !form.password) return
    setBusy(true)
    setActionError('')
    try {
      await axios.post(`${API_URL}/api/users`, form)
      setForm({ username: '', email: '', password: '', role: 'viewer' })
      q.reload()
    } catch (e) {
      setActionError(e.response?.data?.error || e.response?.data || e.message || 'Failed to create user')
    } finally {
      setBusy(false)
    }
  }

  const columns = [
    { key: 'username', header: 'Username', mono: true, render: (u) => <span className="cell-strong oui-mono">{u.username}</span>, sortValue: (u) => u.username },
    { key: 'email', header: 'Email', render: (u) => u.email || <span className="oui-text-muted">—</span>, sortValue: (u) => u.email || '' },
    { key: 'role', header: 'Role', sortValue: (u) => u.role, render: (u) => (
      <div className="oui-row">
        <StatusPill tone={ROLE_TONE[u.role] || 'neutral'}>{u.role}</StatusPill>
        <select
          className="users-role-select"
          value={u.role}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => changeRole(u.username, e.target.value)}
          title="Change role"
        >
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
    ) },
    { key: 'last_login', header: 'Last login', num: true, sortValue: (u) => (u.last_login ? Date.parse(u.last_login) || 0 : 0), render: (u) => fmtAgo(u.last_login) },
    { key: 'created_at', header: 'Created', num: true, sortValue: (u) => (u.created_at ? Date.parse(u.created_at) || 0 : 0), render: (u) => fmtAgo(u.created_at) },
    { key: 'actions', header: '', sortable: false, align: 'right', render: (u) => (
      <button className="users-icon-btn" title="Delete user" onClick={(e) => { e.stopPropagation(); removeUser(u.username) }}><FiTrash2 size={14} /></button>
    ) },
  ]

  return (
    <div className="oui-stack">
      <div className="opa-page-head">
        <div>
          <h1 className="opa-page-title">Users &amp; Roles</h1>
          <div className="opa-page-sub">{fmtNum(users.length)} user{users.length === 1 ? '' : 's'} across {ROLES.length} roles</div>
        </div>
        <div className="oui-row">
          <button className="users-icon-btn" style={{ color: 'var(--text-secondary)' }} onClick={() => q.reload()} title="Refresh"><FiRefreshCw size={15} /></button>
        </div>
      </div>

      {actionError && <div className="opa-errstate">{String(actionError)}</div>}

      {/* Role distribution KPIs */}
      <div className="opa-grid cols-4">
        <KpiTile label="Total users" icon={<FiUsers size={12} />} value={fmtNum(users.length)} status="neutral" />
        <KpiTile label="Admins" icon={<FiShield size={12} />} value={fmtNum(counts.admin || 0)} status={counts.admin ? 'warn' : 'neutral'} />
        <KpiTile label="Editors" icon={<FiEdit3 size={12} />} value={fmtNum(counts.editor || 0)} status="ok" />
        <KpiTile label="Viewers" icon={<FiEye size={12} />} value={fmtNum(counts.viewer || 0)} status="neutral" />
      </div>

      {/* Create user */}
      <Panel title="Add user" icon={<FiUserPlus />}>
        <form className="users-form" onSubmit={createUser}>
          <input className="users-input" placeholder="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <input className="users-input" placeholder="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="users-input" type="password" placeholder="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <select className="users-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button type="submit" className="users-btn" disabled={busy}><FiUserPlus size={14} /> Add user</button>
        </form>
      </Panel>

      {/* Users table */}
      <Panel
        title="Users" icon={<FiUsers />} flush
        loading={q.loading}
        error={q.error ? loadMessage(q.error) : null}
        empty={!q.loading && !q.error && users.length === 0}
        emptyText="No users."
      >
        <DataTable
          columns={columns} rows={users} rowKey={(u) => u.username}
          initialSort={{ key: 'username', dir: 'asc' }}
          emptyText="No users."
        />
      </Panel>
    </div>
  )
}
