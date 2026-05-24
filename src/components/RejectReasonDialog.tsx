import { Button } from '@/components/ui/button'
import { X, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

interface Props {
  open: boolean
  quoteTitle: string
  loading?: boolean
  onConfirm: (reason: string) => void
  onCancel: () => void
}

/** Modal asking the admin to explain why they're rejecting the quote.
 *  Reason is required (min 3 chars) so the creator gets actionable
 *  feedback instead of a silent rejection. */
export function RejectReasonDialog({ open, quoteTitle, loading, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setReason('')
    setError(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onCancel() }
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
    const trimmed = reason.trim()
    if (trimmed.length < 3) {
      setError('Please write at least a few words so the creator knows why.')
      return
    }
    onConfirm(trimmed)
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-dialog-title"
    >
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" onClick={() => !loading && onCancel()} />

      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/80 bg-white shadow-[0_30px_80px_rgba(244,63,94,0.25)]">
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
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <XCircle className="h-6 w-6" />
            </div>
            <div className="mt-4 sm:ml-4 sm:mt-0 sm:flex-1">
              <h2 id="reject-dialog-title" className="text-lg font-semibold tracking-tight text-slate-950">
                Reject this quote
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                Please tell the creator why <span className="font-semibold text-slate-700">{quoteTitle}</span> is being rejected. They'll see this comment in the quote detail panel.
              </p>
            </div>
          </div>

          <div className="mt-5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Reason
            </label>
            <textarea
              rows={4}
              value={reason}
              onChange={e => { setReason(e.target.value); setError(null) }}
              placeholder="e.g. Margin too low for this metal grade — please adjust the markup before resubmitting."
              className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-400 focus:bg-white focus:ring-2 focus:ring-rose-100"
              autoFocus
            />
            {error && <p className="mt-1.5 text-[11px] font-semibold text-rose-600">{error}</p>}
          </div>
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
            className="rounded-xl bg-rose-600 text-white hover:bg-rose-700"
          >
            {loading ? 'Rejecting…' : 'Reject quote'}
          </Button>
        </div>
      </div>
    </div>
  )
}
