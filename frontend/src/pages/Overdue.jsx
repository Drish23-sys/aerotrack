import { api } from '../api.js'
import { DataTable, ErrorBlock, Loading, PageHeader, Reg, fmtDate, useLoad } from '../ui.jsx'

export default function Overdue() {
  const { data, error, loading, reload } = useLoad(() => api.get('/api/overdue'))
  if (loading) return <Loading />
  if (error) return <ErrorBlock message={error} onRetry={reload} />

  return (
    <>
      <PageHeader title="Overdue inspections">
        Components whose inspection interval has run out. Closing an inspection resets the clock for every component on that aircraft.
      </PageHeader>
      <DataTable rowKey={(r) => r.component_id} rows={data} empty="Every component is within its inspection interval."
        columns={[
          { label: 'Aircraft', render: (r) => <Reg>{r.registration_no}</Reg> },
          { label: 'Component', key: 'component' },
          { label: 'Serial', render: (r) => <span className="serial">{r.serial_no}</span> },
          { label: 'Last inspected', render: (r) => (r.last_inspected_date ? fmtDate(r.last_inspected_date) : 'Never') },
          { label: 'Was due', render: (r) => fmtDate(r.due_date) },
          { label: 'Days overdue', align: 'right', render: (r) => <strong className={r.days_overdue > 60 ? 'late' : undefined}>{r.days_overdue}</strong> },
        ]} />
    </>
  )
}
