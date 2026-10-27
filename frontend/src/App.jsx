import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth.jsx'
import { Loading } from './ui.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import LogDefect from './pages/LogDefect.jsx'
import Inspections from './pages/Inspections.jsx'
import Repairs from './pages/Repairs.jsx'
import Overdue from './pages/Overdue.jsx'
import Reports from './pages/Reports.jsx'
import Fleet from './pages/Fleet.jsx'
import SqlConsole from './pages/SqlConsole.jsx'
import AuditLog from './pages/AuditLog.jsx'

const ALL = ['admin', 'inspector', 'viewer']
const FIELD = ['admin', 'inspector']
const ADMIN = ['admin']

// One list drives both the navigation bar and the route guards.
const PAGES = [
  { to: '/', label: 'Dashboard', roles: ALL, element: <Dashboard />, end: true },
  { to: '/defects/new', label: 'Log defect', roles: FIELD, element: <LogDefect /> },
  { to: '/inspections', label: 'Inspections', roles: FIELD, element: <Inspections /> },
  { to: '/repairs', label: 'Repairs', roles: FIELD, element: <Repairs /> },
  { to: '/overdue', label: 'Overdue', roles: ALL, element: <Overdue /> },
  { to: '/reports', label: 'Reports', roles: ALL, element: <Reports /> },
  { to: '/admin/fleet', label: 'Fleet and users', roles: ADMIN, element: <Fleet />, admin: true },
  { to: '/admin/sql', label: 'SQL console', roles: ADMIN, element: <SqlConsole />, admin: true },
  { to: '/admin/audit', label: 'Audit log', roles: ADMIN, element: <AuditLog />, admin: true },
]

function TagMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M4 2h24v20l-6 8H4z" fill="#B3122B" />
      <circle cx="11" cy="9" r="3" fill="#10233A" />
    </svg>
  )
}

function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const links = PAGES.filter((p) => p.roles.includes(user.role))
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="topbar">
        <div className="topbar-row">
          <NavLink to="/" className="brand" aria-label="AeroTrack home">
            <TagMark />
            <span className="brand-name">AeroTrack</span>
          </NavLink>
          <div className="whoami">
            <span className="whoami-name">{user.username}</span>
            <span className="whoami-role">{user.role}</span>
            <button type="button" className="btn btn-ghost" onClick={logout}>Sign out</button>
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          {links.map((p, i) => (
            <NavLink key={p.to} to={p.to} end={p.end}
                     className={({ isActive }) => `nav-link${isActive ? ' nav-on' : ''}${p.admin && !links[i - 1]?.admin ? ' nav-gap' : ''}`}>
              {p.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main id="main" className="page" key={location.pathname}>
        <Outlet />
      </main>
    </>
  )
}

function Protected() {
  const { user, ready } = useAuth()
  if (!ready) return <div className="splash"><Loading label="Connecting to the server…" /></div>
  if (!user) return <Navigate to="/login" replace />
  return <Layout />
}

function RoleGate({ roles, children }) {
  const { user } = useAuth()
  return roles.includes(user.role) ? children : <Navigate to="/" replace />
}

export default function App() {
  const { user, ready } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={ready && user ? <Navigate to="/" replace /> : <Login />} />
      <Route element={<Protected />}>
        {PAGES.map((p) => (
          <Route key={p.to} path={p.to} element={<RoleGate roles={p.roles}>{p.element}</RoleGate>} />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
