import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCheck, CircleCheck, CircleX, Clock, Info } from 'lucide-react'
import type { AppNotification } from '@/services/notificationService'

interface Props {
  notifications: AppNotification[]
  onMarkRead: (n: AppNotification) => void
  onMarkAllRead: () => void
  onClose: () => void
}

const TYPE_CONFIG = {
  SUCCESS: { icon: CircleCheck, color: 'text-emerald-500', border: 'border-l-emerald-500', bg: 'bg-emerald-50/60' },
  DANGER:  { icon: CircleX,    color: 'text-rose-500',    border: 'border-l-rose-500',    bg: 'bg-rose-50/60'    },
  WARNING: { icon: Clock,      color: 'text-amber-500',   border: 'border-l-amber-400',   bg: 'bg-amber-50/60'   },
  INFO:    { icon: Info,       color: 'text-sky-500',     border: 'border-l-sky-400',     bg: 'bg-sky-50/60'     },
} as const

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)   return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function NotificationPanel({ notifications, onMarkRead, onMarkAllRead, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const hasUnread = notifications.some(n => !n.read)

  function handleClick(n: AppNotification) {
    onMarkRead(n)
    if (n.link) navigate(n.link)
    onClose()
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-14 z-50 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.15)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <span className="text-sm font-semibold text-slate-900">Notifications</span>
        {hasUnread && (
          <button
            onClick={onMarkAllRead}
            className="flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-800"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </button>
        )}
      </div>

      {/* List */}
      <div className="max-h-[420px] overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">
            No notifications yet
          </div>
        ) : (
          notifications.map(n => {
            const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.INFO
            const Icon = cfg.icon
            return (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`flex w-full items-start gap-3 border-b border-slate-50 border-l-2 px-4 py-3 text-left transition hover:bg-slate-50 ${cfg.border} ${!n.read ? cfg.bg : ''}`}
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${cfg.color}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-xs leading-5 ${n.read ? 'text-slate-500' : 'font-semibold text-slate-900'}`}>
                    {n.message}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400">{timeAgo(n.createdAt)}</p>
                </div>
                {!n.read && (
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
