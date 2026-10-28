import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const ToastContext = createContext(null)
const DEFAULT_DURATION = 4500

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const pushToast = useCallback((input) => {
    const message = String(input?.message || '').trim()
    if (!message && !input?.title) return null

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const toast = {
      id,
      type: input?.type === 'success' || input?.type === 'warning' ? input.type : 'error',
      title: String(input?.title || '').trim(),
      message,
      duration: Number.isFinite(Number(input?.duration)) ? Number(input.duration) : DEFAULT_DURATION,
    }

    setToasts((current) => [...current.slice(-4), toast])
    return id
  }, [])

  const value = useMemo(() => ({
    pushToast,
    dismissToast,
    success: (message, options = {}) => pushToast({ ...options, type: 'success', message }),
    error: (message, options = {}) => pushToast({ ...options, type: 'error', message }),
    warning: (message, options = {}) => pushToast({ ...options, type: 'warning', message }),
  }), [dismissToast, pushToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast.duration || toast.duration <= 0) return undefined
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration)
    return () => clearTimeout(timer)
  }, [onDismiss, toast.duration, toast.id])

  const styles = toast.type === 'success'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : toast.type === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-950'
      : 'border-rose-200 bg-rose-50 text-rose-900'

  const Icon = toast.type === 'success' ? CheckCircle2 : AlertTriangle

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg shadow-slate-900/10 ${styles}`}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        {toast.title ? <p className="text-sm font-bold">{toast.title}</p> : null}
        {toast.message ? <p className={`text-sm ${toast.title ? 'mt-0.5' : 'font-medium'}`}>{toast.message}</p> : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-current/70 hover:bg-black/5 hover:text-current"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}
