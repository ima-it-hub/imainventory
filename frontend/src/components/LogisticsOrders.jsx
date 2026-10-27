import { Check, ChevronLeft, ChevronRight, Eye, Printer, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import OrderDetailsDialog from './OrderDetailsDialog'

const ORDER_PAGE_SIZE = 50
const ORDER_STATUS_OPTIONS = [
  { value: 'Pending', label: 'A Preparer' },
  { value: 'Packing', label: 'Encours' },
  { value: 'Ready', label: 'Preparer' },
  { value: 'Delivered', label: 'livrer' },
  { value: 'Cancelled', label: 'Annulé' },
  { value: 'Failed', label: 'Vente ratée' },
]

const ORDER_STATUS_LABELS = Object.fromEntries(
  ORDER_STATUS_OPTIONS.map(({ value, label }) => [value, label]),
)

function formatDeliveryDuration(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value < 0) return '—'

  const totalMinutes = Math.floor(value / 60)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  if (days) return `${days}d ${hours}h`
  if (hours) return `${hours}h ${minutes}m`
  if (totalMinutes === 0 && value > 0) return '<1m'
  return `${minutes}m`
}

export default function LogisticsOrders({
  orderForm,
  setOrderForm,
  orderSearch,
  setOrderSearch,
  orderStatusFilter,
  setOrderStatusFilter,
  orderDeliveryFilter,
  setOrderDeliveryFilter,
  deliverySchedule = [],
  filteredOrders,
  totalPendingOrders,
  totalReadyOrders,
  logisticsStatuses,
  formatOrderDate,
  getStatusClasses,
  onStatusChange,
  onPrintOrderTicket,
  onFetchOrderDetails,
  onSaveOrderPhysicalQuantities,
  authenticatedEmployeeId,
  selectedWarehouse,
  warehouses = [],
  orderToOpen,
  onOrderDetailsOpened,
}) {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [currentPage, setCurrentPage] = useState(1)
  const [detailsOrder, setDetailsOrder] = useState(null)
  const openedOrderKey = useRef('')
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ORDER_PAGE_SIZE))
  const page = Math.min(currentPage, totalPages)
  const visibleOrders = filteredOrders.slice((page - 1) * ORDER_PAGE_SIZE, page * ORDER_PAGE_SIZE)
  const scheduleDays = [...new Set(deliverySchedule.map((route) => String(route.day || '').trim()).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second))

  function showOrderDetails(order) {
    setDetailsOrder(order)
  }

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!orderToOpen) {
      openedOrderKey.current = ''
      return
    }

    const orderKey = String(orderToOpen.orderNumber || orderToOpen.id || '')
    if (!orderKey || openedOrderKey.current === orderKey) return

    openedOrderKey.current = orderKey
    showOrderDetails(orderToOpen)
    onOrderDetailsOpened(null)
  }, [orderToOpen, onOrderDetailsOpened])

  return (
    <section className="flex flex-1 flex-col border border-slate-200 bg-white p-4 shadow-none">
      

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="summary-card accent-amber rounded-xl border border-slate-200 bg-white p-4 shadow-none">
          <span className="summary-label">Pending orders</span>
          <strong>{totalPendingOrders}</strong>
          <small>Waiting to proceed</small>
        </div>
        <div className="summary-card accent-sky rounded-xl border border-slate-200 bg-white p-4 shadow-none">
          <span className="summary-label">Ready orders</span>
          <strong>{totalReadyOrders}</strong>
          <small>Prepared for dispatch</small>
        </div>
        <div className="summary-card accent-emerald rounded-xl border border-slate-200 bg-white p-4 shadow-none">
          <span className="summary-label">Current time</span>
          <strong>{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong>
          <small>{currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</small>
        </div>
      </div>

      <div className="space-y-4">
        {/* <form onSubmit={onCreateOrder} className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Order number
              <input
                type="text"
                value={orderForm.orderNumber}
                onChange={(e) => setOrderForm({ ...orderForm, orderNumber: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-emerald-500"
                placeholder="ORD-1050"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Customer
              <input
                type="text"
                value={orderForm.customerName}
                onChange={(e) => setOrderForm({ ...orderForm, customerName: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-emerald-500"
                placeholder="Customer name"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Wilaya
              <input
                type="text"
                value={orderForm.wilaya}
                onChange={(e) => setOrderForm({ ...orderForm, wilaya: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-emerald-500"
                placeholder="Algiers"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Status
              <select
                value={orderForm.status}
                onChange={(e) => setOrderForm({ ...orderForm, status: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-emerald-500"
              >
                {logisticsStatuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-slate-700 md:col-span-2">
              Employee
              <select
                value={orderForm.employeePrepared}
                onChange={(e) => setOrderForm({ ...orderForm, employeePrepared: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-emerald-500"
              >
                <option value="">Select employee</option>
                {employees.map((employee) => (
                  <option key={employee.employee_id} value={employee.employee_id}>
                    {employee.name ? `${employee.employee_id} - ${employee.name}` : employee.employee_id}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-sm font-medium text-slate-700">
            Creation time
            <input
              type="datetime-local"
              value={orderForm.createdAt}
              onChange={(e) => setOrderForm({ ...orderForm, createdAt: e.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-emerald-500"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Saving...' : 'Add order'}
          </button>
        </form> */}

        <div className="border border-slate-200 bg-white p-3">
          {/* <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Live orders</p>
              <h4 className="text-xl font-bold text-slate-900">Dispatch queue</h4>
            </div>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
              {filteredOrders.length} orders
            </span>
          </div> */}

          <div className="mb-3 grid gap-3 md:grid-cols-[1.4fr_1fr_1fr]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => {
                  setCurrentPage(1)
                  setOrderSearch(e.target.value)
                }}
                placeholder="Search by customer, wilaya, or order number"
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-emerald-500"
              />
            </div>

            <label className="text-xs font-semibold text-slate-600">
              Status
              <select
                value={orderStatusFilter}
                onChange={(event) => {
                  setCurrentPage(1)
                  setOrderStatusFilter(event.target.value)
                }}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-emerald-500"
              >
                <option value="All">All statuses</option>
                {logisticsStatuses.map((status) => (
                  <option key={status} value={status}>{ORDER_STATUS_LABELS[status] || status}</option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold text-slate-600">
              Planning de livraison
              <select
                value={orderDeliveryFilter}
                onChange={(event) => {
                  setCurrentPage(1)
                  setOrderDeliveryFilter(event.target.value)
                }}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-emerald-500"
              >
                <option value="">Tous les plannings</option>
                {scheduleDays.map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="max-h-[calc(100vh-450px)] min-h-[260px] flex-1 overflow-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  {['Q', 'Client name', 'Wilaya', 'Date and time', 'Pending to ready', 'Pending to delivered', 'Prepared by', 'Controlled by', 'Status', 'Actions'].map((label) => (
                    <th key={label} className="border-b border-slate-200 px-4 py-3 font-semibold">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => (
                  <tr
                    key={order.id}
                    tabIndex={0}
                    onClick={() => showOrderDetails(order)}
                    onKeyDown={(event) => {
                      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault()
                        showOrderDetails(order)
                      }
                    }}
                    className={`cursor-pointer border-b focus:outline-none ${getStatusClasses(order.status)} hover:brightness-[0.98]`}
                    aria-label={`View details for ${order.customerName}; current status ${order.status}`}
                  >
                    <td className="px-4 py-3 text-center">
                      <span
                        role="img"
                        aria-label={order.quantitiesMatch ? 'Physical quantities match system quantities' : 'Physical quantities do not match system quantities'}
                        title={order.quantitiesMatch ? 'Physical quantities match system quantities' : 'Physical quantities do not match system quantities'}
                      >
                        {order.quantitiesMatch
                          ? <Check aria-hidden="true" className="mx-auto h-4 w-4 text-emerald-700" />
                          : <X aria-hidden="true" className="mx-auto h-4 w-4 text-rose-700" />}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{order.customerName}</td>
                    <td className="px-4 py-3 text-slate-600">{order.wilaya}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatOrderDate(order.createdAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDeliveryDuration(order.pendingToReadySeconds)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDeliveryDuration(order.pendingToDeliveredSeconds)}</td>
                    <td className="px-4 py-3 text-slate-600">{order.preparedBy || order.employeePrepared || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{order.controlledBy || order.controllerEmployeeId || '—'}</td>
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <select
                        value={order.status}
                        onChange={(event) => onStatusChange(order.id, event.target.value)}
                        aria-label={`Status for ${order.customerName}`}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-800 outline-none focus:border-sky-600"
                      >
                        {ORDER_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            showOrderDetails(order)
                          }}
                          className="inline-flex h-9 w-9 items-center justify-center border border-slate-300 bg-white/80 text-slate-700 hover:bg-white"
                          title="View order details"
                          aria-label={`View details for ${order.customerName}`}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          onPrintOrderTicket(order)
                        }}
                        className="inline-flex h-9 w-9 items-center justify-center border border-slate-300 bg-white/80 text-slate-700 hover:bg-white"
                        title="Print order QR ticket"
                        aria-label={`Print QR ticket for ${order.customerName}`}
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!visibleOrders.length && (
                  <tr>
                    <td colSpan="10" className="px-4 py-10 text-center text-slate-500">No orders found for the selected filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 py-3">
            <p className="text-xs text-slate-600">
              Showing {filteredOrders.length ? (page - 1) * ORDER_PAGE_SIZE + 1 : 0}
              {' - '}{Math.min(page * ORDER_PAGE_SIZE, filteredOrders.length)} of {filteredOrders.length} orders
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="inline-flex h-9 w-9 items-center justify-center border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous orders page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-20 text-center text-xs text-slate-600">Page {page} of {totalPages}</span>
              <button
                type="button"
                onClick={() => setCurrentPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="inline-flex h-9 w-9 items-center justify-center border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next orders page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3 text-xs text-slate-600">
            {/* <span className="font-semibold uppercase tracking-[0.18em] text-slate-500">Color legend:</span> */}
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded border border-rose-300 bg-rose-100" />
              Pending
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded border border-orange-300 bg-orange-100" />
              Packing
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded border border-indigo-300 bg-indigo-100" />
              Ready
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded border border-teal-300 bg-teal-100" />
              Delivered
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded border border-gray-300 bg-gray-100" />
              Annulé
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded border border-yellow-300 bg-yellow-100" />
              Vente ratée
            </span>
          </div>
        </div>
      </div>
      {detailsOrder && (
        <OrderDetailsDialog
          key={detailsOrder.orderNumber || detailsOrder.id}
          order={detailsOrder}
          onClose={() => setDetailsOrder(null)}
          onFetchOrderDetails={onFetchOrderDetails}
          onSavePhysicalQuantities={onSaveOrderPhysicalQuantities}
          authenticatedEmployeeId={authenticatedEmployeeId}
          selectedWarehouse={selectedWarehouse}
          warehouses={warehouses}
        />
      )}
    </section>
  )
}
