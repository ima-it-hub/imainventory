import { CalendarRange, MapPinned, Trash2, Truck } from 'lucide-react'

const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const algerianWilayas = [
  { code: '01', name: 'ADRAR' },
  { code: '02', name: 'CHLEF' },
  { code: '03', name: 'LAGHOUAT' },
  { code: '04', name: 'OUM-EL-BOUAGHI' },
  { code: '05', name: 'BATNA' },
  { code: '06', name: 'BEJAIA' },
  { code: '07', name: 'BISKRA' },
  { code: '08', name: 'BECHAR' },
  { code: '09', name: 'BLIDA' },
  { code: '10', name: 'BOUIRA' },
  { code: '11', name: 'TAMANRASSET' },
  { code: '12', name: 'TEBESSA' },
  { code: '13', name: 'TLEMCEN' },
  { code: '14', name: 'TIARET' },
  { code: '15', name: 'TIZI-OUZOU' },
  { code: '16', name: 'ALGER', aliases: ['Algiers'] },
  { code: '17', name: 'DJELFA' },
  { code: '18', name: 'JIJEL' },
  { code: '19', name: 'SETIF' },
  { code: '20', name: 'SAIDA' },
  { code: '21', name: 'SKIKDA' },
  { code: '22', name: 'SIDI-BEL-ABBES' },
  { code: '23', name: 'ANNABA' },
  { code: '24', name: 'GUELMA' },
  { code: '25', name: 'CONSTANTINE' },
  { code: '26', name: 'MEDEA' },
  { code: '27', name: 'MOSTAGANEM' },
  { code: '28', name: 'M\'SILA' },
  { code: '29', name: 'MASCARA' },
  { code: '30', name: 'OUARGLA' },
  { code: '31', name: 'ORAN' },
  { code: '32', name: 'EL-BAYADH' },
  { code: '33', name: 'ILLIZI' },
  { code: '34', name: 'BORDJ-BOU-ARRERIDJ' },
  { code: '35', name: 'BOUMERDES' },
  { code: '36', name: 'EL-TARF' },
  { code: '37', name: 'TINDOUF' },
  { code: '38', name: 'TISSEMSILT' },
  { code: '39', name: 'EL-OUED' },
  { code: '40', name: 'KHENCHELA' },
  { code: '41', name: 'SOUK-AHRAS' },
  { code: '42', name: 'TIPAZA' },
  { code: '43', name: 'MILA' },
  { code: '44', name: 'AIN-DEFLA' },
  { code: '45', name: 'NAAMA' },
  { code: '46', name: 'AIN-TEMOUCHENT' },
  { code: '47', name: 'GHARDAIA' },
  { code: '48', name: 'RELIZANE' },
]

function normalizeWilaya(value) {
  return String(value || '')
    .replace(/\s*\(\d{2}\)\s*$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function formatFrenchWilaya(value) {
  const rawWilaya = String(value || '').trim()
  const code = rawWilaya.match(/\((\d{2})\)\s*$/)?.[1]
  const normalizedName = normalizeWilaya(rawWilaya)
  const wilaya = algerianWilayas.find((item) => (
    item.code === code ||
    normalizeWilaya(item.name) === normalizedName ||
    item.aliases?.some((alias) => normalizeWilaya(alias) === normalizedName)
  ))

  if (!wilaya) return rawWilaya
  return wilaya.name
}

export default function DeliverySchedule({
  drivers,
  orderWilayas = [],
  deliverySchedule,
  scheduleForm,
  setScheduleForm,
  onAddDeliverySlot,
  onDeleteDeliverySlot,
}) {
  const uniqueOrderWilayas = [...new Set(orderWilayas.map((wilaya) => String(wilaya || '').trim()).filter(Boolean))]
  const orderWilayaKeys = new Set(uniqueOrderWilayas.map(normalizeWilaya))
  const wilayaOptions = [
    ...algerianWilayas.map((wilaya) => ({
      key: `standard-${wilaya.code}`,
      value: wilaya.name,
      label: wilaya.name,
    })),
    ...uniqueOrderWilayas
      .map(formatFrenchWilaya)
      .filter((value) => !orderWilayaKeys.has(normalizeWilaya(value))
        && !algerianWilayas.some((wilaya) => normalizeWilaya(wilaya.name) === normalizeWilaya(value)))
      .map((value) => ({ key: `order-${value}`, value, label: value })),
  ]
  const groupedByDay = Object.fromEntries(weekDays.map((day) => [day, []]))

  deliverySchedule.forEach((route) => {
    if (groupedByDay[route.day]) {
      groupedByDay[route.day].push(route)
    }
  })

  return (
    <section className="border border-slate-200 bg-white p-4 shadow-none">
      <form onSubmit={onAddDeliverySlot} className="mb-5 grid gap-3 border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-end">
        <label className="text-sm font-medium text-slate-700">
          Wilaya
          <select
            value={scheduleForm.wilaya}
            onChange={(e) => setScheduleForm({ ...scheduleForm, wilaya: e.target.value })}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-sky-500"
          >
            <option value="">Select wilaya</option>
            {wilayaOptions.map((wilaya) => (
              <option key={wilaya.key} value={wilaya.value}>
                {wilaya.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Day
          <select
            value={scheduleForm.day}
            onChange={(e) => setScheduleForm({ ...scheduleForm, day: e.target.value })}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-sky-500"
          >
            {weekDays.map((day) => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Driver (optional)
          <select
            value={scheduleForm.driverId}
            onChange={(e) => setScheduleForm({ ...scheduleForm, driverId: e.target.value })}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-sky-500"
          >
            <option value="">No driver assigned</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={String(driver.id)}>{driver.name}</option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-500"
        >
          Add route
        </button>
      </form>

      <div className="grid gap-3 md:grid-cols-7">
        {weekDays.map((day) => (
          <div key={day} className="min-h-[220px] border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-bold uppercase tracking-[0.18em] text-slate-600">
              {day}
            </div>

            <div className="space-y-2 p-2">
              {groupedByDay[day]?.length ? groupedByDay[day].map((route) => {
                const driver = drivers.find((item) => String(item.id) === String(route.driverId))

                return (
                  <div key={route.id} className="rounded-xl border border-sky-200 bg-sky-50 p-2 text-xs text-slate-700">
                    <div className="mb-1 flex items-center gap-1 font-bold text-slate-900">
                      <MapPinned className="h-3.5 w-3.5 text-sky-600" />
                      {formatFrenchWilaya(route.wilaya)}
                    </div>
                    <div className="flex items-center gap-1 text-slate-600">
                      <Truck className="h-3.5 w-3.5" />
                      {driver ? driver.name : 'Unassigned'}
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteDeliverySlot(route.id)}
                      className="mt-2 inline-flex items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              }) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-[11px] text-slate-400">
                  No route
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
