import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

export default function OrderDetailsDialog({
  order,
  onClose,
  onFetchOrderDetails,
  onSavePhysicalQuantities,
  authenticatedEmployeeId,
  selectedWarehouse,
  warehouses = [],
}) {
  const [orderDetails, setOrderDetails] = useState([])
  const [detailsLoading, setDetailsLoading] = useState(true)
  const [detailsSaving, setDetailsSaving] = useState(false)
  const [detailsError, setDetailsError] = useState('')
  const [detailsSaved, setDetailsSaved] = useState(false)
  const [physicalQuantities, setPhysicalQuantities] = useState({})
  const [controlQuantities, setControlQuantities] = useState({})
  const [demandWarehouses, setDemandWarehouses] = useState({})
  const [physicalDirty, setPhysicalDirty] = useState(false)
  const [controlDirty, setControlDirty] = useState(false)

  const requestingWarehouse = String(
    order.warehouseName || order.warehouse_name || selectedWarehouse || '',
  ).trim()

  const warehouseOptions = warehouses
    .map((warehouse) => String(warehouse || '').trim())
    .filter((warehouse) => warehouse && warehouse.toLowerCase() !== requestingWarehouse.toLowerCase())

  useEffect(() => {
    let isMounted = true

    async function loadDetails() {
      try {
        const details = await onFetchOrderDetails(order)
        if (!isMounted) return
        setOrderDetails(details)
        setPhysicalQuantities(Object.fromEntries(
          details.map((detail) => [detail.detailKey, detail.physicalQuantity ?? '']),
        ))
        setControlQuantities(Object.fromEntries(
          details.map((detail) => [detail.detailKey, detail.controlQuantity ?? '']),
        ))
        setDemandWarehouses(Object.fromEntries(
          details
            .filter((detail) => detail.demandSourceWarehouse)
            .map((detail) => [detail.detailKey, detail.demandSourceWarehouse]),
        ))
      } catch (error) {
        if (isMounted) setDetailsError(error.message || 'Unable to fetch order details')
      } finally {
        if (isMounted) setDetailsLoading(false)
      }
    }

    loadDetails()
    return () => {
      isMounted = false
    }
  }, [order.id, order.orderNumber])

  function needsDemandTransfer(detailKey, systemQuantity) {
    const rawPhysical = physicalQuantities[detailKey]
    if (rawPhysical === '' || rawPhysical === null || rawPhysical === undefined) return false
    const physical = Number(rawPhysical)
    const system = Number(systemQuantity)
    return Number.isFinite(physical) && Number.isFinite(system) && physical < system
  }

  function differenceQuantity(detailKey, systemQuantity) {
    const physical = Number(physicalQuantities[detailKey])
    const system = Number(systemQuantity)
    if (!Number.isFinite(physical) || !Number.isFinite(system)) return 0
    return Math.max(0, system - physical)
  }

  async function savePhysicalQuantities() {
    setDetailsSaving(true)
    setDetailsError('')
    setDetailsSaved(false)

    const activeDemandTransfers = Object.fromEntries(
      orderDetails
        .filter((detail) => needsDemandTransfer(detail.detailKey, detail.Quantity))
        .map((detail) => [detail.detailKey, String(demandWarehouses[detail.detailKey] || '').trim()])
        .filter(([, warehouse]) => warehouse),
    )

    try {
      await onSavePhysicalQuantities(
        order,
        physicalQuantities,
        controlQuantities,
        physicalDirty ? authenticatedEmployeeId : '',
        controlDirty ? authenticatedEmployeeId : '',
        activeDemandTransfers,
        requestingWarehouse,
      )
      setDetailsSaved(true)
      setPhysicalDirty(false)
      setControlDirty(false)
    } catch (error) {
      setDetailsError(error.message || 'Unable to save physical quantities')
    } finally {
      setDetailsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-details-title"
        className="max-h-[90vh] w-full max-w-3xl overflow-hidden border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="order-details-title" className="text-lg font-bold text-slate-900">Order details</h2>
            <p className="mt-1 text-sm text-slate-600">{order.orderNumber} · {order.customerName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center border border-slate-200 text-slate-600 hover:bg-slate-100"
            aria-label="Close order details"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="max-h-[calc(90vh-80px)] overflow-auto p-5">
          {detailsLoading ? (
            <p className="py-10 text-center text-sm text-slate-500">Loading order details...</p>
          ) : detailsError && !orderDetails.length ? (
            <p role="alert" className="py-10 text-center text-sm text-rose-700">{detailsError}</p>
          ) : orderDetails.length ? (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-left text-sm">
                <colgroup>
                  <col className="w-[28%]" />
                  <col className="w-[12%]" />
                  <col className="w-[30%]" />
                  <col className="w-[30%]" />
                </colgroup>
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    {['Item', 'System quantity', 'Physical quantity', 'Control quantity'].map((label) => (
                      <th key={label} className="border-b border-slate-200 px-1 py-2 text-[9px] font-semibold leading-tight sm:px-3 sm:text-xs">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orderDetails.map((detail) => {
                    const detailKey = detail.detailKey
                    const showDemandSelect = needsDemandTransfer(detailKey, detail.Quantity)
                    const shortage = differenceQuantity(detailKey, detail.Quantity)
                    return (
                      <tr key={detailKey} className="border-b border-slate-100 align-top">
                        <td className="break-words px-1 py-3 font-medium text-slate-900 sm:px-3">{detail.Label1 || '—'}</td>
                        <td className="break-words px-1 py-3 text-slate-600 sm:px-3">{detail.Quantity ?? '—'}</td>
                        <td className="px-1 py-2 sm:px-3">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={physicalQuantities[detailKey] ?? ''}
                            onChange={(event) => {
                              const nextValue = event.target.value
                              setDetailsSaved(false)
                              setPhysicalDirty(true)
                              setPhysicalQuantities((current) => ({ ...current, [detailKey]: nextValue }))
                              const physical = Number(nextValue)
                              const system = Number(detail.Quantity)
                              if (!(Number.isFinite(physical) && Number.isFinite(system) && physical < system)) {
                                setDemandWarehouses((current) => {
                                  if (!(detailKey in current)) return current
                                  const next = { ...current }
                                  delete next[detailKey]
                                  return next
                                })
                              }
                            }}
                            aria-label={`Physical quantity for ${detail.Label1 || 'item'}`}
                            className="w-full min-w-0 rounded-md border border-slate-300 px-1.5 py-2 text-xs text-slate-900 outline-none focus:border-emerald-600 sm:px-3 sm:text-sm"
                          />
                          {showDemandSelect ? (
                            <div className="mt-2 space-y-1">
                              <p className="text-[11px] font-medium text-amber-800">
                                Short by {shortage}. Demand transfer from (optional):
                              </p>
                              <select
                                value={demandWarehouses[detailKey] || ''}
                                onChange={(event) => {
                                  setDetailsSaved(false)
                                  setPhysicalDirty(true)
                                  setDemandWarehouses((current) => ({
                                    ...current,
                                    [detailKey]: event.target.value,
                                  }))
                                }}
                                aria-label={`Demand transfer warehouse for ${detail.Label1 || 'item'}`}
                                className="w-full rounded-md border border-amber-300 bg-amber-50 px-1.5 py-1.5 text-xs text-slate-900 outline-none focus:border-amber-500 sm:text-sm"
                              >
                                <option value="">No demand transfer</option>
                                {warehouseOptions.map((warehouse) => (
                                  <option key={warehouse} value={warehouse}>{warehouse}</option>
                                ))}
                              </select>
                            </div>
                          ) : null}
                        </td>
                        <td className="px-1 py-2 sm:px-3">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={controlQuantities[detailKey] ?? ''}
                            onChange={(event) => {
                              setDetailsSaved(false)
                              setControlDirty(true)
                              setControlQuantities((current) => ({ ...current, [detailKey]: event.target.value }))
                            }}
                            aria-label={`Control quantity for ${detail.Label1 || 'item'}`}
                            className="w-full min-w-0 rounded-md border border-slate-300 px-1.5 py-2 text-xs text-slate-900 outline-none focus:border-emerald-600 sm:px-3 sm:text-sm"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-slate-500">
                {requestingWarehouse || 'Selected warehouse'} · {orderDetails.length} line items
              </p>
              {detailsError ? (
                <p role="alert" className="mt-3 text-sm text-rose-700">{detailsError}</p>
              ) : null}
              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
                <p aria-live="polite" className="text-sm text-emerald-700">{detailsSaved ? 'Quantities saved.' : ''}</p>
                <button
                  type="button"
                  onClick={savePhysicalQuantities}
                  disabled={detailsSaving}
                  className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {detailsSaving ? 'Saving...' : 'Save quantities'}
                </button>
              </div>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">
              No details found for {requestingWarehouse || 'the selected warehouse'}.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
