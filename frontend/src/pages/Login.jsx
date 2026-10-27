import { useEffect, useState } from 'react'
import { useAuth } from '../auth.jsx'

const DEMO = [
  { label: 'Admin', username: 'admin', password: 'admin123', note: 'everything' },
  { label: 'Inspector', username: 'inspector', password: 'inspect123', note: 'log work' },
  { label: 'Viewer', username: 'viewer', password: 'viewer123', note: 'read only' },
]
const SHOW_DEMO = import.meta.env.VITE_DEMO_LOGINS !== 'false'

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [slow, setSlow] = useState(false)

  // Free hosting puts the API to sleep; the first request can take a minute. Say so.
  useEffect(() => {
    if (!pending) { setSlow(false); return undefined }
    const t = setTimeout(() => setSlow(true), 4000)
    return () => clearTimeout(t)
  }, [pending])

  async function submit(e) {
    e.preventDefault()
    setError('')
    setPending(true)
    try {
      await login(username.trim(), password)
    } catch (err) {
      setError(err.message)
      setPending(false)
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-brand">
          <svg className="login-mark" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M4 2h24v20l-6 8H4z" fill="#B3122B" />
            <circle cx="11" cy="9" r="3" fill="#E4E9ED" />
          </svg>
          <div>
            <h1>AeroTrack</h1>
            <p>Aircraft inspection and defect management</p>
          </div>
        </div>

        <form onSubmit={submit} className="stack">
          <label className="field">
            <span className="field-label">Username</span>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)}
                   autoComplete="username" autoFocus required />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                   autoComplete="current-password" required />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
          {slow && <p className="hint" role="status">The server was asleep and is starting up. This can take up to a minute.</p>}
        </form>

        {SHOW_DEMO && (
          <div className="demo">
            <p className="demo-title">Demo accounts</p>
            <div className="demo-list">
              {DEMO.map((d) => (
                <button key={d.username} type="button" className="demo-btn"
                        onClick={() => { setUsername(d.username); setPassword(d.password); setError('') }}>
                  <span>{d.label}</span>
                  <small>{d.note}</small>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
