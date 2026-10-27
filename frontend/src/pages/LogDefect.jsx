import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import {
  DataTable, ErrorBlock, Field, Loading, PageHeader, Reg, Section, SeverityPill, Status, fmtDate, sentence, useAction, useLoad, useToast,
} from '../ui.jsx'

const SEVERITIES = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
]

export default function LogDefect() {
  const toast = useToast()
  const [run, pending] = useAction()
  const inspections = useLoad(() => api.get('/api/inspections?status=in_progress,completed'))
  const recent = useLoad(() => api.get('/api/defects?scope=recent'))

  const [inspectionId, setInspectionId] = useState('')
  const [components, setComponents] = useState([])
  const [componentId, setComponentId] = useState('')
  const [severity, setSeverity] = useState('MEDIUM')
  const [defectClass, setDefectClass] = useState('')
  const [description, setDescription] = useState('')

  const list = inspections.data || []
  const activeId = inspectionId || (list[0] ? String(list[0].inspection_id) : '')

  // The component list depends on which aircraft the chosen inspection covers.
  useEffect(() => {
    const insp = list.find((i) => String(i.inspection_id) === activeId)
    if (!insp) { setComponents([]); return undefined }
    let alive = true
    api.get(`/api/aircraft/${insp.aircraft_id}/components`).then((c) => {
      if (!alive) return
      setComponents(c)
      setComponentId(c[0] ? String(c[0].component_id) : '')
    }).catch((e) => alive && toast.error(e.message))
    return () => { alive = false }
  }, [activeId, inspections.data]) // eslint-disable-line react-hooks/exhaustive-deps

  if (inspections.loading) return <Loading />
  if (inspections.error) return <ErrorBlock message={inspections.error} onRetry={inspections.reload} />

  async function submit(e) {
    e.preventDefault()
    const res = await run(() => api.post('/api/defects', {
      inspection_id: Number(activeId), component_id: Number(componentId), severity,
      defect_class: defectClass, description,
    }))
    if (!res) return
    toast.success(`Defect #${res.defect_id} logged on ${res.registration_no}.${res.grounded ? ` ${res.registration_no} is now grounded.` : ''}`)
    setDefectClass('')
    setDescription('')
    setSeverity('MEDIUM')
    recent.reload()
  }

  return (
    <>
      <PageHeader title="Log a defect">Record what an inspection found. A critical defect grounds the aircraft straight away.</PageHeader>

      {list.length === 0 ? (
        <p className="empty">There is no inspection in progress. <Link to="/inspections">Start one</Link> first, then log defects against it.</p>
      ) : (
        <form className="panel form-grid" onSubmit={submit}>
          <Field label="Inspection" wide>
            <select className="input" value={activeId} onChange={(e) => setInspectionId(e.target.value)} required>
              {list.map((i) => (
                <option key={i.inspection_id} value={i.inspection_id}>
                  #{i.inspection_id} {i.registration_no}, {i.type_name}, {fmtDate(i.inspection_date)} ({sentence(i.status).toLowerCase()})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Component">
            <select className="input" value={componentId} onChange={(e) => setComponentId(e.target.value)} required>
              {components.map((c) => <option key={c.component_id} value={c.component_id}>{c.type_name}, {c.serial_no}</option>)}
            </select>
          </Field>

          <Field label="Defect class" hint="For example crack, corrosion, leak, wear.">
            <input className="input" value={defectClass} onChange={(e) => setDefectClass(e.target.value)} maxLength={40} required />
          </Field>

          <fieldset className="field field-wide severity-set">
            <legend className="field-label">Severity</legend>
            <div className="segmented">
              {SEVERITIES.map((s) => (
                <label key={s.value} className={`seg seg-${s.value.toLowerCase()}`}>
                  <input type="radio" name="severity" value={s.value} checked={severity === s.value}
                         onChange={() => setSeverity(s.value)} />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
            {severity === 'CRITICAL' && <span className="field-hint warn">Saving this will ground the aircraft immediately.</span>}
          </fieldset>

          <Field label="What was found" wide>
            <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} required />
          </Field>

          <div className="form-actions">
            <button className={`btn ${severity === 'CRITICAL' ? 'btn-danger' : 'btn-primary'}`} disabled={pending || !componentId}>
              {pending ? 'Saving…' : severity === 'CRITICAL' ? 'Save and ground aircraft' : 'Save defect'}
            </button>
          </div>
        </form>
      )}

      <Section title="Recently logged">
        {recent.loading ? <Loading /> : (
          <DataTable rowKey={(r) => r.defect_id} rows={recent.data} empty="No defects logged yet."
            columns={[
              { label: 'ID', render: (r) => `#${r.defect_id}` },
              { label: 'Aircraft', render: (r) => <Reg>{r.registration_no}</Reg> },
              { label: 'Component', render: (r) => <>{r.component}<span className="subtle"> {r.serial_no}</span></> },
              { label: 'Severity', render: (r) => <SeverityPill value={r.severity} /> },
              { label: 'What was found', key: 'description', className: 'wrap' },
              { label: 'Status', render: (r) => <Status value={r.status} /> },
              { label: 'Reported', render: (r) => fmtDate(r.reported_at) },
            ]} />
        )}
      </Section>
    </>
  )
}
