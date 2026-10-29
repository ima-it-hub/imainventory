import { useEffect, useRef, useState } from 'react'
import OrderDetailsDialog from './OrderDetailsDialog'
import { useToast } from './ToastProvider'

const STATUS_COLUMNS = [
  { status: 'Pending', label: 'À préparer', accent: 'border-rose-300 bg-rose-50 text-rose-800', card: 'border-rose-200 bg-rose-50' },
  { status: 'Packing', label: 'En cours', accent: 'border-orange-300 bg-orange-50 text-orange-800', card: 'border-orange-200 bg-orange-50' },
  { status: 'Ready', label: 'Prêtes', accent: 'border-indigo-300 bg-indigo-50 text-indigo-800', card: 'border-indigo-200 bg-indigo-50' },
]

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase()
}

function formatElapsed(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function getPackingStartedEpoch(order) {
  const epoch = Number(order.packingStartedAtEpoch)
  if (Number.isFinite(epoch) && epoch > 0) return epoch * 1000

  const startedAt = order.packingStartedAt || order.packing_started_at
  if (!startedAt) return null
  const startedMs = new Date(startedAt).getTime()
  return Number.isNaN(startedMs) ? null : startedMs
}

export default function OrderStatusDashboard({
  orders,
  deliverySchedule,
  onStatusChange,
  onFetchOrderDetails,
  onSavePhysicalQuantities,
  authenticatedEmployeeId,
  selectedWarehouse,
  warehouses = [],
}) {
  const [selectedWilayas, setSelectedWilayas] = useState([])
  const [selectedSchedule, setSelectedSchedule] = useState('')
  const [draggedOrderId, setDraggedOrderId] = useState(null)
  const toast = useToast()
  const [movingOrderId, setMovingOrderId] = useState(null)
  const [moveError, setMoveError] = useState('')
  const [detailsOrder, setDetailsOrder] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [wilayaMenuOpen, setWilayaMenuOpen] = useState(false)
  const wilayaMenuRef = useRef(null)

  useEffect(() => {
    const hasPackingOrders = orders.some((order) => order.status === 'Packing')
    if (!hasPackingOrders) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [orders])

  useEffect(() => {
    if (!moveError) return undefined
    toast.error(moveError)
    const timer = setTimeout(() => setMoveError(''), 0)
    return () => clearTimeout(timer)
  }, [moveError, toast])

  useEffect(() => {
    if (!wilayaMenuOpen) return undefined
    function handlePointerDown(event) {
      if (wilayaMenuRef.current && !wilayaMenuRef.current.contains(event.target)) {
        setWilayaMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [wilayaMenuOpen])

  const wilayas = [...new Set(orders.map((order) => String(order.wilaya || '').trim()).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second))
  const scheduleDays = [...new Set(deliverySchedule.map((route) => String(route.day || '').trim()).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second))

  const selectedWilayaCount = selectedWilayas.length
  const wilayaButtonLabel = selectedWilayaCount === 0
    ? 'Toutes les wilayas'
    : selectedWilayaCount === 1
      ? selectedWilayas[0]
      : `${selectedWilayaCount} wilayas`

  function toggleWilaya(wilaya) {
    const value = String(wilaya || '').trim()
    if (!value) return
    setSelectedWilayas((current) => (
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    ))
  }

  const selectedWilayaSet = new Set(selectedWilayas.map((wilaya) => normalize(wilaya)))

  const visibleOrders = orders.filter((order) => {
    if (order.status === 'Delivered') return false
    if (selectedWilayaSet.size && !selectedWilayaSet.has(normalize(order.wilaya))) return false
    if (selectedSchedule) {
      const hasScheduledDelivery = deliverySchedule.some((route) => (
        normalize(route.day) === normalize(selectedSchedule)
        && normalize(route.wilaya) === normalize(order.wilaya)
      ))
      if (!hasScheduledDelivery) return false
    }
    return true
  })

  async function moveOrder(orderId, nextStatus) {
    if (!orderId || !STATUS_COLUMNS.some((column) => column.status === nextStatus)) return
    setMovingOrderId(orderId)
    setMoveError('')
    const saved = await onStatusChange(orderId, nextStatus)
    if (!saved) setMoveError('Impossible de mettre à jour le statut. Réessayez.')
    setMovingOrderId(null)
    setDraggedOrderId(null)
  }

  function packingDisplaySeconds(order) {
    if (order.status === 'Packing') {
      const startedMs = getPackingStartedEpoch(order)
      if (startedMs == null) return 0
      return Math.max(0, (now - startedMs) / 1000)
    }

    if (order.status === 'Ready') {
      const storedDuration = Number(order.packingDurationSeconds)
      if (Number.isFinite(storedDuration) && storedDuration >= 0) return storedDuration

      const startedMs = getPackingStartedEpoch(order)
      const readyAt = order.readyAt || order.ready_at
      if (startedMs == null || !readyAt) return null
      const readyMs = new Date(readyAt).getTime()
      if (Number.isNaN(readyMs)) return null
      return Math.max(0, (readyMs - startedMs) / 1000)
    }

    return null
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 border border-slate-200 bg-white p-4">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Logistique · commandes</p>
          <h2 className="text-xl font-black text-slate-900">Suivi des commandes</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:min-w-[440px]">
          <div className="relative text-xs font-semibold text-slate-600" ref={wilayaMenuRef}>
            Wilaya
            <button
              type="button"
              onClick={() => setWilayaMenuOpen((open) => !open)}
              aria-haspopup="listbox"
              aria-expanded={wilayaMenuOpen}
              className="mt-1 flex h-[38px] w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 text-left text-sm font-normal text-slate-800 outline-none focus:border-emerald-500"
            >
              <span className="truncate">{wilayaButtonLabel}</span>
              <span className="ml-2 text-[10px] text-slate-400">{wilayaMenuOpen ? '▲' : '▼'}</span>
            </button>
            {wilayaMenuOpen ? (
              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <button
                    type="button"
                    onClick={() => setSelectedWilayas([])}
                    className="text-[11px] font-semibold text-sky-700 hover:underline"
                  >
                    Clear
                  </button>
                  <span className="text-[11px] font-medium text-slate-500">
                    {selectedWilayaCount} selected
                  </span>
                </div>
                {wilayas.length ? wilayas.map((wilaya) => {
                  const checked = selectedWilayas.includes(wilaya)
                  return (
                    <label
                      key={wilaya}
                      className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 text-sm font-normal text-slate-800 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleWilaya(wilaya)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="truncate">{wilaya}</span>
                    </label>
                  )
                }) : (
                  <p className="px-1.5 py-2 text-xs text-slate-500">Aucune wilaya</p>
                )}
              </div>
            ) : null}
          </div>
          <label className="text-xs font-semibold text-slate-600">
            Planning de livraison
            <select
              value={selectedSchedule}
              onChange={(event) => setSelectedSchedule(event.target.value)}
              className="mt-1 block h-[38px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800"
            >
              <option value="">Tous les plannings</option>
              {scheduleDays.map((day) => <option key={day} value={day}>{day}</option>)}
            </select>
          </label>
        </div>
      </header>

      <div className="grid h-[calc(100vh-250px)] min-h-[360px] flex-1 gap-3 overflow-hidden pb-2 md:grid-cols-3">
        {STATUS_COLUMNS.map((column) => {
          const columnOrders = visibleOrders
            .filter((order) => order.status === column.status)
            .sort((first, second) => new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime())

          return (
            <section
              key={column.status}
              aria-label={`Commandes ${column.label}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const orderId = event.dataTransfer.getData('text/plain') || draggedOrderId
                const order = orders.find((entry) => String(entry.id) === String(orderId))
                if (order && order.status !== column.status) moveOrder(order.id, column.status)
              }}
              className={`flex min-h-0 min-w-[260px] flex-col overflow-hidden border-t-4 ${column.accent.split(' ')[0]} bg-slate-50/60 p-3`}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className={`text-sm font-bold ${column.accent.split(' ').at(-1)}`}>{column.label}</h3>
                <span className="min-w-7 rounded-full bg-white px-2 py-1 text-center text-xs font-bold text-slate-700">{columnOrders.length}</span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                {columnOrders.map((order) => {
                  const elapsed = packingDisplaySeconds(order)
                  const orderCode = order.orderNumber || order.order_number || ''
                  const timerClasses = order.status === 'Ready'
                    ? 'border-indigo-300 bg-white/90 text-indigo-800'
                    : 'border-orange-300 bg-white/90 text-orange-800'
                  return (
                    <article
                      key={order.id}
                      draggable={movingOrderId !== order.id}
                      onDragStart={(event) => {
                        setDraggedOrderId(order.id)
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', String(order.id))
                      }}
                      onDragEnd={() => setDraggedOrderId(null)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          setDetailsOrder(order)
                          return
                        }
                        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                        const index = STATUS_COLUMNS.findIndex((entry) => entry.status === order.status)
                        const nextColumn = STATUS_COLUMNS[index + (event.key === 'ArrowRight' ? 1 : -1)]
                        if (nextColumn) moveOrder(order.id, nextColumn.status)
                      }}
                      tabIndex={0}
                      onClick={() => setDetailsOrder(order)}
                      aria-label={`${orderCode || 'Commande'}, ${order.customerName || 'Client'}, ${order.wilaya || 'Wilaya inconnue'}, statut ${column.label}. Utilisez les flèches gauche et droite pour changer le statut.`}
                      className={`relative cursor-grab border p-3 pr-16 shadow-sm transition hover:shadow ${column.card} ${draggedOrderId === order.id ? 'opacity-40' : ''} ${movingOrderId === order.id ? 'cursor-wait opacity-60' : ''}`}
                    >
                      {elapsed !== null ? (
                        <p className={`absolute right-2 top-2 inline-flex rounded-md border px-2 py-1 font-mono text-xs font-bold tabular-nums ${timerClasses}`}>
                          {formatElapsed(elapsed)}
                        </p>
                      ) : null}
                      <p className="font-mono text-xs font-bold uppercase tracking-wide text-slate-700">
                        {orderCode || '—'}
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{order.customerName || 'Client inconnu'}</p>
                      <p className="mt-1 text-xs text-slate-600">{order.wilaya || 'Wilaya inconnue'}</p>
                    </article>
                  )
                })}
                {!columnOrders.length ? (
                  <p className="border border-dashed border-slate-300 bg-white/70 px-3 py-6 text-center text-xs text-slate-500">Déposez une commande ici</p>
                ) : null}
              </div>
            </section>
          )
        })}
      </div>
      {detailsOrder && (
        <OrderDetailsDialog
          key={detailsOrder.orderNumber || detailsOrder.id}
          order={detailsOrder}
          onClose={() => setDetailsOrder(null)}
          onFetchOrderDetails={onFetchOrderDetails}
          onSavePhysicalQuantities={onSavePhysicalQuantities}
          authenticatedEmployeeId={authenticatedEmployeeId}
          selectedWarehouse={selectedWarehouse}
          warehouses={warehouses}
        />
      )}
    </section>
  )
}
