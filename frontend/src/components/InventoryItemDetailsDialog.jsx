import { useRef } from 'react'
import { Printer, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

export default function InventoryItemDetailsDialog({
  item,
  qrValue,
  auditHistory,
  auditHistoryLoading,
  auditHistoryError,
  result,
  onClose,
  onPrintLabel,
}) {
  const qrRef = useRef(null)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-item-details-title"
        className="max-h-[90vh] w-full max-w-4xl overflow-hidden border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="inventory-item-details-title" className="text-lg font-bold text-slate-900">{item.name}</h2>
            <p className="mt-1 text-sm text-slate-600">SKU: {item.sku || '—'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center border border-slate-200 text-slate-600 hover:bg-slate-100"
            aria-label="Close item details"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid max-h-[calc(90vh-72px)] gap-5 overflow-auto p-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <section className="flex flex-col items-center gap-3 border border-slate-200 p-4">
            <h3 className="self-start text-sm font-semibold text-slate-800">QR code</h3>
            <div className="flex w-full justify-center bg-slate-50 p-4">
              <QRCodeSVG ref={qrRef} value={qrValue} size={180} bgColor="#ffffff" fgColor="#0f172a" includeMargin />
            </div>
            <p className="w-full break-all text-xs text-slate-500">{qrValue}</p>
            <button
              type="button"
              onClick={() => onPrintLabel(qrRef.current)}
              className="inline-flex w-full items-center justify-center gap-2 border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" />
              Print QR code
            </button>
          </section>

          <section className="min-w-0">
            <div className="mb-4 flex flex-wrap gap-3 text-sm">
              <div className="border border-slate-200 px-3 py-2">
                <span className="text-slate-500">Last reconciliation</span>
                <p className="font-semibold text-slate-900">{result?.status || 'Waiting for count'}</p>
              </div>
              <div className="border border-slate-200 px-3 py-2">
                <span className="text-slate-500">Current delta</span>
                <p className="font-semibold text-slate-900">{result?.delta ?? 0}</p>
              </div>
            </div>

            <h3 className="mb-3 text-sm font-semibold text-slate-800">Audit log</h3>
            {auditHistoryLoading ? (
              <p className="py-8 text-center text-sm text-slate-500">Loading audit history...</p>
            ) : auditHistoryError ? (
              <p role="alert" className="py-8 text-center text-sm text-rose-700">{auditHistoryError}</p>
            ) : auditHistory.length ? (
              <div className="max-h-[55vh] overflow-auto border border-slate-200">
                <table className="w-full min-w-[480px] text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      {['System', 'Entered', 'Difference', 'Employee', 'Date'].map((label) => (
                        <th key={label} className="border-b border-slate-200 px-2 py-2 font-semibold">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditHistory.map((entry) => (
                      <tr key={entry.id} className="border-b border-slate-100">
                        <td className="px-2 py-2 text-slate-700">{entry.systemQuantity}</td>
                        <td className="px-2 py-2 font-semibold text-slate-900">{entry.enteredQuantity}</td>
                        <td className={`px-2 py-2 font-semibold ${Number(entry.differenceQuantity) ? 'text-rose-700' : 'text-emerald-700'}`}>
                          {Number(entry.differenceQuantity) > 0 ? '+' : ''}{entry.differenceQuantity}
                        </td>
                        <td className="px-2 py-2 text-slate-700" title={entry.employeeId || ''}>{entry.employeeName || entry.employeeId || '—'}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-slate-600">{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">No quantity history for this item yet.</p>
            )}
          </section>
        </div>
      </section>
    </div>
  )
}
