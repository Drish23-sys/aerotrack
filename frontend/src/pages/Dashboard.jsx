import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api.js'
import {
  DataTable, ErrorBlock, Loading, PageHeader, Reg, Section, SeverityPill, Status, fmtDate, titleCase, useLoad,
} from '../ui.jsx'

const SEVERITY_COLORS = { LOW: '#4C9F70', MEDIUM: '#3E73B8', HIGH: '#D9962B', CRITICAL: '#B3122B' }

function MaintenanceTag({ aircraft }) {
  const reasons = aircraft.defects
  return (
    <article className="tag" aria-label={`${aircraft.registration_no} is grounded`}>
      <p className="tag-state">Grounded</p>
      <h3 className="tag-reg">{aircraft.registration_no}</h3>
      <p className="tag-model">{aircraft.model}</p>
      <ul className="tag-reasons">
        {reasons.length === 0 && <li>No open critical defect on record.</li>}
        {reasons.map((d) => (
          <li key={d.defect_id}>
            Critical {d.defect_class} on {d.component.toLowerCase()}, {d.defect_status === 'in_repair' ? 'repair under way' : 'waiting for a repair'}
          </li>
        ))}
      </ul>
    </article>
  )
}

function Kpi({ value, label, tone }) {
  return (
    <div className={`kpi${tone ? ` kpi-${tone}` : ''}`}>
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
    </div>
  )
}

export default function Dashboard() {
  const { data, error, loading, reload } = useLoad(() => api.get('/api/dashboard'))
  if (loading) return <Loading />
  if (error) return <ErrorBlock message={error} onRetry={reload} />

  const { kpi, grounded, open_defects: openDefects, severity_counts: counts } = data
  const columns = [
    { label: 'Aircraft', render: (r) => <Reg>{r.registration_no}</Reg> },
    { label: 'Component', render: (r) => <>{r.component}<span className="subtle"> {r.serial_no}</span></> },
    { label: 'Severity', render: (r) => <SeverityPill value={r.severity} /> },
    { label: 'Status', render: (r) => <Status value={r.status} /> },
    { label: 'Reported', render: (r) => fmtDate(r.reported_at) },
  ]

  return (
    <>
      <PageHeader title="Fleet status">
        {kpi.fleet} aircraft on the books, {kpi.active} cleared to fly.
      </PageHeader>

      <div className="kpis">
        <Kpi value={kpi.grounded} label="Aircraft grounded" tone={kpi.grounded ? 'alert' : ''} />
        <Kpi value={kpi.open_defects} label="Open defects" />
        <Kpi value={kpi.overdue} label="Components overdue for inspection" />
        <Kpi value={kpi.active} label="Aircraft active" />
      </div>

      <Section title="Grounded aircraft">
        {grounded.length === 0
          ? <p className="all-clear">No aircraft are grounded.</p>
          : <div className="tags">{grounded.map((a) => <MaintenanceTag key={a.aircraft_id} aircraft={a} />)}</div>}
      </Section>

      <div className="dash-grid">
        <Section title="Open defects" aside={`${openDefects.length} to resolve`}>
          <DataTable columns={columns} rows={openDefects} rowKey={(r) => r.defect_id} empty="No open defects. Nice." />
        </Section>

        <Section title="Open defects by severity">
          <div className="chart-box" role="img"
               aria-label={`Open defects by severity: ${counts.map((c) => `${titleCase(c.severity)} ${c.count}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={counts.map((c) => ({ ...c, name: titleCase(c.severity) }))} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid vertical={false} stroke="#E1E6EB" />
                <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: '#A9B5C0' }} tick={{ fontSize: 13, fill: '#46586C' }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#6B7C8D' }} />
                <Tooltip cursor={{ fill: 'rgba(16,35,58,.06)' }} formatter={(v) => [v, 'Open defects']} />
                <Bar dataKey="count" isAnimationActive={false} radius={[3, 3, 0, 0]} maxBarSize={56}>
                  {counts.map((c) => <Cell key={c.severity} fill={SEVERITY_COLORS[c.severity]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>
    </>
  )
}
