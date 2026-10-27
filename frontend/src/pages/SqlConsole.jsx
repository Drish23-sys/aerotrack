import { useState } from 'react'
import { api } from '../api.js'
import { Field, PageHeader, useAction } from '../ui.jsx'

const EXAMPLES = [
  { label: 'Open defects (view)', sql: 'SELECT * FROM v_open_defects;' },
  { label: 'Overdue components (view)', sql: 'SELECT * FROM v_overdue_components;' },
  { label: 'Fleet by status', sql: 'SELECT status, COUNT(*) AS aircraft\nFROM aircraft\nGROUP BY status;' },
  {
    label: 'Critical defects ever logged',
    sql: `SELECT a.registration_no, d.defect_id, d.status, d.reported_at
FROM defect d
JOIN component c ON c.component_id = d.component_id
JOIN aircraft a  ON a.aircraft_id  = c.aircraft_id
WHERE d.severity = 'CRITICAL'
ORDER BY d.reported_at;`,
  },
  {
    label: 'Technician workload (window function)',
    sql: `SELECT t.name,
       COUNT(r.repair_id) AS repairs,
       RANK() OVER (ORDER BY COUNT(r.repair_id) DESC) AS rank
FROM technician t
LEFT JOIN repair r ON r.tech_id = t.tech_id
GROUP BY t.name;`,
  },
  { label: 'Index usage (EXPLAIN)', sql: "EXPLAIN ANALYZE\nSELECT * FROM defect WHERE status <> 'resolved' AND severity = 'CRITICAL';" },
]

const show = (v) => (v === null ? 'NULL' : typeof v === 'object' ? JSON.stringify(v) : String(v))

export default function SqlConsole() {
  const [sql, setSql] = useState(EXAMPLES[0].sql)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [run, pending] = useAction()

  async function execute() {
    setError('')
    const res = await run(async () => {
      try { return await api.post('/api/admin/query', { sql }) } catch (e) { setError(e.message); return undefined }
    })
    if (res) setResult(res)
  }

  return (
    <>
      <PageHeader title="SQL console">
        Read-only. Statements run in a read-only transaction with a five second limit, so nothing can be changed from here.
      </PageHeader>

      <div className="panel stack">
        <Field label="Start from an example">
          <select className="input" onChange={(e) => { setSql(EXAMPLES[e.target.selectedIndex].sql); setResult(null); setError('') }}>
            {EXAMPLES.map((x) => <option key={x.label}>{x.label}</option>)}
          </select>
        </Field>
        <Field label="Query" hint="Press Ctrl+Enter (or Cmd+Enter) to run.">
          <textarea className="input code" rows={8} value={sql} spellCheck={false}
                    onChange={(e) => setSql(e.target.value)}
                    onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') execute() }} />
        </Field>
        <div className="form-actions">
          <button className="btn btn-primary" onClick={execute} disabled={pending || !sql.trim()}>{pending ? 'Running…' : 'Run query'}</button>
        </div>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {result && (
        <div className="report">
          <p className="result-meta">
            {result.rows.length} row{result.rows.length === 1 ? '' : 's'}{result.truncated ? ' (showing the first 500)' : ''}
          </p>
          {result.columns.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr>{result.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i}>{r.map((v, j) => <td key={j} className={v === null ? 'null' : undefined}>{show(v)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  )
}
