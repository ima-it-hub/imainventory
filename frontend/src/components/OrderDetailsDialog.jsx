import { useEffect, useState } from 'react'
import { Printer, X } from 'lucide-react'
import { useToast } from './ToastProvider'

function formatQuantity(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return number.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('fr-FR')
}

function getColisageCoefficient(detail) {
  const raw = detail.Colisage ?? detail.colisage ?? detail.Coefficient ?? detail.coefficient
  const coefficient = Number(raw)
  return Number.isFinite(coefficient) && coefficient > 0 ? coefficient : null
}

function formatColisage(detail) {
  const coefficient = getColisageCoefficient(detail)
  const quantity = Number(detail.Quantity)
  if (!coefficient || !Number.isFinite(quantity)) return '—'
  const packs = quantity / coefficient
  const packsLabel = packs.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const coefficientLabel = coefficient.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
  return `${packsLabel} x ${coefficientLabel}`
}

export default function OrderDetailsDialog({
  order,
  onClose,
  onFetchOrderDetails,
  onSavePhysicalQuantities,
  authenticatedEmployeeId,
  selectedWarehouse,
  warehouses = [],
  enableDemandTransfer = true,
  onPrintTicket,
  warehouseFooter,
}) {
  const toast = useToast()
  const [orderDetails, setOrderDetails] = useState([])
  const [detailsLoading, setDetailsLoading] = useState(true)
  const [detailsSaving, setDetailsSaving] = useState(false)
  const [detailsError, setDetailsError] = useState('')
  const [physicalQuantities, setPhysicalQuantities] = useState({})
  const [controlQuantities, setControlQuantities] = useState({})
  const [demandWarehouses, setDemandWarehouses] = useState({})
  const [physicalDirty, setPhysicalDirty] = useState(false)
  const [controlDirty, setControlDirty] = useState(false)

  const documentCode = order.orderNumber || order.reference || ''
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
        if (enableDemandTransfer) {
          setDemandWarehouses(Object.fromEntries(
            details
              .filter((detail) => detail.demandSourceWarehouse)
              .map((detail) => [detail.detailKey, detail.demandSourceWarehouse]),
          ))
        }
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
  }, [order.id, order.orderNumber, order.reference, enableDemandTransfer])

  function needsDemandTransfer(detailKey, systemQuantity) {
    if (!enableDemandTransfer) return false
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

  function handlePhysicalChange(detail, nextValue) {
    const detailKey = detail.detailKey
    setPhysicalDirty(true)
    setPhysicalQuantities((current) => ({ ...current, [detailKey]: nextValue }))
    if (!enableDemandTransfer) return
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
  }

  function renderDemandSelect(detail) {
    const detailKey = detail.detailKey
    if (!needsDemandTransfer(detailKey, detail.Quantity)) return null
    const shortage = differenceQuantity(detailKey, detail.Quantity)
    return (
      <div className="mt-2 space-y-1">
        <p className="text-[11px] font-medium text-amber-800">
          Short by {shortage}
        </p>
        <select
          value={demandWarehouses[detailKey] || ''}
          onChange={(event) => {
            setPhysicalDirty(true)
            setDemandWarehouses((current) => ({
              ...current,
              [detailKey]: event.target.value,
            }))
          }}
          aria-label={`Demand transfer warehouse for ${detail.Label1 || 'item'}`}
          className="w-full rounded-md border border-amber-300 bg-amber-50 px-1.5 py-1.5 text-xs text-slate-900 outline-none focus:border-amber-500"
        >
          <option value="">No demand transfer</option>
          {warehouseOptions.map((warehouse) => (
            <option key={warehouse} value={warehouse}>{warehouse}</option>
          ))}
        </select>
      </div>
    )
  }

  async function savePhysicalQuantities() {
    setDetailsSaving(true)
    setDetailsError('')

    const activeDemandTransfers = enableDemandTransfer
      ? Object.fromEntries(
        orderDetails
          .filter((detail) => needsDemandTransfer(detail.detailKey, detail.Quantity))
          .map((detail) => [detail.detailKey, String(demandWarehouses[detail.detailKey] || '').trim()])
          .filter(([, warehouse]) => warehouse),
      )
      : {}

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
      setPhysicalDirty(false)
      setControlDirty(false)
      toast.success('Quantities saved.')
    } catch (error) {
      const message = error.message || 'Unable to save physical quantities'
      setDetailsError(message)
      toast.error(message)
    } finally {
      setDetailsSaving(false)
    }
  }

  const linesLabel = `${orderDetails.length} ligne${orderDetails.length === 1 ? '' : 's'}`
  const footerLabel = warehouseFooter
    ? `${warehouseFooter} · ${linesLabel}`
    : `${requestingWarehouse || 'Selected warehouse'} · ${linesLabel}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-2 sm:p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-details-title"
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden border border-slate-300 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="relative shrink-0 border-b border-slate-300 px-4 pb-3 pt-4 sm:px-5 sm:pb-4 sm:pt-5">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center border border-slate-200 text-slate-600 hover:bg-slate-100"
            aria-label="Close order details"
          >
            <X className="h-4 w-4" />
          </button>

          <h2 id="order-details-title" className="pr-10 text-center text-lg font-black uppercase tracking-[0.08em] text-slate-900 sm:text-2xl">
            Preparation{' '}
            <span className="ml-1 tracking-normal sm:ml-2">{documentCode}</span>
          </h2>

          <div className="mt-3 flex items-start justify-between gap-3 text-sm text-slate-800">
            <div className="min-w-0 space-y-1">
              <p className="break-words">
                <span className="font-semibold">Client :</span>{' '}
                <span className="font-medium">{order.customerName || '—'}</span>
              </p>
              <p>
                <span className="font-semibold">Wilaya :</span>{' '}
                <span className="font-medium">{order.wilaya || '—'}</span>
              </p>
            </div>
            <p className="shrink-0 whitespace-nowrap">
              <span className="font-semibold">Date :</span>{' '}
              <span className="font-medium">{formatDate(order.createdAt || order.created_at || order.Date || order.transferDate)}</span>
            </p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-5">
          {detailsLoading ? (
            <p className="py-10 text-center text-sm text-slate-500">Loading order details...</p>
          ) : detailsError && !orderDetails.length ? (
            <p role="alert" className="py-10 text-center text-sm text-rose-700">{detailsError}</p>
          ) : orderDetails.length ? (
            <div className="w-full">
              <div className="space-y-3 min-[480px]:hidden">
                {orderDetails.map((detail, index) => {
                  const detailKey = detail.detailKey
                  return (
                    <article key={detailKey} className="border border-slate-300 bg-white p-3">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">N° {index + 1}</p>
                        <p className="text-xs font-semibold text-slate-600">{formatColisage(detail)}</p>
                      </div>
                      <p className="text-sm font-semibold leading-snug text-slate-900">{detail.Label1 || '—'}</p>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div>
                          <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">Qté CMD</p>
                          <p className="text-sm tabular-nums text-slate-800">{formatQuantity(detail.Quantity)}</p>
                        </div>
                        <div>
                          <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">Préparé</p>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={physicalQuantities[detailKey] ?? ''}
                            onChange={(event) => handlePhysicalChange(detail, event.target.value)}
                            aria-label={`Qté préparé for ${detail.Label1 || 'item'}`}
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-center text-sm text-slate-900 outline-none focus:border-emerald-600"
                          />
                        </div>
                        <div>
                          <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">Contrôle</p>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={controlQuantities[detailKey] ?? ''}
                            onChange={(event) => {
                              setControlDirty(true)
                              setControlQuantities((current) => ({ ...current, [detailKey]: event.target.value }))
                            }}
                            aria-label={`Qté contrôle for ${detail.Label1 || 'item'}`}
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-center text-sm text-slate-900 outline-none focus:border-emerald-600"
                          />
                        </div>
                      </div>
                      {renderDemandSelect(detail)}
                    </article>
                  )
                })}
              </div>

              <div className="hidden min-[480px]:block">
                <table className="w-full table-fixed border-collapse border border-slate-300 text-left text-sm">
                  <colgroup>
                    <col className="w-[5%]" />
                    <col className="w-[42%]" />
                    <col className="w-[11%]" />
                    <col className="w-[14%]" />
                    <col className="w-[14%]" />
                    <col className="w-[14%]" />
                  </colgroup>
                  <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="border border-slate-300 px-2 py-2 text-center font-bold">N°</th>
                      <th className="border border-slate-300 px-3 py-2 font-bold">Désignation</th>
                      <th className="border border-slate-300 px-2 py-2 text-right font-bold">Qté CMD</th>
                      <th className="border border-slate-300 px-2 py-2 text-center font-bold">Colissage</th>
                      <th className="border border-slate-300 px-2 py-2 text-center font-bold">Préparé</th>
                      <th className="border border-slate-300 px-2 py-2 text-center font-bold">Contrôle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderDetails.map((detail, index) => {
                      const detailKey = detail.detailKey
                      return (
                        <tr key={detailKey} className="align-top odd:bg-white even:bg-slate-50/70">
                          <td className="border border-slate-300 px-2 py-2 text-center font-semibold text-slate-700">
                            {index + 1}
                          </td>
                          <td className="break-words border border-slate-300 px-3 py-2 font-medium leading-snug whitespace-normal text-slate-900">
                            {detail.Label1 || '—'}
                          </td>
                          <td className="border border-slate-300 px-2 py-2 text-right tabular-nums whitespace-nowrap text-slate-700">
                            {formatQuantity(detail.Quantity)}
                          </td>
                          <td className="border border-slate-300 px-2 py-2 text-center tabular-nums whitespace-nowrap text-slate-700">
                            {formatColisage(detail)}
                          </td>
                          <td className="border border-slate-300 px-2 py-2 text-center">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={physicalQuantities[detailKey] ?? ''}
                              onChange={(event) => handlePhysicalChange(detail, event.target.value)}
                              aria-label={`Qté préparé for ${detail.Label1 || 'item'}`}
                              className="mx-auto block w-16 rounded-md border border-slate-300 px-1.5 py-1.5 text-center text-sm text-slate-900 outline-none focus:border-emerald-600"
                            />
                            {renderDemandSelect(detail)}
                          </td>
                          <td className="border border-slate-300 px-2 py-2 text-center">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={controlQuantities[detailKey] ?? ''}
                              onChange={(event) => {
                                setControlDirty(true)
                                setControlQuantities((current) => ({ ...current, [detailKey]: event.target.value }))
                              }}
                              aria-label={`Qté contrôle for ${detail.Label1 || 'item'}`}
                              className="mx-auto block w-16 rounded-md border border-slate-300 px-1.5 py-1.5 text-center text-sm text-slate-900 outline-none focus:border-emerald-600"
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-xs text-slate-500">{footerLabel}</p>
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
                {onPrintTicket && (
                  <button
                    type="button"
                    onClick={() => onPrintTicket(order)}
                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    <Printer className="h-4 w-4" />
                    Print e-ticket
                  </button>
                )}
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
