import { NotificationPanel } from '@/components/NotificationPanel'
import { useNotifications } from '@/hooks/useNotifications'
import { Bell, Menu, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
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

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed'

export function MainLayout() {
  const location = useLocation()
  const current = pageCopy[location.pathname] ?? pageCopy['/']
  const [panelOpen, setPanelOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  })
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed))
  }, [sidebarCollapsed])

  // Close mobile nav on route change
  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  // Lock body scroll while mobile nav is open
  useEffect(() => {
    if (mobileNavOpen) {
      const original = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = original
      }
    }
  }, [mobileNavOpen])

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
          collapsed={sidebarCollapsed}
        />

        <div className="flex min-h-screen flex-1 flex-col min-w-0">
          <header className="sticky top-0 z-20 border-b border-white/70 bg-white/75 backdrop-blur-xl">
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  onClick={() => setMobileNavOpen(true)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:text-slate-900 lg:hidden"
                  aria-label="Open navigation menu"
                >
                  <Menu className="h-5 w-5" />
                </button>

                <button
                  onClick={() => setSidebarCollapsed((v) => !v)}
                  className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:text-slate-900 lg:flex"
                  aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  <Menu className="h-5 w-5" />
                </button>

                <div className="min-w-0">
                  <p className="hidden items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-600 sm:flex">
                    <Sparkles className="h-3.5 w-3.5" />
                    Admin workspace
                  </p>
                  <h1 className="truncate text-lg font-semibold tracking-tight text-slate-950 sm:mt-1 sm:text-2xl">
                    {current.title}
                  </h1>
                  <p className="mt-0.5 hidden text-sm text-slate-500 sm:mt-1 sm:block">
                    {current.subtitle}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                <div className="relative">
                  <button
                    onClick={() => setPanelOpen(o => !o)}
                    className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:-translate-y-0.5 hover:text-slate-900 sm:h-11 sm:w-11"
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
            <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
