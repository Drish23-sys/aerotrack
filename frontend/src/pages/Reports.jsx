import { useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api } from '../api.js'
import { DataTable, ErrorBlock, Loading, PageHeader, Tabs, fmtMoney, sentence, useLoad } from '../ui.jsx'

const AXIS = { tickLine: false, tick: { fontSize: 12, fill: '#46586C' } }

function Chart({ spec, rows }) {
  const money = spec.y.includes('cost')
  const fmt = (v) => (money ? fmtMoney(v) : v)
  const margin = { top: 8, right: 12, bottom: 0, left: money ? 12 : -10 }
  return (
    <div className="chart-box" role="img" aria-label={`${spec.y_label} by ${spec.x.replace(/_/g, ' ')}`}>
      <ResponsiveContainer width="100%" height={300}>
        {spec.type === 'line' ? (
          <LineChart data={rows} margin={margin}>
            <CartesianGrid vertical={false} stroke="#E1E6EB" />
            <XAxis dataKey={spec.x} {...AXIS} axisLine={{ stroke: '#A9B5C0' }} />
            <YAxis allowDecimals={false} axisLine={false} {...AXIS} tickFormatter={fmt} />
            <Tooltip formatter={(v) => [fmt(v), spec.y_label]} />
            <Line isAnimationActive={false} type="monotone" dataKey={spec.y} stroke="#10233A" strokeWidth={2.5} dot={{ r: 4, fill: '#10233A' }} />
          </LineChart>
        ) : (
          <BarChart data={rows} margin={margin}>
            <CartesianGrid vertical={false} stroke="#E1E6EB" />
            <XAxis dataKey={spec.x} {...AXIS} axisLine={{ stroke: '#A9B5C0' }} />
            <YAxis axisLine={false} {...AXIS} tickFormatter={fmt} />
            <Tooltip cursor={{ fill: 'rgba(16,35,58,.06)' }} formatter={(v) => [fmt(v), spec.y_label]} />
            <Bar isAnimationActive={false} dataKey={spec.y} fill="#10233A" radius={[3, 3, 0, 0]} maxBarSize={64} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

export default function Reports() {
  const list = useLoad(() => api.get('/api/reports'))
  const [key, setKey] = useState('')
  const activeKey = key || list.data?.[0]?.key
  const report = useLoad(() => (activeKey ? api.get(`/api/reports/${activeKey}`) : Promise.resolve(null)), [activeKey])

  if (list.loading) return <Loading />
  if (list.error) return <ErrorBlock message={list.error} onRetry={list.reload} />

  const rows = report.data?.rows || []
  const columns = rows[0]
    ? Object.keys(rows[0]).map((k) => ({
        label: sentence(k), key: k,
        align: typeof rows[0][k] === 'number' ? 'right' : undefined,
        render: (r) => (k.includes('cost') ? fmtMoney(r[k]) : r[k]),
      }))
    : []

  return (
    <>
      <PageHeader title="Reports">Every report is a SQL query over the live data.</PageHeader>
      <Tabs label="Reports" value={activeKey} onChange={setKey} tabs={list.data.map((r) => ({ key: r.key, label: r.title }))} />

      {report.loading && <Loading />}
      {report.error && <ErrorBlock message={report.error} onRetry={report.reload} />}
      {report.data && (
        <div className="report">
          <h2 className="report-title">{report.data.title}</h2>
          {rows.length > 0 && <Chart spec={report.data.chart} rows={rows} />}
          <DataTable rows={rows} columns={columns} empty="There is no data for this report yet." />
        </div>
      )}
    </>
  )
}
