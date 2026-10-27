import { useState } from 'react'
import { api } from '../api.js'
import { Field, useAction, useToast } from '../ui.jsx'

/**
 * Config-driven "create a record" form.
 * fields: [{ name, label, type: 'text'|'number'|'date'|'password'|'select', options: [{value,label}],
 *            required, min, max, step, hint, defaultValue }]
 */
export default function AddForm({ title, endpoint, fields, success, onDone, columns = 2 }) {
  const toast = useToast()
  const [run, pending] = useAction()
  const initial = () => Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? (f.type === 'select' ? String(f.options?.[0]?.value ?? '') : '')]))
  const [values, setValues] = useState(initial)
  const set = (name, v) => setValues((s) => ({ ...s, [name]: v }))

  async function submit(e) {
    e.preventDefault()
    const body = {}
    for (const f of fields) {
      const raw = values[f.name]
      if (raw === '' && f.required === false) continue
      body[f.name] = f.type === 'number' || f.numeric ? Number(raw) : (typeof raw === 'string' ? raw.trim() : raw)
    }
    const res = await run(() => api.post(endpoint, body))
    if (!res) return
    toast.success(success)
    setValues(initial())
    onDone?.()
  }

  return (
    <form className="panel add-form" onSubmit={submit}>
      <h3>{title}</h3>
      <div className={`form-grid form-grid-${columns}`}>
        {fields.map((f) => (
          <Field key={f.name} label={f.label + (f.required === false ? ' (optional)' : '')} hint={f.hint}>
            {f.type === 'select' ? (
              <select className="input" value={values[f.name]} onChange={(e) => set(f.name, e.target.value)} required={f.required !== false}>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input className="input" type={f.type || 'text'} value={values[f.name]} onChange={(e) => set(f.name, e.target.value)}
                     required={f.required !== false} min={f.min} max={f.max} step={f.step} maxLength={f.maxLength} placeholder={f.placeholder}
                     autoComplete={f.type === 'password' ? 'new-password' : 'off'} />
            )}
          </Field>
        ))}
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  )
}
