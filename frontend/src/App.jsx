import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Boxes,
  CalendarRange,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock3,
  KeyRound,
  Menu,
  PackageSearch,
  QrCode,
  RefreshCcw,
  Search,
  ShieldCheck,
  Truck,
  UserRound,
  Warehouse,
  X,
} from 'lucide-react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { QRCodeSVG } from 'qrcode.react'
import LogisticsOrders from './components/LogisticsOrders'
import DriversManagement from './components/DriversManagement'
import DeliverySchedule from './components/DeliverySchedule'
import UserAccessManagement from './components/UserAccessManagement'
import AssetManagement from './components/AssetManagement'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const DELIVERY_SCHEDULE_KEY = 'inventory-delivery-schedule'
const AUTH_SESSION_KEY = 'inventory-auth-session'

const logisticsStatuses = ['Pending', 'Packing', 'Ready', 'Delivered']

const initialOrders = [
  {
    id: 1,
    orderNumber: 'ORD-1042',
    customerName: 'Northstar Retail',
    wilaya: 'Algiers',
    status: 'Packed',
    employeePrepared: 'E-204',
    createdAt: '2026-09-19T08:30',
  },
  {
    id: 2,
    orderNumber: 'ORD-1048',
    customerName: 'Metro Supplies',
    wilaya: 'Oran',
    status: 'Ready for dispatch',
    employeePrepared: 'E-118',
    createdAt: '2026-09-19T10:15',
  },
]

