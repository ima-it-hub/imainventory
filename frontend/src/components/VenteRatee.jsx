import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'

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

export default function VenteRatee({
  items = [],
  loading = false,
  error = '',
  selectedWarehouse = '',
  onResolve,
  resolvingId = null,
}) {
  const [search, setSearch] = useState('')

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return items
    return items.filter((item) => {
      const client = String(item.customerName || '').toLowerCase()
      const product = String(item.productLabel || '').toLowerCase()
      const orderNumber = String(item.orderNumber || '').toLowerCase()
      return client.includes(term) || product.includes(term) || orderNumber.includes(term)
    })
  }, [items, search])

  return (
    <section className="w-full border border-slate-200 bg-white p-4 shadow-none">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Vente ratée</h2>
          <p className="mt-1 text-sm text-slate-600">
            Shortages marked as vente ratée
            {selectedWarehouse ? ` for ${selectedWarehouse}` : ''}.
          </p>
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {filteredItems.length} item{filteredItems.length === 1 ? '' : 's'}
          {search.trim() ? ` of ${items.length}` : ''}
        </p>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by client or product"
          aria-label="Search vente ratée by client or product"
          className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-emerald-500"
        />
      </div>

      {error ? (
        <p role="alert" className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="py-12 text-center text-sm text-slate-500">Loading vente ratée items...</p>
      ) : filteredItems.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {['Client', 'Order', 'Product', 'Difference qty', 'Warehouse', 'Requested', ''].map((label) => (
                  <th key={label || 'actions'} className="border-b border-slate-200 px-3 py-2 font-semibold">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const busy = resolvingId === item.id
                return (
                  <tr key={item.id} className="border-b border-slate-100 align-top">
                    <td className="px-3 py-3 font-semibold text-slate-900">{item.customerName || '—'}</td>
                    <td className="px-3 py-3 font-medium text-slate-800">{item.orderNumber || '—'}</td>
                    <td className="px-3 py-3 text-slate-700">{item.productLabel || '—'}</td>
                    <td className="px-3 py-3 tabular-nums font-semibold text-rose-700">
                      {formatQuantity(item.differenceQuantity)}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{item.requestingWarehouse || '—'}</td>
                    <td className="px-3 py-3 text-slate-500">{formatDate(item.createdAt || item.updatedAt)}</td>
                    <td className="px-3 py-3 text-right">
                      {onResolve ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onResolve(item.id)}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busy ? 'Saving...' : 'Resolve'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-12 text-center text-sm text-slate-500">
          {items.length
            ? 'No vente ratée items match your search.'
            : 'No vente ratée items for this warehouse.'}
        </p>
      )}
    </section>
  )
}
