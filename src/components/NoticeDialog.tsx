import { Button } from '@/components/ui/button'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { useEffect } from 'react'

type Variant = 'error' | 'success' | 'info'

interface NoticeDialogProps {
  open: boolean
  title: string
  description?: React.ReactNode
  variant?: Variant
  closeLabel?: string
  onClose: () => void
}

const VARIANT = {
  error:   { icon: 'bg-rose-50 text-rose-600',      Icon: AlertTriangle,  ring: 'shadow-[0_20px_60px_rgba(244,63,94,0.22)]' },
  success: { icon: 'bg-emerald-50 text-emerald-600', Icon: CheckCircle2,  ring: 'shadow-[0_20px_60px_rgba(16,185,129,0.22)]' },
  info:    { icon: 'bg-slate-100 text-slate-600',    Icon: Info,          ring: 'shadow-[0_20px_60px_rgba(15,23,42,0.15)]' },
} as const

/** One-button informational / error modal — a prettier replacement for the
 *  native alert(). Sibling of {@link ConfirmDialog} (which is two-button). */
export function NoticeDialog({
  open, title, description, variant = 'info', closeLabel = 'OK', onClose,
}: NoticeDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = original
    }
  }, [open, onClose])

  if (!open) return null
  const s = VARIANT[variant]
  const Icon = s.Icon

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 animate-in fade-in" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-md overflow-hidden rounded-3xl border border-white/80 bg-white ${s.ring}`}>
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="px-7 pt-7 pb-6">
          <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${s.icon}`}>
              <Icon className="h-6 w-6" />
            </div>
            <div className="mt-4 sm:ml-4 sm:mt-0 sm:flex-1">
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h2>
              {description && <div className="mt-1.5 text-sm leading-relaxed text-slate-500">{description}</div>}
            </div>
          </div>
        </div>
        <div className="flex justify-end border-t border-slate-100 bg-slate-50/60 px-6 py-4">
          <Button type="button" onClick={onClose} className="rounded-xl text-white" style={{ backgroundColor: 'var(--theme-primary)' }}>
            {closeLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
