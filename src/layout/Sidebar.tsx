import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { useBrand } from '@/context/BrandContext'
import {
  Calculator,
  ClipboardList,
  Diamond,
  FileText,
  LayoutDashboard,
  LineChart,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/quotes', label: 'Quote Builder', icon: Calculator },
  { to: '/quotes-list', label: 'Quotes', icon: FileText },
  { to: '/gemstones', label: 'Gemstones', icon: Diamond },
  { to: '/charts', label: 'Charts', icon: LineChart },
  { to: '/history', label: 'History', icon: ClipboardList },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/configuration', label: 'Configuration', icon: Settings },
  { to: '/master-tables', label: 'Master Tables', icon: ClipboardList },
]

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  ANALYST: 'Analyst',
  READONLY: 'Read only',
}

export function Sidebar() {
  const { user, logout } = useAuth()
  const { companyName, logo } = useBrand()

  return (
    <aside className="hidden w-72 shrink-0 border-r border-white/10 text-slate-100 lg:block" style={{ backgroundColor: 'var(--theme-primary)' }}>
      <div className="sticky top-0 flex min-h-screen flex-col">
        <div className="border-b border-white/10 px-6 py-7">
          <div className="flex items-center gap-3">
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
            <div>
              <p className="text-sm font-semibold tracking-wide text-white">{companyName}</p>
            </div>
          </div>
        </div>

        <div className="px-4 py-6">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Navigation
          </p>
          <nav className="mt-4 flex flex-col gap-1.5">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm transition',
                    isActive
                      ? 'bg-white text-slate-950 shadow-lg shadow-black/20'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  )
                }
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 transition group-hover:bg-white/10 group-[.active]:bg-slate-100">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="font-medium">{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-4 space-y-3">
          {/* User info */}
          {user && (
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

          {/* Logout */}
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5">
              <LogOut className="h-4 w-4" />
            </span>
            <span className="font-medium">Sign out</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
