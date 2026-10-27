import { useState } from 'react'
import { api } from '../api.js'
import { DataTable, ErrorBlock, Field, Loading, PageHeader, fmtDateTime, useLoad } from '../ui.jsx'

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

const TABLES = ['all', 'aircraft', 'inspection', 'defect', 'repair']
const fmt = (v) => (v === null || v === undefined ? 'none' : ISO.test(String(v)) ? fmtDateTime(v) : String(v))

function Details({ row }) {
  const entries = Object.entries(row.details || {})
  if (entries.length === 0) return <span className="subtle">No field changes</span>
  const shown = row.action === 'UPDATE' ? entries : entries.slice(0, 6)
  return (
    <ul className="diff">
      {shown.map(([k, v]) => (
        <li key={k}>
          <span className="diff-key">{k}</span>
          {row.action === 'UPDATE'
            ? <> <span className="diff-old">{fmt(v[0])}</span> to <span className="diff-new">{fmt(v[1])}</span></>
            : <> {fmt(v)}</>}
        </li>
      ))}
      {row.action !== 'UPDATE' && entries.length > shown.length && <li className="subtle">and {entries.length - shown.length} more fields</li>}
    </ul>
  )
}

export default function AuditLog() {
  const [table, setTable] = useState('all')
  const { data, error, loading, reload } = useLoad(() => api.get(`/api/admin/audit?table=${table}&limit=100`), [table])

  return (
    <>
      <PageHeader title="Audit log">
        Written by database triggers on every insert, update and delete of aircraft, inspections, defects and repairs. For updates, only the fields that changed are shown.
      </PageHeader>
      <div className="filters">
        <Field label="Table">
          <select className="input" value={table} onChange={(e) => setTable(e.target.value)}>
            {TABLES.map((t) => <option key={t} value={t}>{t === 'all' ? 'All tables' : t}</option>)}
          </select>
        </Field>
        <button type="button" className="btn" onClick={reload}>Refresh</button>
      </div>

      {loading && <Loading />}
      {error && <ErrorBlock message={error} onRetry={reload} />}
      {data && (
        <DataTable rowKey={(r) => r.log_id} rows={data} empty="The audit log is empty."
          columns={[
            { label: 'When', render: (r) => fmtDateTime(r.changed_at) },
            { label: 'Table', key: 'table_name' },
            { label: 'Record', render: (r) => `#${r.record_id}` },
            { label: 'Action', render: (r) => <span className={`act act-${r.action.toLowerCase()}`}>{r.action.toLowerCase()}</span> },
            { label: 'By', key: 'changed_by' },
            { label: 'What changed', render: (r) => <Details row={r} />, className: 'wrap' },
          ]} />
      )}
    </>
  )
}
