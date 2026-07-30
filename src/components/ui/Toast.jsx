import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

const ToastContext = createContext(null)

let toastId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const push = useCallback((message, opts = {}) => {
    const id = ++toastId
    const toast = {
      id,
      message: String(message || ''),
      tone: opts.tone || 'neutral',
      undo: opts.undo || null,
    }
    setToasts((t) => [...t.slice(-4), toast])
    const ms = opts.durationMs ?? 4000
    if (ms > 0) setTimeout(() => dismiss(id), ms)
    return id
  }, [dismiss])

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div style={{
        position: 'fixed', right: 16, bottom: 16, zIndex: 9999, display: 'flex',
        flexDirection: 'column', gap: 8, maxWidth: 360,
      }}>
        {toasts.map((t) => (
          <div key={t.id} style={{
            background: 'var(--surface-2)', border: '1px solid var(--border-strong)',
            borderRadius: 8, padding: '10px 12px', boxShadow: 'var(--shadow-pop)',
            display: 'flex', gap: 10, alignItems: 'center', fontSize: 13,
          }}>
            <span style={{ flex: 1 }}>{t.message}</span>
            {t.undo && (
              <button type="button" className="opa-btn ghost" style={{ fontSize: 12 }} onClick={() => { t.undo(); dismiss(t.id) }}>
                Undo
              </button>
            )}
            <button type="button" className="opa-btn ghost" style={{ fontSize: 12 }} onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) return { push: () => {}, dismiss: () => {} }
  return ctx
}
