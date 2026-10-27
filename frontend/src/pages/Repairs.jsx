import { useState } from 'react'
import { api } from '../api.js'
import {
  DataTable, ErrorBlock, Field, Loading, PageHeader, Reg, Section, SeverityPill, Status, fmtDate, fmtMoney, titleCase, today,
  useAction, useLoad, useToast,
} from '../ui.jsx'

function StartRepair({ defects, techs, onDone }) {
  const toast = useToast()
  const [run, pending] = useAction()
  const [defectId, setDefectId] = useState('')
  const [techId, setTechId] = useState('')
  const [action, setAction] = useState('')
  const [cost, setCost] = useState('')
  const [start, setStart] = useState(today())

  if (defects.length === 0) return <p className="empty">Every open defect already has a repair under way.</p>

  async function submit(e) {
    e.preventDefault()
    const id = Number(defectId || defects[0].defect_id)
    const res = await run(() => api.post('/api/repairs', {
      defect_id: id, tech_id: Number(techId || techs[0].tech_id), action_taken: action,
      cost: cost === '' ? 0 : Number(cost), start_date: start,
    }))
    if (!res) return
    toast.success(`Repair #${res.repair_id} started on defect #${id}.`)
    setAction('')
    setCost('')
    setDefectId('')
    onDone()
  }

  return (
    <form className="panel form-grid" onSubmit={submit}>
      <Field label="Defect" wide>
        <select className="input" value={defectId} onChange={(e) => setDefectId(e.target.value)}>
          {defects.map((d) => (
            <option key={d.defect_id} value={d.defect_id}>
              #{d.defect_id} {d.registration_no}, {d.component} ({d.serial_no}), {titleCase(d.severity).toLowerCase()}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Technician">
        <select className="input" value={techId} onChange={(e) => setTechId(e.target.value)}>
          {techs.map((t) => <option key={t.tech_id} value={t.tech_id}>{t.name} ({t.certification_level})</option>)}
        </select>
      </Field>
      <Field label="Start date">
        <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
      </Field>
      <Field label="Planned repair action" wide>
        <input className="input" value={action} onChange={(e) => setAction(e.target.value)} maxLength={500} required />
      </Field>
      <Field label="Estimated cost (₹)">
        <input className="input" type="number" min="0" step="100" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
      </Field>
      <div className="form-actions">
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Starting…' : 'Start repair'}</button>
      </div>
    </form>
  )
}

function FinishControls({ row, onDone }) {
  const toast = useToast()
  const [run, pending] = useAction()
  const [outcome, setOutcome] = useState('completed')
  const [cost, setCost] = useState(String(row.cost ?? 0))

  async function finish() {
    const res = await run(() => api.post(`/api/repairs/${row.repair_id}/finish`, {
      outcome, end_date: today(), cost: cost === '' ? null : Number(cost),
    }))
    if (!res) return
    let msg = `Repair #${res.repair_id} marked ${res.outcome}.`
    if (res.outcome === 'failed') msg += ' The defect is open again and needs a new repair.'
    if (res.released) msg += ` ${res.registration_no} has been returned to service.`
    toast.success(msg)
    onDone()
  }

  return (
    <div className="row-actions">
      <select className="input input-small" value={outcome} onChange={(e) => setOutcome(e.target.value)}
              aria-label={`Outcome of repair ${row.repair_id}`}>
        <option value="completed">Fixed</option>
        <option value="failed">Did not hold</option>
      </select>
      <input className="input input-small input-money" type="number" min="0" step="100" value={cost}
             onChange={(e) => setCost(e.target.value)} aria-label={`Final cost of repair ${row.repair_id} in rupees`} />
      <button className="btn btn-small btn-primary" disabled={pending} onClick={finish}>Finish repair</button>
    </div>
  )
}

export default function Repairs() {
  const defects = useLoad(() => api.get('/api/defects?scope=awaiting_repair'))
  const lookups = useLoad(() => api.get('/api/lookups'))
  const repairs = useLoad(() => api.get('/api/repairs'))

  if (defects.loading || lookups.loading || repairs.loading) return <Loading />
  const error = defects.error || lookups.error || repairs.error
  if (error) return <ErrorBlock message={error} onRetry={() => { defects.reload(); lookups.reload(); repairs.reload() }} />

  const refresh = () => { defects.reload(); repairs.reload() }
  const active = repairs.data.filter((r) => r.status === 'in_progress')
  const history = repairs.data.filter((r) => r.status !== 'in_progress')

  return (
    <>
      <PageHeader title="Repairs">Starting a repair moves the defect to “in repair”. When the last critical repair on a grounded aircraft is fixed, the aircraft returns to service.</PageHeader>

      <Section title="Start a repair" aside={`${defects.data.length} defect${defects.data.length === 1 ? '' : 's'} waiting`}>
        <StartRepair defects={defects.data} techs={lookups.data.technicians} onDone={refresh} />
      </Section>

      <Section title="Repairs in progress">
        <DataTable rowKey={(r) => r.repair_id} rows={active} empty="No repairs in progress."
          columns={[
            { label: 'ID', render: (r) => `#${r.repair_id}` },
            { label: 'Aircraft', render: (r) => <Reg>{r.registration_no}</Reg> },
            { label: 'Component', key: 'component' },
            { label: 'Severity', render: (r) => <SeverityPill value={r.severity} /> },
            { label: 'Technician', key: 'technician' },
            { label: 'Started', render: (r) => fmtDate(r.start_date) },
            { label: 'Work', key: 'action_taken', className: 'wrap' },
            { label: 'Outcome and final cost (₹)', render: (r) => <FinishControls row={r} onDone={refresh} /> },
          ]} />
      </Section>

      <Section title="Repair history">
        <DataTable rowKey={(r) => r.repair_id} rows={history} empty="No finished repairs yet."
          columns={[
            { label: 'ID', render: (r) => `#${r.repair_id}` },
            { label: 'Aircraft', render: (r) => <Reg>{r.registration_no}</Reg> },
            { label: 'Component', key: 'component' },
            { label: 'Severity', render: (r) => <SeverityPill value={r.severity} /> },
            { label: 'Technician', key: 'technician' },
            { label: 'Work', key: 'action_taken', className: 'wrap' },
            { label: 'Cost', align: 'right', render: (r) => fmtMoney(r.cost) },
            { label: 'Finished', render: (r) => fmtDate(r.end_date) },
            { label: 'Result', render: (r) => <Status value={r.status} /> },
          ]} />
      </Section>
    </>
  )
}
