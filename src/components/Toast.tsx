import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

type ToastVariant = 'success' | 'error'

interface ToastProps {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  onClose: () => void
  duration?: number
  variant?: ToastVariant
}

const VARIANT_STYLES: Record<ToastVariant, {
  border: string; shadow: string; iconBg: string; iconShadow: string;
  titleColor: string; barBg: string; barFill: string; actionColor: string;
}> = {
  success: {
    border: 'border-emerald-200',
    shadow: 'shadow-[0_20px_60px_rgba(16,185,129,0.25)]',
    iconBg: 'bg-emerald-500',
    iconShadow: 'shadow-emerald-500/30',
    titleColor: 'text-emerald-900',
    barBg: 'bg-emerald-100',
    barFill: 'bg-emerald-500',
    actionColor: 'text-emerald-700 hover:text-emerald-800',
  },
  error: {
    border: 'border-rose-200',
    shadow: 'shadow-[0_20px_60px_rgba(244,63,94,0.25)]',
    iconBg: 'bg-rose-500',
    iconShadow: 'shadow-rose-500/30',
    titleColor: 'text-rose-900',
    barBg: 'bg-rose-100',
    barFill: 'bg-rose-500',
    actionColor: 'text-rose-700 hover:text-rose-800',
  },
}

export function Toast({
  title,
  description,
  actionLabel,
  onAction,
  onClose,
  duration = 5500,
  variant = 'success',
}: ToastProps) {
  const [visible, setVisible] = useState(false)
  const styles = VARIANT_STYLES[variant]

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

  const Icon = variant === 'error' ? AlertTriangle : CheckCircle2

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 right-4 z-50 w-[min(calc(100vw-2rem),22rem)] transition-all duration-300 ease-out sm:bottom-6 sm:right-6 ${
        visible ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'
      }`}
    >
      <div className={`overflow-hidden rounded-2xl border ${styles.border} bg-white ${styles.shadow}`}>
        <div className="flex items-start gap-3 p-4">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${styles.iconBg} text-white shadow-lg ${styles.iconShadow}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold ${styles.titleColor}`}>{title}</p>
            {description && (
              <p className="mt-0.5 text-xs text-slate-600">{description}</p>
            )}
            {actionLabel && onAction && (
              <button
                onClick={() => {
                  onAction()
                  onClose()
                }}
                className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${styles.actionColor}`}
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
        <div className={`h-1 w-full ${styles.barBg}`}>
          <div
            className={`h-full ${styles.barFill}`}
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
