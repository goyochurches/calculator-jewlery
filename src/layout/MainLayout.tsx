import { NotificationPanel } from '@/components/NotificationPanel'
import { useNotifications } from '@/hooks/useNotifications'
import { Bell, Search, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'

const pageCopy: Record<string, { title: string; subtitle: string }> = {
  '/': {
    title: 'Metals overview',
    subtitle: 'Track pricing, momentum and activity across your desk.',
  },
  '/quotes': {
    title: 'Quote builder',
    subtitle: 'Estimate jewelry pricing from metal reference, design work and labor.',
  },
  '/gemstones': {
    title: 'Gemstone pricing',
    subtitle: 'Review stones, grades and reference prices for your jewelry quotes.',
  },
  '/charts': {
    title: 'Market charts',
    subtitle: 'Review trend direction with clean historical views.',
  },
  '/history': {
    title: 'Trading history',
    subtitle: 'Monitor recent entries, signals and day-over-day change.',
  },
  '/users': {
    title: 'Team access',
    subtitle: 'Manage operators, analysts and read-only members.',
  },
  '/configuration': {
    title: 'Workspace settings',
    subtitle: 'Keep API, refresh cadence and reporting preferences aligned.',
  },
  '/quotes-list': {
    title: 'All quotes',
    subtitle: 'Browse every saved quote, see who created it and review the full breakdown.',
  },
  '/master-tables': {
    title: 'Master tables',
    subtitle: 'Reference data for metals, gemstones and price history.',
  },
}

export function MainLayout() {
  const location = useLocation()
  const current = pageCopy[location.pathname] ?? pageCopy['/']
  const [panelOpen, setPanelOpen] = useState(false)
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-white/70 bg-white/75 backdrop-blur-xl">
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-600">
                  <Sparkles className="h-3.5 w-3.5" />
                  Admin workspace
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                  {current.title}
                </h1>
                <p className="mt-1 text-sm text-slate-500">{current.subtitle}</p>
              </div>

              <div className="hidden items-center gap-3 md:flex">
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 shadow-sm">
                  <Search className="h-4 w-4" />
                  Search metals, signals, users
                </div>

                {/* Bell button */}
                <div className="relative">
                  <button
                    onClick={() => setPanelOpen(o => !o)}
                    className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:-translate-y-0.5 hover:text-slate-900"
                  >
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>

                  {panelOpen && (
                    <NotificationPanel
                      notifications={notifications}
                      onMarkRead={markRead}
                      onMarkAllRead={markAllRead}
                      onClose={() => setPanelOpen(false)}
                    />
                  )}
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1">
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