function App() {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState([])
  const [selectedItem, setSelectedItem] = useState(null)
  const [qrScanQuantity, setQrScanQuantity] = useState('')
  const [pendingOrderDetails, setPendingOrderDetails] = useState(null)
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem(AUTH_SESSION_KEY)
      if (!saved) return null
      const parsed = JSON.parse(saved)
      return parsed?.currentUser || null
    } catch {
      return null
    }
  })
  const [authForm, setAuthForm] = useState({ username: '', password: '' })
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    try {
      const saved = localStorage.getItem(AUTH_SESSION_KEY)
      if (!saved) return false
      const parsed = JSON.parse(saved)
      return Boolean(parsed?.isAuthenticated)
    } catch {
      return false
    }
  })
  const [users, setUsers] = useState([])
  const [physicalQuantities, setPhysicalQuantities] = useState({})
  const [result, setResult] = useState(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [qrScanScannerReady, setQrScanScannerReady] = useState(false)
  const [syncingItems, setSyncingItems] = useState(false)
  const [syncingOrders, setSyncingOrders] = useState(false)
  const [warehouses, setWarehouses] = useState([])
  const [selectedWarehouse, setSelectedWarehouse] = useState('')
  const [employees, setEmployees] = useState([])
  const authenticatedEmployeeId = employees.find((employee) => {
    const employeeIdValue = String(employee.employee_id || '').trim().toLowerCase()
    const employeeName = String(employee.name || '').trim().toLowerCase()
    const username = String(currentUser?.username || '').trim().toLowerCase()
    const fullName = String(currentUser?.fullName || '').trim().toLowerCase()

    return (
      (currentUser?.employeeId && employeeIdValue === String(currentUser.employeeId).trim().toLowerCase()) ||
      (username && (employeeIdValue === username || employeeName === username)) ||
      (fullName && employeeName === fullName)
    )
  })?.employee_id || ''
  const [itemFilter, setItemFilter] = useState('all')
  const [error, setError] = useState('')
  const [activeView, setActiveView] = useState(() => {
    try {
      const saved = localStorage.getItem(AUTH_SESSION_KEY)
      if (!saved) return 'inventory'
      const parsed = JSON.parse(saved)
      return parsed?.activeView || 'inventory'
    } catch {
      return 'inventory'
    }
  })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [allowedPages, setAllowedPages] = useState(() => {
    try {
      const saved = localStorage.getItem(AUTH_SESSION_KEY)
      if (!saved) return ['inventory', 'logistics', 'drivers', 'schedule']
      const parsed = JSON.parse(saved)
      return Array.isArray(parsed?.allowedPages) && parsed.allowedPages.length ? parsed.allowedPages : ['inventory', 'logistics', 'drivers', 'schedule']
    } catch {
      return ['inventory', 'logistics', 'drivers', 'schedule']
    }
  })
  const [orders, setOrders] = useState([])
  const [drivers, setDrivers] = useState([])
  const [deliverySchedule, setDeliverySchedule] = useState(() => {
    try {
      const saved = localStorage.getItem(DELIVERY_SCHEDULE_KEY)
      if (!saved) {
        return [
          { id: 1, wilaya: 'Algiers', day: 'Monday', driverId: '1' },
          { id: 2, wilaya: 'Oran', day: 'Wednesday', driverId: '2' },
          { id: 3, wilaya: 'Constantine', day: 'Friday', driverId: '3' },
        ]
      }

      const parsed = JSON.parse(saved)
      return Array.isArray(parsed) && parsed.length ? parsed : [
        { id: 1, wilaya: 'Algiers', day: 'Monday', driverId: '1' },
        { id: 2, wilaya: 'Oran', day: 'Wednesday', driverId: '2' },
        { id: 3, wilaya: 'Constantine', day: 'Friday', driverId: '3' },
      ]
    } catch {
      return [
        { id: 1, wilaya: 'Algiers', day: 'Monday', driverId: '1' },
        { id: 2, wilaya: 'Oran', day: 'Wednesday', driverId: '2' },
        { id: 3, wilaya: 'Constantine', day: 'Friday', driverId: '3' },
      ]
    }
  })
  const [scheduleForm, setScheduleForm] = useState({
    wilaya: '',
    day: 'Monday',
    driverId: '',
  })
  const [driverForm, setDriverForm] = useState({
    name: '',
    phone: '',
    region: '',
    vehicle: '',
    notes: '',
  })
  const [orderSearch, setOrderSearch] = useState('')
  const [orderStatusFilter, setOrderStatusFilter] = useState('All')
  const [orderDeliveryFilter, setOrderDeliveryFilter] = useState('All')
  const [driverSearch, setDriverSearch] = useState('')
  const [orderForm, setOrderForm] = useState({
    orderNumber: '',
    customerName: '',
    wilaya: '',
    status: 'Pending',
    employeePrepared: '',
    createdAt: new Date().toISOString().slice(0, 16),
  })

  const scannerRef = useRef(null)
  const qrRef = useRef(null)

  useEffect(() => {
    try {
      localStorage.setItem(DELIVERY_SCHEDULE_KEY, JSON.stringify(deliverySchedule))
    } catch {
      // Ignore storage quota or browser restriction errors.
    }
  }, [deliverySchedule])

  useEffect(() => {
    try {
      if (isAuthenticated && currentUser) {
        localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
          isAuthenticated: true,
          currentUser,
          allowedPages,
          activeView,
        }))
      } else {
        localStorage.removeItem(AUTH_SESSION_KEY)
      }
    } catch {
      // Ignore storage errors.
    }
  }, [isAuthenticated, currentUser, allowedPages, activeView])

  const sidebarPages = [
    { key: 'inventory', label: 'Inventory', icon: Warehouse },
    { key: 'qr-scan', label: 'QR scan', icon: QrCode },
    { key: 'logistics', label: 'Logistics', icon: Truck },
    { key: 'drivers', label: 'Drivers', icon: UserRound },
    { key: 'schedule', label: 'Delivery plan', icon: CalendarRange },
    { key: 'assets', label: 'Assets', icon: Boxes },
    { key: 'access', label: 'Access', icon: KeyRound },
  ]

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  function formatOrderDate(dateValue) {
    if (!dateValue) return '—'

    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return dateValue

    return date.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function getStatusClasses(status) {
    switch (status) {
      case 'Delivered':
        return 'bg-teal-100 text-teal-800 border border-teal-300'
      case 'Ready':
        return 'bg-indigo-100 text-indigo-800 border border-indigo-300'
      case 'Packing':
        return 'bg-orange-100 text-orange-800 border border-orange-300'
      default:
        return 'bg-rose-100 text-rose-800 border border-rose-300'
    }
  }

  function getNextStatus(currentStatus) {
    const cycle = ['Pending', 'Packing', 'Ready', 'Delivered']
    const index = cycle.indexOf(currentStatus)
    return cycle[(index + 1) % cycle.length]
  }

  async function handleCreateOrder(event) {
    event.preventDefault()

    const { orderNumber, customerName, wilaya, status, employeePrepared, createdAt } = orderForm

    if (!orderNumber || !customerName || !wilaya || !employeePrepared) {
      setError('Please complete the order number, customer, wilaya, and prepared-by fields.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_URL}/api/logistics/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: orderNumber.trim(),
          customerName: customerName.trim(),
          wilaya: wilaya.trim(),
          status: status || 'Pending',
          employeePrepared: employeePrepared.trim(),
          createdAt: createdAt || new Date().toISOString().slice(0, 16),
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to create order')

      setOrders((current) => [data.order, ...current])
      setOrderForm({
        orderNumber: '',
        customerName: '',
        wilaya: '',
        status: 'Pending',
        employeePrepared: employees[0]?.employee_id || '',
        createdAt: new Date().toISOString().slice(0, 16),
      })
      setActiveView('logistics')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleOrderStatusChange(orderId, nextStatus, driverId = null) {
    try {
      const payload = { status: nextStatus }
      if (driverId !== null && driverId !== undefined) {
        payload.driverId = driverId
      }

      const response = await fetch(`${API_URL}/api/logistics/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to update order status')

      setOrders((current) => current.map((order) => (
        order.id === orderId ? { ...order, ...data.order } : order
      )))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleOrderEmployeeChange(orderId, nextEmployeeId) {
    try {
      const response = await fetch(`${API_URL}/api/logistics/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeePrepared: nextEmployeeId }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to update employee')

      setOrders((current) => current.map((order) => (
        order.id === orderId ? data.order : order
      )))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteOrder(orderId) {
    const shouldDelete = window.confirm('Delete this logistics order?')
    if (!shouldDelete) return

    try {
      const response = await fetch(`${API_URL}/api/logistics/orders/${orderId}`, {
        method: 'DELETE',
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to delete order')

      setOrders((current) => current.filter((order) => order.id !== orderId))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleCreateDriver(event) {
    event.preventDefault()

    const { name, phone, region, vehicle, notes } = driverForm
    if (!name || !phone || !region || !vehicle) {
      setError('Name, phone, region, and vehicle are required for a driver.')
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/drivers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          region: region.trim(),
          vehicle: vehicle.trim(),
          notes: notes.trim(),
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to create driver')

      setDrivers((current) => [data.driver, ...current])
      setDriverForm({ name: '', phone: '', region: '', vehicle: '', notes: '' })
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteDriver(driverId) {
    const shouldDelete = window.confirm('Delete this driver?')
    if (!shouldDelete) return

    try {
      const response = await fetch(`${API_URL}/api/drivers/${driverId}`, {
        method: 'DELETE',
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to delete driver')

      setDrivers((current) => current.filter((driver) => driver.id !== driverId))
    } catch (err) {
      setError(err.message)
    }
  }

  function handleAddDeliverySlot(event) {
    event.preventDefault()

    if (!scheduleForm.wilaya || !scheduleForm.day) {
      setError('Please select a wilaya and day for the delivery route.')
      return
    }

    setDeliverySchedule((current) => [
      ...current,
      {
        id: Date.now(),
        wilaya: scheduleForm.wilaya.trim(),
        day: scheduleForm.day,
        driverId: scheduleForm.driverId || '',
      },
    ])

    setScheduleForm({ wilaya: '', day: 'Monday', driverId: '' })
    setError('')
  }

  function handleDeleteDeliverySlot(id) {
    setDeliverySchedule((current) => current.filter((route) => route.id !== id))
  }

  async function handleOrderDriverChange(orderId, nextDriverId) {
    try {
      const response = await fetch(`${API_URL}/api/logistics/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: nextDriverId || null }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to update driver assignment')

      setOrders((current) => current.map((order) => (
        order.id === orderId ? data.order : order
      )))
    } catch (err) {
      setError(err.message)
    }
  }

  function handlePrintLabel() {
    if (!selectedItem) {
      setError('Select an item before printing its QR label.')
      return
    }

    const printWindow = window.open('', '_blank', 'width=700,height=900')
    if (!printWindow) {
      setError('Your browser blocked the print window. Please allow pop-ups and try again.')
      return
    }

    const qrMarkup = qrRef.current ? new XMLSerializer().serializeToString(qrRef.current) : ''

    if (!qrMarkup) {
      setError('The QR code is not ready to print yet. Please try again.')
      printWindow.close()
      return
    }

    const printedTitle = escapeHtml(selectedItem.name || 'Inventory item')
    const printedSku = escapeHtml(selectedItem.sku || '')

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print QR Label</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              min-height: 100vh;
              display: grid;
              place-items: center;
              background: #f8fafc;
              font-family: Arial, sans-serif;
            }
            .label-card {
              width: 300px;
              background: white;
              border: 2px solid #e2e8f0;
              border-radius: 18px;
              padding: 20px 18px 16px;
              box-shadow: 0 18px 36px rgba(15, 23, 42, 0.08);
              text-align: center;
            }
            .label-card svg {
              width: 220px;
              height: 220px;
              display: block;
              margin: 0 auto 12px;
            }
            .label-card h2 {
              margin: 8px 0 4px;
              font-size: 18px;
              color: #0f172a;
            }
            .label-card p {
              margin: 0;
              color: #475569;
              font-size: 13px;
              letter-spacing: 0.08em;
              text-transform: uppercase;
            }
            @media print {
              body { background: white; }
              .label-card { box-shadow: none; border: none; }
            }
          </style>
        </head>
        <body>
          <div class="label-card">
            ${qrMarkup}
            <h2>${printedTitle}</h2>
            <p>SKU: ${printedSku}</p>
          </div>
          <script>
            window.onload = function () {
              window.print();
              setTimeout(function () { window.close(); }, 800);
            };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  function buildOrderQrUrl(order) {
    const payload = {
      type: 'order',
      id: order?.id,
      orderNumber: order?.orderNumber || '',
      customerName: order?.customerName || '',
      wilaya: order?.wilaya || '',
      createdAt: order?.createdAt || '',
    }

    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(JSON.stringify(payload))}`
  }

  function handlePrintOrderTicket(order) {
    if (!order) return

    const printWindow = window.open('', '_blank', 'width=700,height=900')
    if (!printWindow) {
      setError('Your browser blocked the print window. Please allow pop-ups and try again.')
      return
    }

    const safeCustomer = escapeHtml(order.customerName || 'Customer')
    const safeWilaya = escapeHtml(order.wilaya || '—')
    const safeOrderNumber = escapeHtml(order.orderNumber || '—')
    const safeLogo = '/ima.png'
    const qrImage = buildOrderQrUrl(order)

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Order Ticket</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              background: #f8fafc;
              font-family: Arial, sans-serif;
              display: grid;
              place-items: center;
              min-height: 100vh;
              color: #0f172a;
            }
            .ticket {
              width: 360px;
              background: #fff;
              border: 2px solid #dfe7ee;
              border-radius: 20px;
              padding: 20px;
              box-shadow: 0 14px 32px rgba(15, 23, 42, 0.08);
            }
            .top {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 14px;
              margin-bottom: 18px;
            }
            .logo {
              width: 140px;
              height: 140px;
              object-fit: contain;
              border-radius: 14px;
              background: #f8fafc;
              padding: 4px;
            }
            h2 {
              margin: 0;
              font-size: 17px;
            }
            .meta {
              margin: 10px 0;
              font-size: 14px;
              line-height: 1.6;
            }
            .meta strong {
              display: inline-block;
              width: 86px;
              color: #475569;
            }
            .qr-box {
              text-align: center;
              padding-top: 12px;
              border-top: 1px solid #e2e8f0;
            }
            .qr-box img {
              width: 100px;
              height: 100px;
              display: block;
              margin: 0 auto 10px;
            }
            @media print {
              body { background: white; }
              .ticket { box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <div class="ticket">
            <div class="top">
              <img class="logo" src="${safeLogo}" alt="Company logo" />
              <div>
                <h2>Order ticket</h2>
                <div style="font-size: 12px; color: #475569;">${safeOrderNumber}</div>
              </div>
            </div>
            <div class="meta">
              <div><strong>Client:</strong> ${safeCustomer}</div>
              <div><strong>Wilaya:</strong> ${safeWilaya}</div>
              <div><strong>NB.Colis:</strong> ${"/"}</div>
              <div><strong>N.Tel:</strong> </div>
            </div>
            <div class="qr-box">
              <img src="${qrImage}" alt="Order QR code" />
            </div>
          </div>
          <script>
            window.onload = function () {
              window.print();
              setTimeout(function () { window.close(); }, 800);
            };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  useEffect(() => {
    if (!scannerOpen) return

    const scanner = new Html5QrcodeScanner(
      'warehouse-scanner',
      { fps: 10, qrbox: { width: 250, height: 250 }, rememberLastUsedCamera: true },
      false,
    )

    scanner.render(
      async (decodedText) => {
        setScannerOpen(false)
        const cleaned = decodedText.trim()

        try {
          const parsed = JSON.parse(cleaned)
          const item = parsed?.sku || parsed?.id ? parsed : null
          if (item && item.sku) {
            setSelectedItem({ id: item.id, sku: item.sku, name: item.name || item.sku, current_quantity: item.system_qty || 0 })
            setResult(null)
            return
          }
        } catch {
          // fallback to search by scanned value
        }

        await searchItems(cleaned)
      },
      () => {
        setError('Unable to access the camera or code was not readable. Please retry.')
      },
    )

    scannerRef.current = scanner

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {})
      }
    }
  }, [scannerOpen])

  useEffect(() => {
    if (activeView !== 'qr-scan') {
      setQrScanScannerReady(false)
      return
    }

    const scanner = new Html5QrcodeScanner(
      'qr-scan-target',
      { fps: 10, qrbox: { width: 260, height: 260 }, rememberLastUsedCamera: true },
      false,
    )

    scanner.render(
      async (decodedText) => {
        const cleaned = String(decodedText || '').trim()
        if (!cleaned) {
          setError('No QR code content was detected.')
          return
        }

        try {
          const parsed = JSON.parse(cleaned)
          if (parsed?.type === 'order') {
            setPendingOrderDetails({
              id: parsed.id,
              orderNumber: parsed.orderNumber || String(parsed.id || ''),
              customerName: parsed.customerName || 'Order',
              wilaya: parsed.wilaya || '',
              createdAt: parsed.createdAt || '',
            })
            setSelectedItem(null)
            setError('')
            setResult(null)
            setActiveView('logistics')
            return
          }

          const lookupValue = parsed?.sku || parsed?.id || parsed?.itemId || parsed?.value || cleaned
          const encoded = encodeURIComponent(String(lookupValue))
          const response = await fetch(`${API_URL}/api/items/search?q=${encoded}&warehouse=${encodeURIComponent(selectedWarehouse || 'Main warehouse')}`)
          const data = await response.json()
          const item = (data.items || [])[0]

          if (!item) {
            setSelectedItem(null)
            setQrScanQuantity('')
            setError('This QR code does not match any item in the database.')
            return
          }

          setSelectedItem(item)
          setQrScanQuantity(String(item.last_counted_qty ?? 0))
          setError('')
          setResult(null)
        } catch {
          const response = await fetch(`${API_URL}/api/items/search?q=${encodeURIComponent(cleaned)}&warehouse=${encodeURIComponent(selectedWarehouse || 'Main warehouse')}`)
          const data = await response.json()
          const item = (data.items || [])[0]

          if (!item) {
            setSelectedItem(null)
            setQrScanQuantity('')
            setError('This QR code does not match any item in the database.')
            return
          }

          setSelectedItem(item)
          setQrScanQuantity(String(item.last_counted_qty ?? 0))
          setError('')
          setResult(null)
        }
      },
      () => {
        setError('Unable to access the camera on this page. Please retry.')
      },
    )

    setQrScanScannerReady(true)

    return () => {
      scanner.clear().catch(() => {})
      setQrScanScannerReady(false)
    }
  }, [activeView, selectedWarehouse])

  async function searchItems(value = query) {
    const term = (value || query).trim()
    const warehouseForQuery = String(selectedWarehouse || '').trim() || 'Main warehouse'

    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams()
      if (term) params.set('q', term)
      if (warehouseForQuery) params.set('warehouse', warehouseForQuery)
      if (itemFilter === 'mismatched') params.set('mismatchOnly', 'true')

      const response = await fetch(`${API_URL}/api/items/search?${params.toString()}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Search failed')
      setItems(data.items || [])
      if (!term) setSelectedItem(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!selectedWarehouse) return
    searchItems('')
  }, [selectedWarehouse, itemFilter])

  async function loadUsers() {
    try {
      const response = await fetch(`${API_URL}/api/users`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load users')
      setUsers(data.users || [])
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleLogin(event) {
    event.preventDefault()
    setError('')

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: authForm.username.trim(),
          password: authForm.password.trim(),
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Login failed')

      const nextUser = data.user
      setCurrentUser(nextUser)
      setAllowedPages(nextUser.allowedPages || [])
      setIsAuthenticated(true)
      setActiveView(nextUser.role === 'admin' ? 'inventory' : nextUser.allowedPages?.[0] || 'inventory')
      await loadUsers()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleCreateUser(payload) {
    try {
      const response = await fetch(`${API_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to create user')
      await loadUsers()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleUpdateUser(userId, payload) {
    try {
      const response = await fetch(`${API_URL}/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to update user')

      if (currentUser && currentUser.id === userId) {
        setCurrentUser(data.user)
        setAllowedPages(data.user.allowedPages || [])
      }

      await loadUsers()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteUser(userId) {
    try {
      const response = await fetch(`${API_URL}/api/users/${userId}`, {
        method: 'DELETE',
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to delete user')
      await loadUsers()
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    async function fetchWarehouses() {
      try {
        const response = await fetch(`${API_URL}/api/warehouses`)
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load warehouses')

        const list = (data.warehouses || ['Main warehouse']).map((value) => String(value).trim()).filter(Boolean)
        setWarehouses(list)
        setSelectedWarehouse((current) => String(current || '').trim() || list[0])
      } catch (err) {
        const fallback = ['Main warehouse']
        setWarehouses(fallback)
        setSelectedWarehouse((current) => String(current || '').trim() || fallback[0])
        setError(err.message)
      }
    }

    fetchWarehouses()
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return
    loadUsers()
  }, [isAuthenticated])

  useEffect(() => {
    async function fetchEmployees() {
      try {
        const response = await fetch(`${API_URL}/api/employees`)
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load employees')

        const list = data.employees || []
        setEmployees(list)
        setOrderForm((current) => ({
          ...current,
          employeePrepared: current.employeePrepared || list[0]?.employee_id || '',
        }))
      } catch (err) {
        setError(err.message)
      }
    }

    async function fetchDrivers() {
      try {
        const response = await fetch(`${API_URL}/api/drivers`)
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load drivers')
        setDrivers(data.drivers || [])
      } catch (err) {
        setError(err.message)
      }
    }

    fetchEmployees()
    fetchDrivers()
  }, [])

  async function loadOrders() {
    try {
      const response = await fetch(`${API_URL}/api/logistics/orders`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to fetch orders')

      setOrders((data.orders || []).map((order) => ({
        ...order,
        orderNumber: order.orderNumber || order.order_number,
        customerName: order.customerName || order.customer_name,
        employeePrepared: order.employeePrepared || order.employee_prepared,
        createdAt: order.createdAt || order.created_at,
      })))
    } catch (err) {
      setOrders([])
      setError(err.message)
    }
  }

  async function handleFetchOrderDetails(order) {
    const identifier = order.orderNumber || order.id
    const response = await fetch(`${API_URL}/api/logistics/orders/${encodeURIComponent(identifier)}/details`)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to fetch order details')
    return data.details || []
  }

  async function handleSaveOrderPhysicalQuantities(order, physicalQuantities, controlQuantities, employeePrepared, controllerEmployeeId) {
    const identifier = order.orderNumber || order.id
    const response = await fetch(`${API_URL}/api/logistics/orders/${encodeURIComponent(identifier)}/physical-counts`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ physicalQuantities, controlQuantities, employeePrepared, controllerEmployeeId }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to save physical quantities')
    if (data.employeePrepared || data.controllerEmployeeId) {
      setOrders((current) => current.map((currentOrder) => (
        currentOrder.id === order.id
          ? {
              ...currentOrder,
              employeePrepared: data.employeePrepared,
              preparedBy: employees.find((employee) => employee.employee_id === data.employeePrepared)?.name || data.employeePrepared,
              controllerEmployeeId: data.controllerEmployeeId,
              controlledBy: employees.find((employee) => employee.employee_id === data.controllerEmployeeId)?.name || data.controllerEmployeeId,
            }
          : currentOrder
      )))
    }
    return data
  }

  useEffect(() => {
    if (activeView === 'logistics') {
      loadOrders()
    }
  }, [activeView])

  async function handleSyncFromOdbc() {
    setSyncingItems(true)
    setError('')

    try {
      const response = await fetch(`${API_URL}/api/sync/odbc-to-supabase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouse: selectedWarehouse || null }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Sync failed')

      setResult({
        status: 'MATCH',
        direction: 'MATCH',
        message: data.message,
        expected: 'Supabase sync',
        counted: data.synced,
        delta: 0,
      })
      await searchItems('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSyncingItems(false)
    }
  }

  async function handleSyncLogisticsFromOdbc() {
    setSyncingOrders(true)
    setError('')

    try {
      const response = await fetch(`${API_URL}/api/logistics/orders/sync-odbc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to sync logistics orders')

      setOrders((data.orders || []).map((order) => ({
        ...order,
        orderNumber: order.orderNumber || order.order_number,
        customerName: order.customerName || order.customer_name,
        employeePrepared: order.employeePrepared || order.employee_prepared,
        createdAt: order.createdAt || order.created_at,
      })))
      setResult({
        status: 'MATCH',
        direction: 'MATCH',
        message: data.message,
        expected: 'Logistics orders',
        counted: data.count,
        delta: 0,
      })
      setActiveView('logistics')
    } catch (err) {
      setError(err.message)
    } finally {
      setSyncingOrders(false)
    }
  }

  async function handleReconcile(item, quantity) {
    if (!item || quantity === '' || quantity === null || quantity === undefined) {
      setError('Choose an item and enter the physical quantity before reconciling.')
      return
    }

    if (!Number.isInteger(Number(quantity)) || Number(quantity) < 0) {
      setError('Physical quantity must be a whole number greater than or equal to zero.')
      return
    }

    if (!authenticatedEmployeeId) {
      setError('Your signed-in user is not linked to an employee record.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_URL}/api/inventory/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: item.id,
          physical_qty: Number(quantity),
          employee_id: authenticatedEmployeeId,
          notes: '',
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Reconciliation failed')

      setSelectedItem((current) => ({
        ...(current || {}),
        id: current?.id || item.id,
        system_qty: Number(data.expected ?? current?.system_qty ?? 0),
        last_counted_qty: Number(data.counted ?? current?.last_counted_qty ?? 0),
        counted_times: Number(current?.counted_times ?? 0) + 1,
      }))
      setPhysicalQuantities((current) => ({ ...current, [item.id]: String(data.counted ?? 0) }))
      setResult(data)
      await searchItems('')
      if (data.status === 'MATCH') {
        playTone('success')
      } else {
        playTone('warning')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function playTone(type) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return

    const audio = new AudioCtx()
    const oscillator = audio.createOscillator()
    const gainNode = audio.createGain()

    oscillator.type = type === 'success' ? 'triangle' : 'sawtooth'
    oscillator.frequency.value = type === 'success' ? 780 : 220
    gainNode.gain.value = 0.04
    oscillator.connect(gainNode)
    gainNode.connect(audio.destination)
    oscillator.start()
    oscillator.stop(audio.currentTime + (type === 'success' ? 0.18 : 0.35))
  }

  const qrValue = selectedItem ? JSON.stringify({ sku: selectedItem.sku, id: selectedItem.id }) : '{"sku":"","id":""}'

  const weekDayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const getWeekDayName = (date = new Date()) => weekDayNames[(date.getDay() + 6) % 7]
  const getTargetDeliveryWilayas = (targetDay) => {
    const normalizedDay = String(targetDay || '').trim()
    if (!normalizedDay) return new Set()
    return new Set(
      deliverySchedule
        .filter((route) => route.day === normalizedDay)
        .map((route) => String(route.wilaya).trim().toLowerCase()),
    )
  }

  const filteredOrders = orders
    .filter((order) => {
      const customerName = String(order?.customerName || '').toLowerCase()
      const wilaya = String(order?.wilaya || '').toLowerCase()
      const orderNumber = String(order?.orderNumber || '').toLowerCase()
      const search = String(orderSearch || '').toLowerCase()

      const matchesSearch = !search || customerName.includes(search) || wilaya.includes(search) || orderNumber.includes(search)
      const matchesStatus = orderStatusFilter === 'All' || order.status === orderStatusFilter

      let matchesDelivery = true
      if (orderDeliveryFilter !== 'All') {
        const today = new Date()
        const tomorrow = new Date(today)
        tomorrow.setDate(today.getDate() + 1)
        const targetDay = orderDeliveryFilter === 'Today' ? getWeekDayName(today) : getWeekDayName(tomorrow)
        matchesDelivery = getTargetDeliveryWilayas(targetDay).has(String(order?.wilaya || '').trim().toLowerCase())
      }

      return matchesSearch && matchesStatus && matchesDelivery
    })
    .sort((a, b) => {
      const aTime = new Date(a?.createdAt || 0).getTime()
      const bTime = new Date(b?.createdAt || 0).getTime()
      return bTime - aTime
    })

  const totalPendingOrders = orders.filter((order) => order.status === 'Pending').length
  const totalReadyOrders = orders.filter((order) => order.status === 'Ready').length

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h1 className="text-3xl font-black text-slate-900">Inventory system</h1>
            <p className="mt-2 text-sm text-slate-500">Admin or staff sign in</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Username
              <input
                type="text"
                value={authForm.username}
                onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none focus:border-sky-500"
                placeholder="Username"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Password
              <input
                type="password"
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none focus:border-sky-500"
                placeholder="Password"
              />
            </label>

            <button
              type="submit"
              className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-500"
            >
              Sign in
            </button>
          </form>

          <div className="mt-5 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-800">
            
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  const visibleSidebarPages = sidebarPages.filter((page) => (
    page.key === 'access' || page.key === 'assets'
      ? currentUser?.role === 'admin' || allowedPages.includes(page.key)
      : allowedPages.includes(page.key)
  ))

  return (
    <div className="app-shell h-screen overflow-hidden bg-white p-0 md:p-0 lg:p-0">
      <div className="w-full h-full">
        <div className="dashboard-layout relative flex min-h-screen flex-col gap-0 lg:flex-row">
          <aside className={`sidebar-panel fixed inset-y-0 left-0 z-40 flex w-[210px] flex-col p-0 text-slate-100 shadow-none transition-transform duration-200 lg:fixed lg:top-0 lg:h-screen lg:w-[210px] lg:flex-shrink-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
            <div className="brand-header flex w-full items-center justify-center px-3 py-4">
              <div className="brand-logo flex h-28 w-full max-w-[190px] items-center justify-center overflow-hidden rounded-md bg-white/5 ring-0">
                <img src="/ima.png" alt="Company logo" className="h-full w-full object-contain" />
              </div>
            </div>

            <nav className="sidebar-nav mt-2 flex-1 space-y-1 px-2 pb-4">
              {visibleSidebarPages.map((page) => {
                const Icon = page.icon

                return (
                  <button
                    key={page.key}
                    type="button"
                    onClick={() => {
                      setActiveView(page.key)
                      setSidebarOpen(false)
                    }}
                    className={`sidebar-item flex w-full items-center gap-3 px-3 py-3 text-left text-[15px] font-semibold transition ${activeView === page.key ? 'is-active' : ''}`}
                  >
                    <Icon className="h-4 w-4" />
                    {page.label}
                  </button>
                )
              })}
            </nav>

            <div className="border-t border-slate-700/80 p-2">
              <button
                type="button"
                onClick={() => {
                  setIsAuthenticated(false)
                  setCurrentUser(null)
                  setAllowedPages(['inventory', 'logistics', 'drivers', 'schedule'])
                  setActiveView('inventory')
                  setError('')
                  try {
                    localStorage.removeItem(AUTH_SESSION_KEY)
                  } catch {
                    // Ignore storage errors.
                  }
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-900/30 px-3 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-800"
              >
                Sign out
              </button>
            </div>
          </aside>

          {sidebarOpen ? (
            <button
              type="button"
              aria-label="Close sidebar"
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
            />
          ) : null}

          <div className={`main-panel flex min-h-screen w-full flex-1 flex-col space-y-2 px-2 pt-3 md:px-3 md:pt-4 ${activeView === 'assets' ? 'lg:pl-[226px]' : 'lg:pl-[210px]'} lg:pr-4 lg:pt-4`}>
            <header className="app-header flex flex-col gap-3 border-b border-slate-200 bg-white p-3 md:flex-row md:items-center md:justify-between">
              <div className="brand-wrap flex items-center gap-3">
                <button
                  type="button"
                  aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                  onClick={() => setSidebarOpen((current) => !current)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 lg:hidden"
                >
                  {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
                <div className="brand-copy">
                  <h1 className="text-2xl font-black text-slate-900">
                    {activeView === 'inventory'
                      ? 'Inventory Reconciliation'
                      : activeView === 'assets'
                        ? 'Asset Management'
                      : activeView === 'drivers'
                        ? 'Drivers Management'
                        : activeView === 'schedule'
                          ? 'Delivery Schedule'
                          : activeView === 'access'
                            ? 'Access management'
                            : activeView === 'qr-scan'
                              ? 'QR counting'
                              : 'Logistics Management'}
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
                  {currentUser?.fullName || currentUser?.username}
                </div>
              </div>

              {activeView === 'inventory' || activeView === 'logistics' || activeView === 'qr-scan' ? (
                <div className="header-actions flex items-center gap-3">
                  <select
                    value={selectedWarehouse}
                    onChange={(e) => setSelectedWarehouse(String(e.target.value).trim())}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-0 transition focus:border-sky-500 focus:shadow-sm"
                  >
                    {warehouses.length ? warehouses.map((warehouse) => (
                      <option key={warehouse} value={warehouse}>{warehouse}</option>
                    )) : <option value="">Select warehouse</option>}
                  </select>

                  {activeView === 'inventory' ? (
                    <button
                      type="button"
                      onClick={handleSyncFromOdbc}
                      disabled={syncingItems || !selectedWarehouse}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {syncingItems ? 'Syncing items...' : 'Sync from silwan'}
                    </button>
                  ) : activeView === 'logistics' ? (
                    <button
                      type="button"
                      onClick={handleSyncLogisticsFromOdbc}
                      disabled={syncingOrders}
                      className="rounded-xl bg-[#1ecf9b] px-4 py-3 text-sm font-semibold text-[#0d1a2d] shadow-sm transition hover:bg-[#19b88e] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {syncingOrders ? 'Syncing orders...' : 'Sync from silwan'}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </header>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {error}
              </div>
            ) : null}

            {result ? (
              <div className={`rounded-2xl border px-4 py-3 ${result.status === 'MATCH' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                <div className="flex items-center gap-2 text-lg font-bold">
                  {result.status === 'MATCH' ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                  {result.status === 'MATCH' ? 'Count matched' : `${result.direction} detected`}
                </div>
                <p className="mt-1 text-sm">
                  Expected {result.expected}, Counted {result.counted}, Delta {result.delta}. {result.message}
                </p>
              </div>
            ) : null}

            {activeView === 'assets' ? (
              <AssetManagement apiUrl={API_URL} />
            ) : activeView === 'access' ? (
              <UserAccessManagement
                users={users}
                onCreateUser={handleCreateUser}
                onUpdateUser={handleUpdateUser}
                onDeleteUser={handleDeleteUser}
                currentUser={currentUser}
              />
            ) : activeView === 'qr-scan' ? (
              <section className="space-y-4 border border-slate-200 bg-white p-4 shadow-none">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center bg-sky-50 text-sky-700">
                    <QrCode className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Quick count</p>
                    <h3 className="text-2xl font-black text-slate-900">QR scan counting</h3>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div id="qr-scan-target" className="min-h-[300px] w-full" />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Scanned item</div>
                    {selectedItem ? (
                      <div className="space-y-3">
                        <div>
                          <div className="text-lg font-black text-slate-900">{selectedItem.name}</div>
                          <div className="text-sm text-slate-600">SKU: {selectedItem.sku}</div>
                        </div>

                        <label className="block text-sm font-medium text-slate-700">
                          Physical quantity
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={qrScanQuantity}
                            onChange={(e) => setQrScanQuantity(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-sky-500"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => {
                            if (!selectedItem) return
                            handleReconcile(selectedItem, qrScanQuantity)
                          }}
                          disabled={loading || !selectedItem}
                          className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Save physical quantity
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                        Scan an item QR code to start the count.
                      </div>
                    )}
                  </div>
                </div>
              </section>
            ) : activeView === 'drivers' ? (
              <DriversManagement
                driverForm={driverForm}
                setDriverForm={setDriverForm}
                drivers={drivers}
                loading={loading}
                onCreateDriver={handleCreateDriver}
                onDeleteDriver={handleDeleteDriver}
                driverSearch={driverSearch}
                setDriverSearch={setDriverSearch}
              />
            ) : activeView === 'schedule' ? (
              <DeliverySchedule
                drivers={drivers}
                orderWilayas={orders.map((order) => order.wilaya)}
                deliverySchedule={deliverySchedule}
                scheduleForm={scheduleForm}
                setScheduleForm={setScheduleForm}
                onAddDeliverySlot={handleAddDeliverySlot}
                onDeleteDeliverySlot={handleDeleteDeliverySlot}
              />
            ) : activeView === 'inventory' ? (
              <>
                <div className="summary-grid grid gap-3 md:grid-cols-3">
                  <div className="summary-card accent-blue rounded-xl border border-slate-200 bg-white p-4 shadow-none">
                    <span className="summary-label">Items in view</span>
                    <strong>{items.length}</strong>
                    <small>{itemFilter === 'mismatched' ? 'Need review' : 'Ready to audit'}</small>
                  </div>
                  <div className="summary-card accent-amber rounded-xl border border-slate-200 bg-white p-4 shadow-none">
                    <span className="summary-label">Selected item</span>
                    <strong>{selectedItem ? selectedItem.name : 'None'}</strong>
                    <small>{selectedItem ? `SKU: ${selectedItem.sku}` : 'Choose an item'}</small>
                  </div>
                  <div className="summary-card accent-emerald rounded-xl border border-slate-200 bg-white p-4 shadow-none">
                    <span className="summary-label">Status</span>
                    <strong>{result ? result.status : 'Waiting'}</strong>
                    <small>{result ? `${result.delta} delta` : 'No count yet'}</small>
                  </div>
                </div>

                <main className="grid gap-4">
                  <section className="w-full border border-slate-200 bg-white p-4 shadow-none">
                    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-600">Show:</span>
                        <button
                          type="button"
                          onClick={() => setItemFilter('all')}
                          className={`rounded-xl px-3 py-2 text-sm font-semibold ${itemFilter === 'all' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                        >
                          All items
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemFilter('mismatched')}
                          className={`rounded-xl px-3 py-2 text-sm font-semibold ${itemFilter === 'mismatched' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                        >
                          Not matching
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setScannerOpen(true)}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-slate-800"
                      >
                        <Camera className="h-4 w-4" />
                        Scan QR/Barcode
                      </button>
                    </div>

                    <div className="flex flex-col gap-3 md:flex-row">
                      <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                        <input
                          value={query}
                          onChange={(e) => {
                            const nextValue = e.target.value
                            setQuery(nextValue)
                            if (nextValue.trim() || nextValue === '') {
                              searchItems(nextValue)
                            }
                          }}
                          placeholder="Search by SKU, barcode, or item name"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-11 pr-4 text-base text-slate-900 outline-none ring-0 transition focus:border-sky-500 focus:bg-white"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => searchItems()}
                        disabled={loading}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {loading ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        Search
                      </button>
                    </div>

                    {scannerOpen ? (
                      <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
                        <div id="warehouse-scanner" className="min-h-[250px] w-full" />
                      </div>
                    ) : null}

                    <div className="mt-5 w-full overflow-hidden border border-slate-200">
                      <div className="grid w-full grid-cols-[2.1fr_0.9fr_0.7fr_0.8fr_0.7fr_0.8fr_1fr_0.5fr] gap-3 bg-slate-100 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                        <span>Item</span>
                        <span>SKU</span>
                        <span>System</span>
                        <span>Physical</span>
                        <span>Diff</span>
                        <span>Counted</span>
                        <span>employee</span>
                        <span>Act</span>
                      </div>

                      <div className="max-h-[50vh] min-h-[260px] overflow-y-auto sm:max-h-[52vh] lg:max-h-[58vh]">
                        {items.length ? items.map((item) => {
                          const physicalValue = physicalQuantities[item.id] ?? String(item.last_counted_qty ?? 0)
                          const physical = Number(physicalValue || 0)
                          const systemQty = Number(item.system_qty ?? 0)
                          const diff = physical - systemQty
                          const diffClass = diff !== 0 ? 'text-red-600 font-bold' : 'text-slate-700'

                          return (
                            <div
                              key={item.id}
                              onClick={() => {
                                setSelectedItem(item)
                                setResult(null)
                              }}
                              className={`grid w-full grid-cols-[2.1fr_0.9fr_0.7fr_0.8fr_0.7fr_0.8fr_1fr_0.5fr] gap-3 border-t border-slate-200 bg-white px-4 py-3 text-left text-[14px] transition hover:bg-sky-50 ${selectedItem?.id === item.id ? 'bg-sky-50' : ''}`}
                            >
                              <span className="font-medium text-slate-800">{item.name}</span>
                              <span className="text-slate-600">{item.sku}</span>
                              <span className="text-slate-700">{systemQty}</span>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={physicalValue}
                                onChange={(e) => setPhysicalQuantities((current) => ({ ...current, [item.id]: e.target.value }))}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    setSelectedItem(item)
                                    handleReconcile(item, e.currentTarget.value)
                                  }
                                }}
                                className="w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
                                aria-label={`Physical quantity for ${item.name}`}
                              />
                              <span className={diffClass}>{diff !== 0 ? `${diff > 0 ? '+' : '-'}${Math.abs(diff)}` : '0'}</span>
                              <span className="text-slate-700">{Number(item.counted_times ?? 0)}</span>
                              <span className="truncate text-slate-700" title={item.last_counted_employee || 'Not counted'}>{item.last_counted_employee || '—'}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedItem(item)
                                  handleReconcile(item, physicalValue)
                                }}
                                disabled={loading || !authenticatedEmployeeId}
                                className="inline-flex items-center justify-center rounded-lg text-sky-600 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                                title="Reconcile physical quantity"
                              >
                                <PackageSearch className="h-4 w-4" />
                              </button>
                            </div>
                          )
                        }) : (
                          <div className="flex items-center justify-center py-12 text-sm text-slate-500">No items match your search.</div>
                        )}
                      </div>
                    </div>
                  </section>
                </main>

                <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                  <div className="border border-slate-200 bg-white p-4 shadow-none">
                    <div className="mb-3 flex items-center gap-2 text-slate-800">
                      <QrCode className="h-5 w-5 text-sky-600" />
                      <h3 className="text-xl font-bold">QR label generator</h3>
                    </div>

                    <div className="flex justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                      <QRCodeSVG ref={qrRef} value={qrValue} size={180} bgColor="#ffffff" fgColor="#0f172a" includeMargin />
                    </div>

                    <div className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                      <div className="font-semibold">Label payload</div>
                      <div className="mt-1 break-all">{qrValue}</div>
                    </div>

                    <button
                      type="button"
                      onClick={handlePrintLabel}
                      className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Print selected item QR
                    </button>
                  </div>

                  <div className="border border-slate-200 bg-white p-4 shadow-none">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Live status</p>
                        <h3 className="text-xl font-bold text-slate-900">Audit log</h3>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                        <span className="text-sm text-slate-600">Last reconciliation</span>
                        <span className="font-semibold text-slate-900">{result ? result.status : 'Waiting for count'}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                        <span className="text-sm text-slate-600">Selected item</span>
                        <span className="font-semibold text-slate-900">{selectedItem ? selectedItem.name : '—'}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                        <span className="text-sm text-slate-600">Current delta</span>
                        <span className="font-semibold text-slate-900">{result ? result.delta : 0}</span>
                      </div>
                    </div>
                  </div>
                </section>
              </>
            ) : (
              <LogisticsOrders
                orderForm={orderForm}
                setOrderForm={setOrderForm}
                orderSearch={orderSearch}
                setOrderSearch={setOrderSearch}
                orderStatusFilter={orderStatusFilter}
                setOrderStatusFilter={setOrderStatusFilter}
                orderDeliveryFilter={orderDeliveryFilter}
                setOrderDeliveryFilter={setOrderDeliveryFilter}
                filteredOrders={filteredOrders}
                totalPendingOrders={totalPendingOrders}
                totalReadyOrders={totalReadyOrders}
                logisticsStatuses={logisticsStatuses}
                formatOrderDate={formatOrderDate}
                getStatusClasses={getStatusClasses}
                onStatusChange={handleOrderStatusChange}
                onPrintOrderTicket={handlePrintOrderTicket}
                onFetchOrderDetails={handleFetchOrderDetails}
                onSaveOrderPhysicalQuantities={handleSaveOrderPhysicalQuantities}
                authenticatedEmployeeId={authenticatedEmployeeId}
                orderToOpen={pendingOrderDetails}
                onOrderDetailsOpened={setPendingOrderDetails}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
