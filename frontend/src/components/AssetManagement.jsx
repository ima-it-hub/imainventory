import { useEffect, useMemo, useState } from 'react'
import { Boxes, Check, MapPin, PackagePlus, Pencil, Plus, Printer, Search, Trash2, X } from 'lucide-react'

const currencyFormatter = new Intl.NumberFormat('fr-DZ', {
  style: 'currency',
  currency: 'DZD',
  maximumFractionDigits: 2,
})

function formatCurrency(value) {
  return currencyFormatter.format(Number(value) || 0)
}

function getAssetValue(asset) {
  return (Number(asset.quantity) || 0) * (Number(asset.purchaseValue) || 0)
}

function getAssetCurrentValue(asset) {
  return (Number(asset.quantity) || 0) * (Number(asset.currentValue) || 0)
}

function calculateCurrentValue(purchaseValue, depreciationPercentage) {
  const purchase = Number(purchaseValue) || 0
  const percentage = Number(depreciationPercentage) || 0
  return Math.round((purchase - (purchase * percentage) / 100) * 100) / 100
}

function getDepreciationPercentage(purchaseValue, currentValue) {
  const purchase = Number(purchaseValue) || 0
  if (!purchase) return '0'
  return String(Number((((purchase - (Number(currentValue) || 0)) / purchase) * 100).toFixed(6)))
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export default function AssetManagement({ apiUrl }) {
  const [assets, setAssets] = useState([])
  const [categories, setCategories] = useState([])
  const [places, setPlaces] = useState([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [activeDialog, setActiveDialog] = useState(null)
  const [categoryName, setCategoryName] = useState('')
  const [placeName, setPlaceName] = useState('')
  const [currentValueDrafts, setCurrentValueDrafts] = useState({})
  const [savingCurrentValueId, setSavingCurrentValueId] = useState(null)
  const [form, setForm] = useState({
    name: '',
    categoryId: '',
    quantity: '1',
    placeId: '',
    purchaseValue: '',
    depreciationPercentage: '0',
    repairStatus: 'Réparable',
  })

  function printAssetQr(asset) {
    const printWindow = window.open('', '_blank', 'width=600,height=760')
    if (!printWindow) {
      setError('Your browser blocked the print window. Please allow pop-ups and try again.')
      return
    }

    const code = `AST-${String(asset.id).padStart(6, '0')}`
    const assetName = escapeHtml(asset.name)
    const payload = JSON.stringify({ type: 'asset', id: asset.id, code })
    const qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(payload)}`
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Asset QR - ${code}</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: Arial, sans-serif; color: #111827; }
            .label { width: 320px; padding: 22px; border: 1px solid #cbd5e1; text-align: center; }
            .code { margin: 0 0 8px; color: #475569; font-size: 13px; font-weight: 700; }
            .name { margin: 0 0 16px; font-size: 19px; overflow-wrap: anywhere; }
            .qr { width: 190px; height: 190px; }
            @media print { body { min-height: initial; } .label { border: 0; } }
          </style>
        </head>
        <body>
          <main class="label">
            <p class="code">${code}</p>
            <h1 class="name">${assetName}</h1>
            <img class="qr" src="${qrImage}" alt="Asset QR code" />
          </main>
          <script>window.onload = function () { window.print(); setTimeout(function () { window.close(); }, 800); };</script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  async function request(path, options) {
    const response = await fetch(`${apiUrl}${path}`, options)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Request failed')
    return data
  }

  async function loadData() {
    setError('')
    try {
      const [assetData, categoryData, placeData] = await Promise.all([
        request('/api/assets'),
        request('/api/asset-categories'),
        request('/api/asset-places'),
      ])
      setAssets(assetData.assets || [])
      setCategories(categoryData.categories || [])
      setPlaces(placeData.places || [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load asset data')
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredAssets = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    if (!term) return assets
    return assets.filter((asset) => (
      [asset.name, asset.categoryName, asset.placeName, `AST-${String(asset.id).padStart(6, '0')}`]
        .some((value) => String(value || '').toLocaleLowerCase().includes(term))
    ))
  }, [assets, search])

  const totalValue = assets.reduce((sum, asset) => sum + getAssetValue(asset), 0)
  const totalCurrentValue = assets.reduce((sum, asset) => sum + getAssetCurrentValue(asset), 0)

  function summarizeBy(idKey, nameKey, source) {
    const totals = new Map()
    for (const asset of assets) {
      const id = asset[idKey]
      const current = totals.get(id) || {
        id,
        name: asset[nameKey],
        assetCount: 0,
        quantity: 0,
        value: 0,
        currentValue: 0,
      }
      current.assetCount += 1
      current.quantity += Number(asset.quantity) || 0
      current.value += getAssetValue(asset)
      current.currentValue += getAssetCurrentValue(asset)
      totals.set(id, current)
    }
    return source.map((item) => totals.get(item.id) || {
      id: item.id,
      name: item.name,
      assetCount: 0,
      quantity: 0,
      value: 0,
      currentValue: 0,
    })
  }

  const categoryTotals = summarizeBy('categoryId', 'categoryName', categories)
  const placeTotals = summarizeBy('placeId', 'placeName', places)

  function resetForm() {
    setForm({ name: '', categoryId: '', quantity: '1', placeId: '', purchaseValue: '', depreciationPercentage: '0', repairStatus: 'Réparable' })
    setEditingId(null)
    setActiveDialog(null)
  }

  function startEdit(asset) {
    setEditingId(asset.id)
    setForm({
      name: asset.name,
      categoryId: String(asset.categoryId),
      quantity: String(asset.quantity),
      placeId: String(asset.placeId),
      purchaseValue: String(asset.purchaseValue),
      depreciationPercentage: getDepreciationPercentage(asset.purchaseValue, asset.currentValue ?? asset.purchaseValue),
      repairStatus: asset.repairStatus || 'Réparable',
    })
    setError('')
    setActiveDialog('asset')
  }

  async function saveAsset(event) {
    event.preventDefault()
    if (!form.name.trim() || !form.categoryId || !form.placeId) {
      setError('Enter an asset name and select a category and place.')
      return
    }

    const { depreciationPercentage: enteredPercentage, ...assetFields } = form
    const depreciationPercentage = enteredPercentage === '' ? NaN : Number(enteredPercentage)
    const payload = {
      ...assetFields,
      categoryId: Number(form.categoryId),
      placeId: Number(form.placeId),
      quantity: Number(form.quantity),
      purchaseValue: Number(form.purchaseValue),
      currentValue: calculateCurrentValue(form.purchaseValue, depreciationPercentage),
      repairStatus: form.repairStatus,
    }
    if (!Number.isFinite(payload.quantity) || payload.quantity < 0
      || !Number.isFinite(payload.purchaseValue) || payload.purchaseValue < 0
      || !Number.isFinite(depreciationPercentage)
      || depreciationPercentage < 0 || depreciationPercentage > 100) {
      setError('Quantity and purchase value must be non-negative, and depreciation must be between 0% and 100%.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const path = editingId ? `/api/assets/${editingId}` : '/api/assets'
      await request(path, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      resetForm()
      await loadData()
    } catch (saveError) {
      setError(saveError.message || 'Unable to save asset')
    } finally {
      setSaving(false)
    }
  }

  async function deleteAsset(asset) {
    if (!window.confirm(`Delete ${asset.name}?`)) return
    setError('')
    try {
      await request(`/api/assets/${asset.id}`, { method: 'DELETE' })
      await loadData()
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete asset')
    }
  }

  async function saveCurrentValue(asset) {
    const enteredPercentage = currentValueDrafts[asset.id]
      ?? getDepreciationPercentage(asset.purchaseValue, asset.currentValue)
    const depreciationPercentage = enteredPercentage === '' ? NaN : Number(enteredPercentage)
    if (!Number.isFinite(depreciationPercentage) || depreciationPercentage < 0 || depreciationPercentage > 100) {
      setError('Depreciation must be between 0% and 100%.')
      return
    }
    const currentValue = calculateCurrentValue(asset.purchaseValue, depreciationPercentage)

    setSavingCurrentValueId(asset.id)
    setError('')
    try {
      const data = await request(`/api/assets/${asset.id}/current-value`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentValue }),
      })
      setAssets((current) => current.map((item) => (
        item.id === asset.id ? { ...item, ...data.asset } : item
      )))
      setCurrentValueDrafts((current) => {
        const next = { ...current }
        delete next[asset.id]
        return next
      })
    } catch (saveError) {
      setError(saveError.message || 'Unable to save current value')
    } finally {
      setSavingCurrentValueId(null)
    }
  }

  async function saveRepairStatus(asset, repairStatus) {
    setError('')
    try {
      const data = await request(`/api/assets/${asset.id}/repair-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repairStatus }),
      })
      setAssets((current) => current.map((item) => (
        item.id === asset.id ? { ...item, ...data.asset } : item
      )))
      setCurrentValueDrafts((current) => {
        const next = { ...current }
        delete next[asset.id]
        return next
      })
    } catch (statusError) {
      setError(statusError.message || 'Unable to update asset status')
    }
  }

  async function addLookup(kind, event) {
    event.preventDefault()
    const isCategory = kind === 'category'
    const value = isCategory ? categoryName : placeName
    if (!value.trim()) return
    setError('')
    try {
      await request(`/api/asset-${isCategory ? 'categories' : 'places'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: value.trim() }),
      })
      if (isCategory) setCategoryName('')
      else setPlaceName('')
      await loadData()
    } catch (addError) {
      setError(addError.message || `Unable to add ${kind}`)
    }
  }

  async function deleteLookup(kind, item) {
    const isCategory = kind === 'category'
    setError('')
    try {
      await request(`/api/asset-${isCategory ? 'categories' : 'places'}/${item.id}`, { method: 'DELETE' })
      await loadData()
    } catch (deleteError) {
      setError(deleteError.message || `Unable to delete ${kind}`)
    }
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="summary-card accent-blue border border-slate-200 bg-white p-4">
          <span className="summary-label">Assets</span>
          <strong>{assets.length}</strong>
          <small>Registered asset records</small>
        </div>
        <div className="summary-card accent-emerald border border-slate-200 bg-white p-4">
          <span className="summary-label">Total purchase value</span>
          <strong className="text-lg">{formatCurrency(totalValue)}</strong>
          <small>Quantity × purchase value</small>
        </div>
        <div className="summary-card accent-sky border border-slate-200 bg-white p-4">
          <span className="summary-label">Total current value</span>
          <strong className="text-lg">{formatCurrency(totalCurrentValue)}</strong>
          <small>Quantity × current value</small>
        </div>
        <div className="summary-card accent-amber border border-slate-200 bg-white p-4">
          <span className="summary-label">Categories / places</span>
          <strong>{categories.length} / {places.length}</strong>
          <small>Managed classifications</small>
        </div>
      </div>

      {error && <div role="alert" className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => { resetForm(); setActiveDialog('asset') }} disabled={!categories.length || !places.length} className="inline-flex items-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50">
          <PackagePlus className="h-4 w-4" />Add asset
        </button>
        <button type="button" onClick={() => { setCategoryName(''); setError(''); setActiveDialog('categories') }} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <Plus className="h-4 w-4" />Manage categories
        </button>
        <button type="button" onClick={() => { setPlaceName(''); setError(''); setActiveDialog('places') }} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <Plus className="h-4 w-4" />Manage places
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <Boxes className="h-4 w-4 text-sky-700" />
            <h2 className="text-sm font-bold text-slate-900">Value by category</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Category</th><th>Assets</th><th className="text-right">Purchase value</th><th className="text-right">Current value</th></tr></thead>
              <tbody>{categoryTotals.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="py-2 font-medium text-slate-800">{item.name}</td><td className="text-slate-600">{item.assetCount}</td><td className="text-right text-slate-700">{formatCurrency(item.value)}</td><td className="text-right text-slate-700">{formatCurrency(item.currentValue)}</td></tr>)}</tbody>
            </table>
            {!categoryTotals.length && <p className="py-4 text-sm text-slate-500">No categories yet.</p>}
          </div>
        </section>

        <section className="border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-emerald-700" />
            <h2 className="text-sm font-bold text-slate-900">Value by place</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Place</th><th>Assets</th><th className="text-right">Purchase value</th><th className="text-right">Current value</th></tr></thead>
              <tbody>{placeTotals.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="py-2 font-medium text-slate-800">{item.name}</td><td className="text-slate-600">{item.assetCount}</td><td className="text-right text-slate-700">{formatCurrency(item.value)}</td><td className="text-right text-slate-700">{formatCurrency(item.currentValue)}</td></tr>)}</tbody>
            </table>
            {!placeTotals.length && <p className="py-4 text-sm text-slate-500">No places yet.</p>}
          </div>
        </section>
      </div>

      <section className="border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-bold text-slate-900">Assets</h2>
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search assets, categories, places" className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{['Asset', 'Category', 'Quantity', 'Place', 'Unit purchase value', 'Depreciation (%)', 'Purchase total', 'Current total', 'QR', 'Status', 'Actions'].map((label) => <th key={label} className="border-b border-slate-200 px-3 py-2 font-semibold">{label}</th>)}</tr></thead>
            <tbody>
              {filteredAssets.map((asset) => (
                <tr key={asset.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-3"><div className="font-semibold text-slate-900">{asset.name}</div><div className="text-xs text-slate-500">AST-{String(asset.id).padStart(6, '0')}</div></td>
                  <td className="px-3 py-3 text-slate-700">{asset.categoryName}</td>
                  <td className="px-3 py-3 text-slate-700">{Number(asset.quantity).toLocaleString()}</td>
                  <td className="px-3 py-3 text-slate-700">{asset.placeName}</td>
                  <td className="px-3 py-3 text-slate-700">{formatCurrency(asset.purchaseValue)}</td>
                  <td className="px-3 py-2">
                    <div className="flex min-w-36 items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        disabled={asset.repairStatus === 'Irréparable'}
                        value={currentValueDrafts[asset.id] ?? getDepreciationPercentage(asset.purchaseValue, asset.currentValue ?? asset.purchaseValue)}
                        onChange={(event) => setCurrentValueDrafts((current) => ({ ...current, [asset.id]: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            saveCurrentValue(asset)
                          }
                        }}
                        aria-label={`Depreciation percentage for ${asset.name}`}
                        className="w-28 min-w-0 rounded-md border border-slate-300 px-2 py-2 text-sm text-slate-900 outline-none focus:border-sky-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                      />
                      <span className="text-xs text-slate-500">%</span>
                      <button
                        type="button"
                        onClick={() => saveCurrentValue(asset)}
                        disabled={savingCurrentValueId === asset.id || currentValueDrafts[asset.id] === undefined}
                        title="Save depreciation percentage"
                        aria-label={`Save depreciation percentage for ${asset.name}`}
                        className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center border border-sky-200 text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">Current: {formatCurrency(calculateCurrentValue(asset.purchaseValue, currentValueDrafts[asset.id] ?? getDepreciationPercentage(asset.purchaseValue, asset.currentValue ?? asset.purchaseValue)))}</div>
                  </td>
                  <td className="px-3 py-3 font-medium text-slate-900">{formatCurrency(getAssetValue(asset))}</td>
                  <td className="px-3 py-3 font-medium text-slate-900">{formatCurrency(getAssetCurrentValue(asset))}</td>
                  <td className="px-3 py-3"><button type="button" onClick={() => printAssetQr(asset)} title={`Print QR for ${asset.name}`} aria-label={`Print QR for ${asset.name}`} className="inline-flex h-9 w-9 items-center justify-center border border-slate-200 text-slate-700 hover:bg-slate-100"><Printer className="h-4 w-4" /></button></td>
                  <td className="px-3 py-3">
                    <select
                      value={asset.repairStatus || 'Réparable'}
                      onChange={(event) => saveRepairStatus(asset, event.target.value)}
                      aria-label={`Repair status for ${asset.name}`}
                      className={`rounded-md border px-2 py-1.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-400 ${asset.repairStatus === 'Irréparable' ? 'border-rose-300 bg-rose-100 text-rose-800' : asset.repairStatus === 'Sent to maintenance' ? 'border-orange-300 bg-orange-100 text-orange-800' : 'border-emerald-300 bg-emerald-100 text-emerald-800'}`}
                    >
                      <option value="Réparable">Réparable</option>
                      <option value="Irréparable">Irréparable</option>
                      <option value="Sent to maintenance">Sent to maintenance</option>
                    </select>
                  </td>
                  <td className="px-3 py-3"><div className="flex gap-2"><button type="button" onClick={() => startEdit(asset)} aria-label={`Edit ${asset.name}`} className="inline-flex h-9 w-9 items-center justify-center border border-slate-200 text-slate-700 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => deleteAsset(asset)} aria-label={`Delete ${asset.name}`} className="inline-flex h-9 w-9 items-center justify-center border border-rose-200 text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button></div></td>
                </tr>
              ))}
              {!filteredAssets.length && <tr><td colSpan="11" className="px-3 py-10 text-center text-slate-500">{assets.length ? 'No assets match your search.' : 'No assets have been added yet.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {activeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={() => activeDialog === 'asset' ? resetForm() : setActiveDialog(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="asset-form-dialog-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 id="asset-form-dialog-title" className="text-lg font-bold text-slate-900">
                  {activeDialog === 'asset'
                    ? (editingId ? 'Edit asset' : 'Add asset')
                    : activeDialog === 'categories' ? 'Category management' : 'Place management'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => activeDialog === 'asset' ? resetForm() : setActiveDialog(null)}
                aria-label="Close dialog"
                className="inline-flex h-9 w-9 items-center justify-center border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {error && <p role="alert" className="mb-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

            {activeDialog === 'asset' ? (
              <form onSubmit={saveAsset} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                    Asset name
                    <input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-sky-600" placeholder="Laptop, desk, vehicle..." />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Category
                    <select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })} required className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-sky-600">
                      <option value="">Select category</option>
                      {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Place
                    <select value={form.placeId} onChange={(event) => setForm({ ...form, placeId: event.target.value })} required className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-sky-600">
                      <option value="">Select place</option>
                      {places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Quantity
                    <input type="number" min="0" step="0.01" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-sky-600" />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Unit purchase value
                    <input type="number" min="0" step="0.01" value={form.purchaseValue} onChange={(event) => setForm({ ...form, purchaseValue: event.target.value })} required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-sky-600" placeholder="0.00" />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Depreciation percentage
                    <input type="number" min="0" max="100" step="0.01" value={form.depreciationPercentage} onChange={(event) => setForm({ ...form, depreciationPercentage: event.target.value })} required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-sky-600" placeholder="0" />
                    <span className="mt-1 block text-xs text-slate-500">Calculated unit current value: {formatCurrency(calculateCurrentValue(form.purchaseValue, form.depreciationPercentage))}</span>
                  </label>
                </div>
                <footer className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                  <button type="button" onClick={resetForm} className="border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
                  <button type="submit" disabled={saving} className="inline-flex items-center gap-2 bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50">
                    <Plus className="h-4 w-4" />{saving ? 'Saving...' : editingId ? 'Save changes' : 'Add asset'}
                  </button>
                </footer>
              </form>
            ) : (
              <div className="space-y-5">
              <form onSubmit={(event) => addLookup(activeDialog === 'categories' ? 'category' : 'place', event)} className="space-y-4">
                <label className="block text-sm font-medium text-slate-700">
                  {activeDialog === 'categories' ? 'Category name' : 'Place name'}
                  <input
                    autoFocus
                    value={activeDialog === 'categories' ? categoryName : placeName}
                    onChange={(event) => activeDialog === 'categories' ? setCategoryName(event.target.value) : setPlaceName(event.target.value)}
                    required
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-sky-600"
                    placeholder={activeDialog === 'categories' ? 'e.g. IT equipment' : 'e.g. Main office'}
                  />
                </label>
                <footer className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                  <button type="submit" className="inline-flex items-center gap-2 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"><Plus className="h-4 w-4" />Add {activeDialog === 'categories' ? 'category' : 'place'}</button>
                </footer>
              </form>
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto border-y border-slate-100">
                {(activeDialog === 'categories' ? categories : places).map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-slate-800">
                      {item.name} <span className="text-xs text-slate-500">({item.assetCount} assets)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteLookup(activeDialog === 'categories' ? 'category' : 'place', item)}
                      disabled={item.assetCount > 0}
                      title={item.assetCount > 0 ? 'Move or delete assigned assets first' : 'Delete'}
                      aria-label={`Delete ${item.name}`}
                      className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center border border-slate-200 text-rose-700 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
                {!(activeDialog === 'categories' ? categories : places).length && (
                  <li className="py-5 text-center text-sm text-slate-500">No {activeDialog === 'categories' ? 'categories' : 'places'} yet.</li>
                )}
              </ul>
              <footer className="flex justify-end">
                <button type="button" onClick={() => setActiveDialog(null)} className="border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Close</button>
              </footer>
              </div>
            )}
          </section>
        </div>
      )}

    </section>
  )
}
