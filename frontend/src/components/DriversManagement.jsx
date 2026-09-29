import { MapPinned, Phone, Search, Trash2, Truck, UserRound, X } from 'lucide-react'
import { useState } from 'react'

export default function DriversManagement({
  driverForm,
  setDriverForm,
  drivers,
  loading,
  onCreateDriver,
  onDeleteDriver,
  driverSearch,
  setDriverSearch,
}) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  const filteredDrivers = drivers.filter((driver) => {
    const searchTerm = (driverSearch || '').trim().toLowerCase()
    if (!searchTerm) return true

    const searchFields = [
      driver.name || '',
      driver.region || '',
      driver.vehicle || '',
      driver.phone || '',
    ].join(' ').toLowerCase()

    return searchFields.includes(searchTerm)
  })

  function handleOpenModal() {
    setIsModalOpen(true)
  }

  function handleCloseModal() {
    setIsModalOpen(false)
  }

  function handleSubmit(event) {
    onCreateDriver(event)
    handleCloseModal()
  }

  return (
    <section className="space-y-4 border border-slate-200 bg-white p-4 shadow-none">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center bg-sky-50 text-sky-700">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-2xl font-black text-slate-900">Drivers management</h3>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenModal}
          className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Add driver
        </button>
      </div>

      

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Fleet</p>
                <h3 className="text-xl font-black text-slate-900">Add driver</h3>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100"
                aria-label="Close add driver form"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="grid gap-3 p-5 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Full name
                <input
                  type="text"
                  value={driverForm.name}
                  onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-sky-500"
                  placeholder="Driver name"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Phone
                <input
                  type="text"
                  value={driverForm.phone}
                  onChange={(e) => setDriverForm({ ...driverForm, phone: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-sky-500"
                  placeholder="+213 555 0000"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Region
                <input
                  type="text"
                  value={driverForm.region}
                  onChange={(e) => setDriverForm({ ...driverForm, region: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-sky-500"
                  placeholder="Algiers"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Vehicle
                <input
                  type="text"
                  value={driverForm.vehicle}
                  onChange={(e) => setDriverForm({ ...driverForm, vehicle: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-sky-500"
                  placeholder="Truck 12"
                />
              </label>

              <label className="text-sm font-medium text-slate-700 md:col-span-2">
                Notes
                <textarea
                  rows="3"
                  value={driverForm.notes}
                  onChange={(e) => setDriverForm({ ...driverForm, notes: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-sky-500"
                  placeholder="Schedule, route notes, or vehicle details"
                />
              </label>

              <div className="md:col-span-2 flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? 'Saving...' : 'Save driver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            {/* <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Fleet list</p> */}
            <h4 className="text-xl font-bold text-slate-900">Current drivers</h4>
          </div>
          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-700">
            {filteredDrivers.length} drivers
          </span>
        </div>

        <div className="border-b border-slate-200 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={driverSearch}
              onChange={(e) => setDriverSearch(e.target.value)}
              placeholder="Search by driver name or wilaya"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:bg-white"
            />
          </div>
        </div>

        <div className="space-y-2 p-3">
          {filteredDrivers.length ? filteredDrivers.map((driver) => (
            <div key={driver.id} className="flex flex-col gap-3 border border-slate-200 bg-white p-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <UserRound className="h-4 w-4 text-sky-600" />
                  {driver.name}
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {driver.phone || '—'}</span>
                  <span className="inline-flex items-center gap-1"><MapPinned className="h-3.5 w-3.5" /> {driver.region || '—'}</span>
                  <span className="inline-flex items-center gap-1"><Truck className="h-3.5 w-3.5" /> {driver.vehicle || '—'}</span>
                </div>
                {/* {driver.notes ? <p className="text-sm text-slate-500">{driver.notes}</p> : null} */}
              </div>

              <button
                type="button"
                onClick={() => onDeleteDriver(driver.id)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          )) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No drivers saved yet.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
