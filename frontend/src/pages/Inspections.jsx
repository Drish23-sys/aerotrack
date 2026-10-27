import { useState } from 'react'
import { api } from '../api.js'
import {
  DataTable, ErrorBlock, Field, Loading, PageHeader, Reg, Section, Status, fmtDate, today, useAction, useLoad, useToast,
} from '../ui.jsx'

function ScheduleForm({ lookups, onDone }) {
  const toast = useToast()
  const [run, pending] = useAction()
  const [aircraftId, setAircraftId] = useState('')
  const [typeId, setTypeId] = useState('')
  const [date, setDate] = useState(today())
  const [techs, setTechs] = useState([])       // order matters: the first one ticked is the lead
  const [remarks, setRemarks] = useState('')

  const toggle = (id) => setTechs((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]))

  async function submit(e) {
    e.preventDefault()
    if (techs.length === 0) { toast.error('Choose at least one technician.'); return }
    const res = await run(() => api.post('/api/inspections', {
      aircraft_id: Number(aircraftId || lookups.aircraft[0].aircraft_id),
      type_id: Number(typeId || lookups.inspection_types[0].type_id),
      inspection_date: date, technician_ids: techs, remarks,
    }))
    if (!res) return
    toast.success(`Inspection #${res.inspection_id} scheduled.`)
    setTechs([])
    setRemarks('')
    onDone()
  }

  return (
    <form className="panel form-grid" onSubmit={submit}>
      <Field label="Aircraft">
        <select className="input" value={aircraftId} onChange={(e) => setAircraftId(e.target.value)}>
          {lookups.aircraft.map((a) => <option key={a.aircraft_id} value={a.aircraft_id}>{a.registration_no}</option>)}
        </select>
      </Field>
      <Field label="Inspection type">
        <select className="input" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          {lookups.inspection_types.map((t) => <option key={t.type_id} value={t.type_id}>{t.type_name}</option>)}
        </select>
      </Field>
      <Field label="Date">
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </Field>
      <Field label="Remarks (optional)">
        <input className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500} />
      </Field>

      <fieldset className="field field-wide">
        <legend className="field-label">Technicians</legend>
        <div className="checks">
          {lookups.technicians.map((t) => {
            const pos = techs.indexOf(t.tech_id)
            return (
              <label key={t.tech_id} className={`check${pos >= 0 ? ' check-on' : ''}`}>
                <input type="checkbox" checked={pos >= 0} onChange={() => toggle(t.tech_id)} />
                <span>{t.name}<small>{t.certification_level}</small></span>
                {pos === 0 && <em className="lead">Lead</em>}
              </label>
            )
          })}
        </div>
        <span className="field-hint">The first technician you tick becomes the lead.</span>
      </fieldset>

      <div className="form-actions">
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Scheduling…' : 'Schedule inspection'}</button>
      </div>
    </form>
  )
}

function RowActions({ row, onDone }) {
  const toast = useToast()
  const [run, pending] = useAction()
  const [remarks, setRemarks] = useState('')

  async function act(path, body, message) {
    const res = await run(() => api.post(`/api/inspections/${row.inspection_id}/${path}`, body))
    if (res) { toast.success(message); onDone() }
  }

  if (row.status === 'scheduled') {
    return (
      <div className="row-actions">
        <button className="btn btn-small btn-primary" disabled={pending}
                onClick={() => act('start', {}, `Inspection #${row.inspection_id} started.`)}>Start</button>
        <button className="btn btn-small" disabled={pending}
                onClick={() => act('cancel', {}, `Inspection #${row.inspection_id} cancelled.`)}>Cancel</button>
      </div>
    )
  }
  if (row.status === 'in_progress') {
    return (
      <div className="row-actions">
        <input className="input input-small" placeholder="Closing remarks (optional)" value={remarks}
               aria-label={`Closing remarks for inspection ${row.inspection_id}`}
               onChange={(e) => setRemarks(e.target.value)} maxLength={500} />
        <button className="btn btn-small btn-primary" disabled={pending}
                onClick={() => act('close', { remarks }, `Inspection #${row.inspection_id} closed. Its components are marked as inspected.`)}>
          Close inspection
        </button>
      </div>
    )
  }
  return <span className="subtle">—</span>
}

export default function Inspections() {
  const lookups = useLoad(() => api.get('/api/lookups'))
  const list = useLoad(() => api.get('/api/inspections'))

  if (lookups.loading || list.loading) return <Loading />
  if (lookups.error || list.error) return <ErrorBlock message={lookups.error || list.error} onRetry={() => { lookups.reload(); list.reload() }} />

  return (
    <>
      <PageHeader title="Inspections">Schedule a check, start it, then close it once the work is done. Closing marks the aircraft’s components as inspected.</PageHeader>

      <Section title="Schedule an inspection">
        <ScheduleForm lookups={lookups.data} onDone={list.reload} />
      </Section>

      <Section title="All inspections" aside={`${list.data.length} on record`}>
        <DataTable rowKey={(r) => r.inspection_id} rows={list.data}
          columns={[
            { label: 'ID', render: (r) => `#${r.inspection_id}` },
            { label: 'Aircraft', render: (r) => <Reg>{r.registration_no}</Reg> },
            { label: 'Type', key: 'type_name' },
            { label: 'Date', render: (r) => fmtDate(r.inspection_date) },
            { label: 'Status', render: (r) => <Status value={r.status} /> },
            { label: 'Technicians', render: (r) => r.technicians || '—', className: 'wrap' },
            { label: 'Remarks', render: (r) => r.remarks || '—', className: 'wrap' },
            { label: 'Next step', render: (r) => <RowActions row={r} onDone={list.reload} /> },
          ]} />
      </Section>
    </>
  )
}
