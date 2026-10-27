import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------- formatting
const lower = (s) => String(s).replace(/_/g, ' ').toLowerCase()
export const titleCase = (s) => (s == null || s === '' ? '' : lower(s).replace(/^./, (c) => c.toUpperCase()))   // CRITICAL -> Critical
export const sentence = (s) => (s == null || s === '' ? '' : String(s).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()))   // in_repair -> In repair

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const moneyFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

export function fmtDate(v) {
  if (!v) return '—'
  // plain dates (YYYY-MM-DD) must not shift with the time zone
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : dateFmt.format(d)
}
export const fmtDateTime = (v) => (v ? dateTimeFmt.format(new Date(v)) : '—')
export const fmtMoney = (v) => (v == null ? '—' : moneyFmt.format(v))
export const today = () => new Date().toLocaleDateString('en-CA')   // YYYY-MM-DD in the user's own time zone

// ---------------------------------------------------------------- data loading
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn
  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fnRef.current()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e) => alive && setState({ data: null, error: e.message, loading: false }))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, reload }
}

// Runs an async action, exposes a pending flag, reports failures as toasts.
export function useAction() {
  const toast = useToast()
  const [pending, setPending] = useState(false)
  const run = useCallback(async (fn) => {
    setPending(true)
    try {
      return await fn()
    } catch (e) {
      toast.error(e.message)
      return undefined
    } finally {
      setPending(false)
    }
  }, [toast])
  return [run, pending]
}

// ---------------------------------------------------------------- toasts
const ToastContext = createContext(null)
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const nextId = useRef(1)
  const dismiss = useCallback((id) => setItems((xs) => xs.filter((x) => x.id !== id)), [])
  const push = useCallback((kind, message) => {
    const id = nextId.current++
    setItems((xs) => [...xs.slice(-3), { id, kind, message }])
    setTimeout(() => dismiss(id), kind === 'error' ? 9000 : 5000)
  }, [dismiss])
  const value = useRef({ success: (m) => push('success', m), error: (m) => push('error', m) }).current
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <span>{t.message}</span>
            <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// ---------------------------------------------------------------- small components
export function SeverityPill({ value }) {
  return <span className={`pill sev-${String(value).toLowerCase()}`}>{titleCase(value)}</span>
}

export function Status({ value }) {
  return <span className={`status status-${value}`}>{sentence(value)}</span>
}

export const Reg = ({ children }) => <span className="reg">{children}</span>

export function PageHeader({ title, children }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {children && <p className="page-sub">{children}</p>}
    </div>
  )
}

export function Section({ title, aside, children }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {aside && <div className="section-aside">{aside}</div>}
      </div>
      {children}
    </section>
  )
}

export function Loading({ label = 'Loading…' }) {
  return <p className="loading" role="status">{label}</p>
}

export function ErrorBlock({ message, onRetry }) {
  return (
    <div className="error-block" role="alert">
      <strong>That didn’t load.</strong> {message}
      {onRetry && <button type="button" className="btn btn-quiet" onClick={onRetry}>Try again</button>}
    </div>
  )
}

export function Field({ label, hint, children, wide }) {
  return (
    <label className={`field${wide ? ' field-wide' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function DataTable({ columns, rows, empty = 'Nothing here yet.', rowKey }) {
  if (!rows || rows.length === 0) return <p className="empty">{empty}</p>
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key || c.label} className={c.align === 'right' ? 'num' : undefined}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey ? rowKey(r) : i}>
              {columns.map((c) => (
                <td key={c.key || c.label} className={[c.align === 'right' ? 'num' : '', c.className || ''].join(' ').trim() || undefined}>
                  {c.render ? c.render(r) : (r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Tabs({ tabs, value, onChange, label }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={value === t.key}
                className={`tab${value === t.key ? ' tab-on' : ''}`} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}
