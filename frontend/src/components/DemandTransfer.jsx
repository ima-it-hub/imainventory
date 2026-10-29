import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, Check, Truck } from 'lucide-react'

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'doesnt_have', label: "Doesn't have" },
  { value: 'transferred', label: 'Transferred' },
]

const STATUS_SELECT_CLASSES = {
  pending: 'border-slate-300 bg-slate-100 text-slate-800',
  accepted: 'border-sky-300 bg-sky-100 text-sky-900',
  doesnt_have: 'border-amber-300 bg-amber-100 text-amber-950',
  transferred: 'border-emerald-300 bg-emerald-100 text-emerald-900',
}

function formatQuantity(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return Number.isInteger(number) ? String(number) : String(number)
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

function getOtherWarehouse(demand) {
  const isOutgoing = demand.direction === 'outgoing'
  return String(
    isOutgoing
      ? (demand.sourceWarehouse || '')
      : (demand.requestingWarehouse || ''),
  ).trim()
}

export default function DemandTransfer({
  demands = [],
  loading = false,
  error = '',
  selectedWarehouse = '',
  warehouses = [],
  onStatusChange,
  onQuantityChange,
  onBulkStatusChange,
  updatingId = null,
  bulkUpdating = false,
}) {
  const [quantityDrafts, setQuantityDrafts] = useState({})
  const [warehouseFilter, setWarehouseFilter] = useState('all')

  useEffect(() => {
    setQuantityDrafts(Object.fromEntries(
      demands.map((demand) => [demand.id, String(demand.differenceQuantity ?? '')]),
    ))
  }, [demands])

  const warehouseFilterOptions = useMemo(() => {
    const fromDemands = [...new Set(
      demands
        .map((demand) => getOtherWarehouse(demand))
        .filter(Boolean),
    )].sort((a, b) => a.localeCompare(b))

    const fromProps = (warehouses || [])
      .map((warehouse) => String(warehouse || '').trim())
      .filter((warehouse) => warehouse && warehouse.toLowerCase() !== String(selectedWarehouse || '').trim().toLowerCase())

    return [...new Set([...fromDemands, ...fromProps])].sort((a, b) => a.localeCompare(b))
  }, [demands, warehouses, selectedWarehouse])

  const filteredDemands = useMemo(() => {
    if (warehouseFilter === 'all') return demands
    const selected = warehouseFilter.toLowerCase()
    return demands.filter((demand) => getOtherWarehouse(demand).toLowerCase() === selected)
  }, [demands, warehouseFilter])

  async function commitQuantity(demand) {
    const rawValue = quantityDrafts[demand.id]
    const nextQuantity = Number(rawValue)
    const currentQuantity = Number(demand.differenceQuantity)
    if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
      setQuantityDrafts((current) => ({
        ...current,
        [demand.id]: String(demand.differenceQuantity ?? ''),
      }))
      return
    }
    if (nextQuantity === currentQuantity) return
    await onQuantityChange(demand.id, nextQuantity)
  }

  return (
    <section className="w-full border border-slate-200 bg-white p-4 shadow-none">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Demand Transfer</h2>
          <p className="mt-1 text-sm text-slate-600">
            Incoming requests for {selectedWarehouse || 'your warehouse'} and demands you sent to other warehouses.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!filteredDemands.length || bulkUpdating}
            onClick={() => onBulkStatusChange('accepted')}
            className="inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            Accept all
          </button>
          <button
            type="button"
            disabled={!filteredDemands.length || bulkUpdating}
            onClick={() => onBulkStatusChange('transferred')}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Truck className="h-3.5 w-3.5" />
            Transfer all
          </button>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {filteredDemands.length} open request{filteredDemands.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div className="mb-4 max-w-xs">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Filter by warehouse
        </label>
        <select
          value={warehouseFilter}
          onChange={(event) => setWarehouseFilter(event.target.value)}
          aria-label="Filter demand transfers by warehouse"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500"
        >
          <option value="all">All warehouses</option>
          {warehouseFilterOptions.map((warehouse) => (
            <option key={warehouse} value={warehouse}>{warehouse}</option>
          ))}
        </select>
      </div>

      {error ? (
        <p role="alert" className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="py-12 text-center text-sm text-slate-500">Loading demand transfers...</p>
      ) : filteredDemands.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {['Type', 'Order', 'Product', 'Demanded qty', 'Other warehouse', 'Status', 'Requested'].map((label) => (
                  <th key={label} className="border-b border-slate-200 px-3 py-2 font-semibold">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredDemands.map((demand) => {
                const isOutgoing = demand.direction === 'outgoing'
                const otherWarehouse = getOtherWarehouse(demand)
                const busy = updatingId === demand.id || bulkUpdating
                return (
                  <tr key={demand.id} className="border-b border-slate-100 align-top">
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${
                        isOutgoing
                          ? 'border-violet-200 bg-violet-50 text-violet-800'
                          : 'border-sky-200 bg-sky-50 text-sky-800'
                      }`}>
                        {isOutgoing ? 'You demanded' : 'Incoming'}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-900">{demand.orderNumber}</td>
                    <td className="px-3 py-3 text-slate-800">
                      <div className="font-medium">{demand.productLabel || '—'}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        System {formatQuantity(demand.systemQuantity)} · Physical {formatQuantity(demand.physicalQuantity)}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        min="0.0001"
                        step="any"
                        disabled={busy}
                        value={quantityDrafts[demand.id] ?? ''}
                        onChange={(event) => {
                          setQuantityDrafts((current) => ({
                            ...current,
                            [demand.id]: event.target.value,
                          }))
                        }}
                        onBlur={() => commitQuantity(demand)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.currentTarget.blur()
                          }
                        }}
                        aria-label={`Demanded quantity for ${demand.productLabel || 'product'}`}
                        className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-600 disabled:opacity-60"
                      />
                    </td>
                    <td className="px-3 py-3 text-slate-700">{otherWarehouse || '—'}</td>
                    <td className="px-3 py-3">
                      <select
                        value={demand.status || 'pending'}
                        disabled={busy}
                        onChange={(event) => onStatusChange(demand.id, event.target.value)}
                        aria-label={`Status for ${demand.productLabel || 'product'}`}
                        className={`rounded-md border px-2 py-1.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-60 ${
                          STATUS_SELECT_CLASSES[demand.status] || STATUS_SELECT_CLASSES.pending
                        }`}
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">{formatDate(demand.createdAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500">
            <ArrowLeftRight className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-slate-700">
            {demands.length ? 'No demand transfers for this warehouse filter' : 'No open demand transfers'}
          </p>
          <p className="max-w-md text-sm text-slate-500">
            Incoming requests for {selectedWarehouse || 'this warehouse'} and demands you create from order details appear here.
          </p>
        </div>
      )}
    </section>
  )
}
