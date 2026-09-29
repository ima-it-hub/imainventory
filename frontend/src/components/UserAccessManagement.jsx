import { KeyRound, Plus, Save, ShieldCheck, Trash2, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'

const pageDefinitions = [
  { key: 'inventory', label: 'Inventory' },
  { key: 'qr-scan', label: 'QR scan' },
  { key: 'logistics', label: 'Logistics' },
  { key: 'drivers', label: 'Drivers' },
  { key: 'schedule', label: 'Delivery plan' },
  { key: 'assets', label: 'Assets' },
]

export default function UserAccessManagement({
  users,
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
  currentUser,
}) {
  const [form, setForm] = useState({
    username: '',
    password: '',
    fullName: '',
    role: 'user',
    allowedPages: ['inventory'],
  })
  const [editingId, setEditingId] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const userCountLabel = useMemo(() => `${users.length} profile${users.length === 1 ? '' : 's'}`, [users.length])

  function resetForm() {
    setForm({
      username: '',
      password: '',
      fullName: '',
      role: 'user',
      allowedPages: ['inventory'],
    })
    setEditingId(null)
    setIsModalOpen(false)
  }

  function handlePageToggle(page) {
    setForm((current) => {
      const exists = current.allowedPages.includes(page)
      return {
        ...current,
        allowedPages: exists
          ? current.allowedPages.filter((item) => item !== page)
          : [...current.allowedPages, page],
      }
    })
  }

  function handleEditUser(user) {
    setEditingId(user.id)
    setForm({
      username: user.username,
      password: '',
      fullName: user.fullName || '',
      role: user.role || 'user',
      allowedPages: user.allowedPages || [],
    })
    setIsModalOpen(true)
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (!form.username.trim()) {
      return
    }

    if (!editingId && !form.password.trim()) {
      return
    }

    const payload = {
      ...form,
      username: form.username.trim(),
      fullName: form.fullName.trim(),
      allowedPages: form.allowedPages,
      password: form.password.trim(),
    }

    if (editingId) {
      await onUpdateUser(editingId, payload)
    } else {
      await onCreateUser(payload)
    }

    resetForm()
  }

  return (
    <section className="space-y-4 border border-slate-200 bg-white p-4 shadow-none">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center bg-violet-50 text-violet-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">Security</p>
            <h3 className="text-2xl font-black text-slate-900">Access management</h3>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700">
            {userCountLabel}
          </div>
          <button
            type="button"
            onClick={() => {
              resetForm()
              setIsModalOpen(true)
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
          >
            <Plus className="h-4 w-4" />
            Add user
          </button>
        </div>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-600">Security</p>
                <h3 className="text-xl font-black text-slate-900">{editingId ? 'Edit user' : 'Add user'}</h3>
              </div>
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100"
                aria-label="Close add user form"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="grid gap-3 p-5 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Username
          <input
            type="text"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-violet-500"
            placeholder="warehouse"
          />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Full name
          <input
            type="text"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-violet-500"
            placeholder="Warehouse operator"
          />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Role
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-violet-500"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Password
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-violet-500"
            placeholder={editingId ? 'Leave blank to keep current' : 'Enter password'}
          />
        </label>

        <div className="md:col-span-2">
          <p className="mb-2 text-sm font-semibold text-slate-700">Allowed pages</p>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {pageDefinitions.map((page) => (
              <label key={page.key} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.allowedPages.includes(page.key)}
                  onChange={() => handlePageToggle(page.key)}
                  className="h-4 w-4 accent-violet-600"
                />
                {page.label}
              </label>
            ))}
          </div>
        </div>

              <div className="md:col-span-2 flex items-center justify-end gap-3 pt-2">
                {editingId ? (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                ) : null}

                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
                >
                  {editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {editingId ? 'Save changes' : 'Add user'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {users.length ? users.map((user) => (
          <div key={user.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <UserRound className="h-4 w-4 text-violet-600" />
                  {user.fullName || user.username}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                  <span>@{user.username}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                    {user.role}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleEditUser(user)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Edit
                </button>
                {user.username !== currentUser?.username ? (
                  <button
                    type="button"
                    onClick={() => onDeleteUser(user.id)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {pageDefinitions.map((page) => {
                const isAllowed = (user.allowedPages || []).includes(page.key)

                return (
                  <button
                    key={`${user.id}-${page.key}`}
                    type="button"
                    onClick={() => onUpdateUser(user.id, {
                      ...user,
                      allowedPages: isAllowed
                        ? (user.allowedPages || []).filter((item) => item !== page.key)
                        : [...(user.allowedPages || []), page.key],
                    })}
                    className={`rounded-xl border px-3 py-2 text-left text-sm font-medium transition ${
                      isAllowed
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}
                  >
                    {isAllowed ? 'Allowed' : 'Blocked'} · {page.label}
                  </button>
                )
              })}
            </div>
          </div>
        )) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
            No users yet.
          </div>
        )}
      </div>
    </section>
  )
}
