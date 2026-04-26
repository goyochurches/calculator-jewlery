import { CheckCircle2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

interface ToastProps {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  onClose: () => void
  duration?: number
}

export function Toast({
  title,
  description,
  actionLabel,
  onAction,
  onClose,
  duration = 5500,
}: ToastProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const enter = window.setTimeout(() => setVisible(true), 20)
    const exit = window.setTimeout(() => setVisible(false), duration)
    const remove = window.setTimeout(onClose, duration + 300)
    return () => {
      window.clearTimeout(enter)
      window.clearTimeout(exit)
      window.clearTimeout(remove)
    }
  }, [duration, onClose])

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 left-4 z-50 w-[min(calc(100vw-2rem),22rem)] transition-all duration-300 ease-out sm:bottom-6 sm:left-6 lg:left-[calc(18rem+1.5rem)] ${
        visible ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0'
      }`}
    >
      <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-[0_20px_60px_rgba(16,185,129,0.25)]">
        <div className="flex items-start gap-3 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-900">{title}</p>
            {description && (
              <p className="mt-0.5 truncate text-xs text-slate-600">{description}</p>
            )}
            {actionLabel && onAction && (
              <button
                onClick={() => {
                  onAction()
                  onClose()
                }}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
              >
                {actionLabel}
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Dismiss"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="h-1 w-full bg-emerald-100">
          <div
            className="h-full bg-emerald-500"
            style={{
              animation: `toast-progress ${duration}ms linear forwards`,
            }}
          />
        </div>
      </div>
      <style>{`
        @keyframes toast-progress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  )
}
