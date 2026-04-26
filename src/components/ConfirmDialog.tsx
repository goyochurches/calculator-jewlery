import { Button } from '@/components/ui/button'
import { AlertTriangle, X } from 'lucide-react'
import { useEffect } from 'react'

type Variant = 'danger' | 'warning' | 'default'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: Variant
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

const VARIANT_STYLES: Record<Variant, { icon: string; ring: string; button: string }> = {
  danger: {
    icon: 'bg-rose-50 text-rose-600',
    ring: 'shadow-[0_20px_60px_rgba(244,63,94,0.25)]',
    button: 'bg-rose-600 hover:bg-rose-700 text-white',
  },
  warning: {
    icon: 'bg-amber-50 text-amber-600',
    ring: 'shadow-[0_20px_60px_rgba(245,158,11,0.25)]',
    button: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
  default: {
    icon: 'bg-slate-100 text-slate-600',
    ring: 'shadow-[0_20px_60px_rgba(15,23,42,0.15)]',
    button: '',
  },
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel()
    }
    document.addEventListener('keydown', onKey)
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = original
    }
  }, [open, loading, onCancel])

  if (!open) return null

  const styles = VARIANT_STYLES[variant]
  const confirmStyle = variant === 'default' ? { backgroundColor: 'var(--theme-primary)' } : undefined
  const confirmClass = variant === 'default'
    ? 'text-white'
    : styles.button

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
        onClick={() => !loading && onCancel()}
      />

      {/* Dialog */}
      <div
        className={`relative w-full max-w-md overflow-hidden rounded-3xl border border-white/80 bg-white ${styles.ring}`}
      >
        <button
          onClick={() => !loading && onCancel()}
          aria-label="Close"
          disabled={loading}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-7 pt-7 pb-6">
          <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${styles.icon}`}>
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="mt-4 sm:ml-4 sm:mt-0 sm:flex-1">
              <h2 id="confirm-dialog-title" className="text-lg font-semibold tracking-tight text-slate-950">
                {title}
              </h2>
              {description && (
                <div className="mt-1.5 text-sm leading-relaxed text-slate-500">{description}</div>
              )}
            </div>
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
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={confirmStyle}
            className={`rounded-xl ${confirmClass}`}
          >
            {loading ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
