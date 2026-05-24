import { Button } from '@/components/ui/button'
import { RotateCcw, X } from 'lucide-react'
import { useEffect, useState } from 'react'

interface RefundDialogProps {
  open: boolean
  installmentNumber: number   // 1-based for display
  totalInstallments: number
  amount: number              // installment amount in USD
  quoteTitle: string | null
  loading?: boolean
  onConfirm: (amount?: number) => void   // undefined → full refund
  onCancel: () => void
}

/** Styled replacement for window.confirm + window.prompt when refunding.
 *  Lets the admin pick "full" or "partial" with a live amount input and
 *  proper validation, instead of the native browser dialogs. */
export function RefundDialog({
  open, installmentNumber, totalInstallments, amount, quoteTitle, loading,
  onConfirm, onCancel,
}: RefundDialogProps) {
  const [mode, setMode] = useState<'full' | 'partial'>('full')
  const [partial, setPartial] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    // Reset to full on open so each refund starts from a clean slate.
    setMode('full')
    setPartial('')
    setError(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel()
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open, loading, onCancel])

  if (!open) return null

  const handleConfirm = () => {
    if (mode === 'full') {
      onConfirm(undefined)
      return
    }
    const n = Number(partial)
    if (Number.isNaN(n) || n <= 0) {
      setError('Enter a positive amount.')
      return
    }
    if (n > amount) {
      setError(`Amount cannot exceed $${amount.toFixed(2)}.`)
      return
    }
    onConfirm(n)
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="refund-dialog-title"
    >
      <div
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
        onClick={() => !loading && onCancel()}
      />

      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/80 bg-white shadow-[0_30px_80px_rgba(139,92,246,0.25)]">
        <button
          type="button"
          onClick={() => !loading && onCancel()}
          disabled={loading}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-7 pt-7 pb-5">
          <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
              <RotateCcw className="h-6 w-6" />
            </div>
            <div className="mt-4 sm:ml-4 sm:mt-0 sm:flex-1">
              <h2 id="refund-dialog-title" className="text-lg font-semibold tracking-tight text-slate-950">
                Refund installment #{installmentNumber}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                {quoteTitle && <><span className="font-medium text-slate-700">{quoteTitle}</span> · </>}
                Installment {installmentNumber} of {totalInstallments} · paid amount {' '}
                <strong className="text-slate-900">${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>.
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('full')}
              className={`rounded-2xl border px-4 py-3 text-left transition ${
                mode === 'full'
                  ? 'border-violet-300 bg-violet-50 ring-2 ring-violet-200'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Full</p>
              <p className="mt-1 text-sm font-bold text-slate-900">
                ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-500">Installment returns to PENDING</p>
            </button>
            <button
              type="button"
              onClick={() => setMode('partial')}
              className={`rounded-2xl border px-4 py-3 text-left transition ${
                mode === 'partial'
                  ? 'border-violet-300 bg-violet-50 ring-2 ring-violet-200'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Partial</p>
              <p className="mt-1 text-sm font-bold text-slate-900">Custom $</p>
              <p className="text-[11px] text-slate-500">Stays PAID, history kept</p>
            </button>
          </div>

          {mode === 'partial' && (
            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Refund amount (USD)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={amount}
                value={partial}
                onChange={e => { setPartial(e.target.value); setError(null) }}
                placeholder={`Up to ${amount.toFixed(2)}`}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                autoFocus
              />
              {error && <p className="mt-1.5 text-[11px] font-semibold text-rose-600">{error}</p>}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="rounded-xl bg-violet-600 text-white hover:bg-violet-700"
          >
            {loading ? 'Issuing refund…' : 'Issue refund'}
          </Button>
        </div>
      </div>
    </div>
  )
}
