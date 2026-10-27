import { useState } from 'react'
import { api } from '../api.js'
import { DataTable, ErrorBlock, Loading, PageHeader, Reg, Section, Status, Tabs, fmtDate, useLoad } from '../ui.jsx'
import AddForm from './AddForm.jsx'

const CERTS = ['B1', 'B2', 'C', 'NDT Level 2', 'NDT Level 3'].map((c) => ({ value: c, label: c }))
const ROLES = [
  { value: 'viewer', label: 'Viewer (read only)' },
  { value: 'inspector', label: 'Inspector (log work)' },
  { value: 'admin', label: 'Admin (everything)' },
]
const THIS_YEAR = new Date().getFullYear()

export default function Fleet() {
  const fleet = useLoad(() => api.get('/api/admin/fleet'))
  const lookups = useLoad(() => api.get('/api/lookups'))
  const [tab, setTab] = useState('aircraft')

  if (fleet.loading || lookups.loading) return <Loading />
  const error = fleet.error || lookups.error
  if (error) return <ErrorBlock message={error} onRetry={() => { fleet.reload(); lookups.reload() }} />

  const refresh = () => { fleet.reload(); lookups.reload() }
  const l = lookups.data
  const models = l.models.map((m) => ({ value: m.model_id, label: `${m.manufacturer} ${m.model_name}` }))
  const aircraft = l.aircraft.map((a) => ({ value: a.aircraft_id, label: a.registration_no }))
  const ctypes = l.component_types.map((t) => ({ value: t.type_id, label: t.type_name }))
  const f = fleet.data

  return (
    <>
      <PageHeader title="Fleet and users">Reference data the rest of the system relies on.</PageHeader>
      <Tabs label="Fleet data" value={tab} onChange={setTab} tabs={[
        { key: 'aircraft', label: 'Aircraft' }, { key: 'components', label: 'Components' },
        { key: 'technicians', label: 'Technicians' }, { key: 'users', label: 'Users' },
      ]} />

      {tab === 'aircraft' && (
        <>
          <DataTable rowKey={(r) => r.aircraft_id} rows={f.aircraft} columns={[
            { label: 'Registration', render: (r) => <Reg>{r.registration_no}</Reg> },
            { label: 'Model', key: 'model' },
            { label: 'Year', key: 'manufacture_year' },
            { label: 'Status', render: (r) => <Status value={r.status} /> },
            { label: 'Components', align: 'right', key: 'components' },
          ]} />
          <Section title="Add records">
            <div className="forms">
              <AddForm title="New aircraft" endpoint="/api/admin/aircraft" success="Aircraft added." onDone={refresh} fields={[
                { name: 'registration_no', label: 'Registration', placeholder: 'VT-XYZ', maxLength: 12 },
                { name: 'model_id', label: 'Model', type: 'select', options: models, numeric: true },
                { name: 'manufacture_year', label: 'Manufacture year', type: 'number', min: 1950, max: 2100, defaultValue: String(THIS_YEAR - 5) },
              ]} />
              <AddForm title="New aircraft model" endpoint="/api/admin/models" success="Aircraft model added." onDone={refresh} fields={[
                { name: 'manufacturer', label: 'Manufacturer' },
                { name: 'model_name', label: 'Model name' },
                { name: 'seat_capacity', label: 'Seats', type: 'number', min: 1, max: 1000, defaultValue: '150' },
              ]} />
            </div>
          </Section>
        </>
      )}

      {tab === 'components' && (
        <>
          <DataTable rowKey={(r) => r.component_id} rows={f.components} columns={[
            { label: 'Aircraft', render: (r) => <Reg>{r.registration_no}</Reg> },
            { label: 'Component', key: 'component' },
            { label: 'Serial', render: (r) => <span className="serial">{r.serial_no}</span> },
            { label: 'Installed', render: (r) => fmtDate(r.installed_date) },
            { label: 'Last inspected', render: (r) => (r.last_inspected_date ? fmtDate(r.last_inspected_date) : 'Never') },
            { label: 'Interval (days)', align: 'right', key: 'inspection_interval_days' },
          ]} />
          <Section title="Add records">
            <div className="forms">
              <AddForm title="New component" endpoint="/api/admin/components" success="Component added." onDone={refresh} fields={[
                { name: 'aircraft_id', label: 'Aircraft', type: 'select', options: aircraft, numeric: true },
                { name: 'type_id', label: 'Component type', type: 'select', options: ctypes, numeric: true },
                { name: 'serial_no', label: 'Serial number', maxLength: 30 },
              ]} />
              <AddForm title="New component type" endpoint="/api/admin/component-types" success="Component type added." onDone={refresh} fields={[
                { name: 'type_name', label: 'Name' },
                { name: 'inspection_interval_days', label: 'Inspect every (days)', type: 'number', min: 1, max: 3650, defaultValue: '180' },
              ]} />
            </div>
          </Section>
        </>
      )}

      {tab === 'technicians' && (
        <>
          <DataTable rowKey={(r) => r.tech_id} rows={f.technicians} columns={[
            { label: 'Name', key: 'name' },
            { label: 'Certification', key: 'certification_level' },
            { label: 'Email', render: (r) => r.email || '—' },
            { label: 'Active', render: (r) => (r.is_active ? 'Yes' : 'No') },
          ]} />
          <Section title="Add a technician">
            <div className="forms">
              <AddForm title="New technician" endpoint="/api/admin/technicians" success="Technician added." onDone={refresh} fields={[
                { name: 'name', label: 'Name', maxLength: 80 },
                { name: 'certification_level', label: 'Certification', type: 'select', options: CERTS },
                { name: 'email', label: 'Email', type: 'email', required: false },
              ]} />
            </div>
          </Section>
        </>
      )}

      {tab === 'users' && (
        <>
          <DataTable rowKey={(r) => r.user_id} rows={f.users} columns={[
            { label: 'Username', key: 'username' },
            { label: 'Role', render: (r) => r.role },
            { label: 'Active', render: (r) => (r.is_active ? 'Yes' : 'No') },
          ]} />
          <Section title="Add a user">
            <div className="forms">
              <AddForm title="New user" endpoint="/api/admin/users" success="User added." onDone={refresh} fields={[
                { name: 'username', label: 'Username', maxLength: 40 },
                { name: 'password', label: 'Password', type: 'password', hint: 'At least 6 characters.' },
                { name: 'role', label: 'Role', type: 'select', options: ROLES },
              ]} />
            </div>
          </Section>
        </>
      )}
    </>
  )
}
