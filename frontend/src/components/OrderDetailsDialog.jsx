import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

export default function OrderDetailsDialog({
  order,
  onClose,
  onFetchOrderDetails,
  onSavePhysicalQuantities,
  authenticatedEmployeeId,
  selectedWarehouse,
}) {
  const [orderDetails, setOrderDetails] = useState([])
  const [detailsLoading, setDetailsLoading] = useState(true)
  const [detailsSaving, setDetailsSaving] = useState(false)
  const [detailsError, setDetailsError] = useState('')
  const [detailsSaved, setDetailsSaved] = useState(false)
  const [physicalQuantities, setPhysicalQuantities] = useState({})
  const [controlQuantities, setControlQuantities] = useState({})
  const [physicalDirty, setPhysicalDirty] = useState(false)
  const [controlDirty, setControlDirty] = useState(false)

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

  async function savePhysicalQuantities() {
    setDetailsSaving(true)
    setDetailsError('')
    setDetailsSaved(false)

    try {
      await onSavePhysicalQuantities(
        order,
        physicalQuantities,
        controlQuantities,
        physicalDirty ? authenticatedEmployeeId : '',
        controlDirty ? authenticatedEmployeeId : '',
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
        className="max-h-[90vh] w-full max-w-2xl overflow-hidden border border-slate-200 bg-white shadow-2xl"
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
          ) : detailsError ? (
            <p role="alert" className="py-10 text-center text-sm text-rose-700">{detailsError}</p>
          ) : orderDetails.length ? (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-left text-sm">
                <colgroup>
                  <col className="w-[34%]" />
                  <col className="w-[15%]" />
                  <col className="w-[25.5%]" />
                  <col className="w-[25.5%]" />
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
                    return (
                      <tr key={detailKey} className="border-b border-slate-100">
                        <td className="break-words px-1 py-3 font-medium text-slate-900 sm:px-3">{detail.Label1 || '—'}</td>
                        <td className="break-words px-1 py-3 text-slate-600 sm:px-3">{detail.Quantity ?? '—'}</td>
                        <td className="px-1 py-2 sm:px-3">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={physicalQuantities[detailKey] ?? ''}
                            onChange={(event) => {
                              setDetailsSaved(false)
                              setPhysicalDirty(true)
                              setPhysicalQuantities((current) => ({ ...current, [detailKey]: event.target.value }))
                            }}
                            aria-label={`Physical quantity for ${detail.Label1 || 'item'}`}
                            className="w-full min-w-0 rounded-md border border-slate-300 px-1.5 py-2 text-xs text-slate-900 outline-none focus:border-emerald-600 sm:px-3 sm:text-sm"
                          />
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
                {(order.warehouseName || order.warehouse_name || selectedWarehouse || 'Selected warehouse')} · {orderDetails.length} line items
              </p>
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
              No details found for {(order.warehouseName || order.warehouse_name || selectedWarehouse || 'the selected warehouse')}.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
