import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { useBrand } from '@/context/BrandContext'
import { canAccess, type NavKey } from '@/constants/permissions'
import {
  Calculator,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Contact,
  Diamond,
  FileText,
  LayoutDashboard,
  LineChart,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'

const navItems: { to: string; label: string; icon: typeof LayoutDashboard; key: NavKey }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, key: 'dashboard' },
  { to: '/quotes', label: 'Quote Builder', icon: Calculator, key: 'quotes' },
  { to: '/quotes-list', label: 'Quotes', icon: FileText, key: 'quotes-list' },
  { to: '/clients', label: 'Clients', icon: Contact, key: 'clients' },
  { to: '/gemstones', label: 'Gemstones', icon: Diamond, key: 'gemstones' },
  { to: '/charts', label: 'Charts', icon: LineChart, key: 'charts' },
  { to: '/history', label: 'History', icon: ClipboardList, key: 'history' },
  { to: '/users', label: 'Users', icon: Users, key: 'users' },
  { to: '/configuration', label: 'Configuration', icon: Settings, key: 'configuration' },
  { to: '/master-tables', label: 'Master Tables', icon: ClipboardList, key: 'master-tables' },
]

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  MANAGER: 'Store Manager',
  JEWELER: 'Jeweler',
  SALES: 'Sales',
  VIEWER: 'Viewer',
}

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

function SidebarContent({
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
}: {
  onNavigate?: () => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
}) {
  const { user, logout } = useAuth()
  const { companyName, logo } = useBrand()
  const visibleNavItems = navItems.filter((item) => canAccess(user?.role, item.key))

  return (
    <div className="flex min-h-full flex-col">
      <div
        className={cn(
          'border-b border-white/10 py-7',
          collapsed ? 'px-3' : 'px-6'
        )}
      >
        <div
          className={cn(
            'flex items-center gap-3',
            collapsed && 'justify-center'
          )}
        >
          {onToggleCollapsed && (
            <button
              onClick={onToggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white lg:flex"
            >
              {collapsed ? (
                <ChevronsRight className="h-4 w-4" />
              ) : (
                <ChevronsLeft className="h-4 w-4" />
              )}
            </button>
          )}
          {!collapsed && (
            <>
              {logo ? (
                <img
                  src={logo}
                  alt="Company logo"
                  className="h-11 w-11 rounded-2xl object-contain bg-white/10 p-1"
                />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-yellow-300 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/20">
                  <ShieldCheck className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-wide text-white">{companyName}</p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className={cn('py-6', collapsed ? 'px-2' : 'px-4')}>
        {!collapsed && (
          <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Navigation
          </p>
        )}
        <nav className={cn('flex flex-col gap-1.5', !collapsed && 'mt-4')}>
          {visibleNavItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                cn(
                  'group flex items-center rounded-2xl text-sm transition',
                  collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3.5 py-3',
                  isActive
                    ? 'bg-white text-slate-950 shadow-lg shadow-black/20'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                )
              }
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 transition group-hover:bg-white/10 group-[.active]:bg-slate-100">
                <Icon className="h-4 w-4" />
              </span>
              {!collapsed && <span className="font-medium">{label}</span>}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className={cn('mt-auto space-y-3', collapsed ? 'p-2' : 'p-4')}>
        {user && !collapsed && (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-xs font-bold text-white">
                {user.avatar}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{user.name}</p>
                <p className="text-xs text-slate-400">{ROLE_LABELS[user.role] ?? user.role}</p>
              </div>
            </div>
          </div>
        )}

        {user && collapsed && (
          <div
            className="flex h-9 w-9 mx-auto items-center justify-center rounded-2xl bg-white/10 text-xs font-bold text-white"
            title={`${user.name} · ${ROLE_LABELS[user.role] ?? user.role}`}
          >
            {user.avatar}
          </div>
        )}

        <button
          onClick={() => {
            onNavigate?.()
            logout()
          }}
          title={collapsed ? 'Sign out' : undefined}
          className={cn(
            'flex w-full items-center rounded-2xl text-sm text-slate-400 transition hover:bg-white/5 hover:text-white',
            collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3.5 py-3'
          )}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5">
            <LogOut className="h-4 w-4" />
          </span>
          {!collapsed && <span className="font-medium">Sign out</span>}
        </button>
      </div>
    </div>
  )
}

export function Sidebar({
  mobileOpen = false,
  onMobileClose,
  collapsed = false,
  onToggleCollapsed,
}: SidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden shrink-0 border-r border-white/10 text-slate-100 transition-[width] duration-200 ease-out lg:block',
          collapsed ? 'w-20' : 'w-72'
        )}
        style={{ backgroundColor: 'var(--theme-primary)' }}
      >
        <div className="sticky top-0 min-h-screen">
          <SidebarContent collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
        </div>
      </aside>

      {/* Mobile drawer + backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm transition-opacity lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onMobileClose}
        aria-hidden="true"
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-white/10 text-slate-100 shadow-2xl transition-transform duration-300 ease-out lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ backgroundColor: 'var(--theme-primary)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        <button
          onClick={onMobileClose}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/20"
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="h-full overflow-y-auto">
          <SidebarContent onNavigate={onMobileClose} />
        </div>
      </aside>
    </>
  )
}
