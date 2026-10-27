// Thin fetch wrapper: base URL, bearer token, readable errors.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const TOKEN_KEY = 'aerotrack_token'

let token = null
try { token = localStorage.getItem(TOKEN_KEY) } catch { /* storage blocked: stay signed in for this tab only */ }

export const getToken = () => token

export function setToken(value) {
  token = value
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* ignore */ }
}

let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn }

function errorMessage(data, status) {
  const d = data?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d)) {   // FastAPI validation errors
    return d.map((e) => `${(e.loc || []).slice(1).join(' ')}: ${e.msg}`).join('; ')
  }
  return `The request failed (${status}).`
}

async function request(method, path, body) {
  let res
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('Cannot reach the server. Check your connection and try again.')
  }
  const data = await res.json().catch(() => null)
  if (res.status === 401 && token && path !== '/api/auth/login') onUnauthorized()
  if (!res.ok) throw new Error(errorMessage(data, res.status))
  return data
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
}
