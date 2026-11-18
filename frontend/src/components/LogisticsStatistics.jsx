import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart3, Filter, RefreshCcw } from 'lucide-react'

const STATUS_COLORS = {
  Pending: '#f59e0b',
  Packing: '#0ea5e9',
  Ready: '#6366f1',
  Delivered: '#14b8a6',
  Cancelled: '#94a3b8',
  Failed: '#f43f5e',
  Annulled: '#64748b',
  pending: '#f59e0b',
  accepted: '#10b981',
  doesnt_have: '#f43f5e',
  transferred: '#6366f1',
}

const CHART_COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#f43f5e', '#14b8a6', '#6366f1', '#84cc16']

function formatDuration(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) return '—'
  const minutes = value / 60
  if (minutes < 60) return `${Math.round(minutes)} min`
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  return `${hours}h ${rest}m`
}

function colorFor(name, index) {
  return STATUS_COLORS[name] || CHART_COLORS[index % CHART_COLORS.length]
}

function ChartCard({ title, children, empty }) {
  return (
    <section className="border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-slate-900">{title}</h3>
      {empty ? <p className="py-10 text-center text-sm text-slate-500">No data for the selected filters.</p> : children}
    </section>
  )
}

function StatCard({ label, value, hint, accent = 'blue' }) {
  const accents = {
    blue: 'accent-blue',
    emerald: 'accent-emerald',
    amber: 'accent-amber',
    sky: 'accent-sky',
  }
  return (
    <div className={`summary-card ${accents[accent] || 'accent-blue'} border border-slate-200 bg-white p-4`}>
      <span className="summary-label">{label}</span>
      <strong className="text-lg">{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  )
}

export default function LogisticsStatistics({ apiUrl, warehouses = [], employees = [] }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [employee, setEmployee] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadStatistics(nextFilters = {}) {
    const nextFrom = nextFilters.from ?? from
    const nextTo = nextFilters.to ?? to
    const nextWarehouse = nextFilters.warehouse ?? warehouse
    const nextEmployee = nextFilters.employee ?? employee
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (nextFrom) params.set('from', nextFrom)
      if (nextTo) params.set('to', nextTo)
      if (nextWarehouse) params.set('warehouse', nextWarehouse)
      if (nextEmployee) params.set('employee', nextEmployee)
      const query = params.toString()
      const response = await fetch(`${apiUrl}/api/logistics/statistics${query ? `?${query}` : ''}`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to load statistics')
      setData(payload)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load statistics')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStatistics()
  }, [])

  const cards = data?.cards || {}
  const charts = data?.charts || {}
  const matchRate = cards.totalOrders
    ? `${Math.round((Number(cards.matchedOrders || 0) / cards.totalOrders) * 100)}%`
    : '—'

  const employeeOptions = useMemo(() => (
    [...employees].sort((a, b) => String(a.name || a.employee_id).localeCompare(String(b.name || b.employee_id)))
  ), [employees])

  function hasRows(rows) {
    return Array.isArray(rows) && rows.some((row) => Number(row.value || row.orders || row.demands || row.transfers || row.minutes || 0) > 0)
  }

  return (
    <section className="space-y-4">
      <div className="border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
          <Filter className="h-4 w-4 text-slate-500" />
          Filters
        </div>
        <form
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault()
            loadStatistics()
          }}
        >
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            From
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900" />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            To
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900" />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Warehouse
            <select value={warehouse} onChange={(event) => setWarehouse(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
              <option value="">All warehouses</option>
              {warehouses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Employee
            <select value={employee} onChange={(event) => setEmployee(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
              <option value="">All employees</option>
              {employeeOptions.map((item) => (
                <option key={item.employee_id} value={item.employee_id}>
                  {item.name || item.employee_id} ({item.employee_id})
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="inline-flex items-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800">
              <BarChart3 className="h-4 w-4" />
              Apply
            </button>
            <button
              type="button"
              onClick={() => {
                setFrom('')
                setTo('')
                setWarehouse('')
                setEmployee('')
                loadStatistics({ from: '', to: '', warehouse: '', employee: '' })
              }}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              <RefreshCcw className="h-4 w-4" />
              Reset
            </button>
          </div>
        </form>
      </div>

      {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
      {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading statistics...</p> : null}

      {!loading && data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Orders" value={cards.totalOrders || 0} hint="Filtered logistics orders" />
            <StatCard label="Pending / Packing" value={`${cards.pending || 0} / ${cards.packing || 0}`} hint="Waiting or in preparation" accent="amber" />
            <StatCard label="Ready / Delivered" value={`${cards.ready || 0} / ${cards.delivered || 0}`} hint="Prepared vs delivered" accent="emerald" />
            <StatCard label="Qty match rate" value={matchRate} hint={`${cards.matchedOrders || 0} matched orders`} accent="sky" />
            <StatCard label="Avg preparation" value={formatDuration(cards.avgPackingSeconds)} hint="Packing start to ready" />
            <StatCard label="Avg to ready" value={formatDuration(cards.avgReadySeconds)} hint="Created to ready" accent="amber" />
            <StatCard label="Avg delivery" value={formatDuration(cards.avgDeliverySeconds)} hint="Ready to delivered" accent="emerald" />
            <StatCard label="Created to delivered" value={formatDuration(cards.avgCreatedToDeliveredSeconds)} hint="Full order cycle" accent="sky" />
            <StatCard label="Prep employees" value={cards.prepEmployees || 0} hint="Employees who prepared orders" />
            <StatCard label="Control employees" value={cards.controlEmployees || 0} hint="Employees who controlled orders" accent="amber" />
            <StatCard label="Demand transfers" value={cards.demandTransfers || 0} hint="Shortage demand lines" accent="emerald" />
            <StatCard label="Transfers" value={cards.transfers || 0} hint="Warehouse transfer documents" accent="sky" />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Orders by status" empty={!hasRows(charts.ordersByStatus)}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={charts.ordersByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                      {(charts.ordersByStatus || []).map((entry, index) => (
                        <Cell key={entry.name} fill={colorFor(entry.name, index)} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Orders over time" empty={!hasRows(charts.ordersByDay)}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={charts.ordersByDay}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="orders" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="ready" stroke="#6366f1" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="delivered" stroke="#14b8a6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Orders by warehouse" empty={!hasRows(charts.ordersByWarehouse)}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.ordersByWarehouse} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#0ea5e9" name="Orders" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Orders by wilaya" empty={!hasRows(charts.ordersByWilaya)}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.ordersByWilaya} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#8b5cf6" name="Orders" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Orders prepared by employee" empty={!hasRows(charts.preparedByEmployee)}>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.preparedByEmployee} layout="vertical" margin={{ left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#10b981" name="Prepared" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Orders controlled by employee" empty={!hasRows(charts.controlledByEmployee)}>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.controlledByEmployee} layout="vertical" margin={{ left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#f59e0b" name="Controlled" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Average preparation time by employee (min)" empty={!hasRows(charts.packingTimeByEmployee)}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.packingTimeByEmployee}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={70} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="minutes" fill="#0ea5e9" name="Minutes" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Average delivery time by employee (min)" empty={!hasRows(charts.deliveryTimeByEmployee)}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.deliveryTimeByEmployee}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={70} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="minutes" fill="#14b8a6" name="Minutes" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Orders by hour of day" empty={!hasRows(charts.ordersByHour)}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.ordersByHour}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#6366f1" name="Orders" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Orders by weekday" empty={!hasRows(charts.ordersByWeekday)}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.ordersByWeekday}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#f43f5e" name="Orders" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Demand transfers by status" empty={!hasRows(charts.demandByStatus)}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={charts.demandByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                      {(charts.demandByStatus || []).map((entry, index) => (
                        <Cell key={entry.name} fill={colorFor(entry.name, index)} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Demand transfers over time" empty={!hasRows(charts.demandByDay)}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={charts.demandByDay}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="demands" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Demand by source warehouse" empty={!hasRows(charts.demandBySource)}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.demandBySource} layout="vertical" margin={{ left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#f59e0b" name="Demands" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Demand by requesting warehouse" empty={!hasRows(charts.demandByRequesting)}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.demandByRequesting} layout="vertical" margin={{ left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#0ea5e9" name="Demands" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Transfers by status" empty={!hasRows(charts.transfersByStatus)}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={charts.transfersByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                      {(charts.transfersByStatus || []).map((entry, index) => (
                        <Cell key={entry.name} fill={colorFor(entry.name, index)} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Transfers over time" empty={!hasRows(charts.transfersByDay)}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={charts.transfersByDay}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="transfers" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Transfers by source warehouse" empty={!hasRows(charts.transfersBySource)}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.transfersBySource} layout="vertical" margin={{ left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#6366f1" name="Transfers" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Transfers by destination warehouse" empty={!hasRows(charts.transfersByDestination)}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.transfersByDestination} layout="vertical" margin={{ left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#14b8a6" name="Transfers" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>
        </>
      ) : null}
    </section>
  )
}
