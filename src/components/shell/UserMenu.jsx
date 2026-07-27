import React, { useState, useRef, useEffect } from 'react'
import { FiUser, FiLogOut, FiChevronDown } from 'react-icons/fi'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || ''

// Identity + logout menu. Only shown when a session exists (auth-off dev stays
// clean). Logout clears the HttpOnly cookie (server) + localStorage and bounces
// to /login.
export default function UserMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const username = localStorage.getItem('username')
  const role = localStorage.getItem('role')

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  if (!username) return null

  const logout = async () => {
    try { await axios.post(`${API}/api/auth/logout`) } catch { /* clear locally regardless */ }
    localStorage.removeItem('auth_token')
    localStorage.removeItem('username')
    localStorage.removeItem('role')
    window.location.assign('/login')
  }

  return (
    <div className="opa-usermenu" ref={ref}>
      <button className="opa-btn ghost" onClick={() => setOpen((o) => !o)} title={role ? `${username} · ${role}` : username}>
        <FiUser size={14} /> <span className="opa-usermenu-name">{username}</span> <FiChevronDown size={12} />
      </button>
      {open && (
        <div className="opa-usermenu-pop">
          <div className="opa-usermenu-head">
            <div className="opa-mono opa-usermenu-name">{username}</div>
            {role && <span className="opa-badge" style={{ marginTop: 6 }}>{role}</span>}
          </div>
          <button className="opa-usermenu-item" onClick={logout}><FiLogOut size={13} /> Log out</button>
        </div>
      )}
    </div>
  )
}
