import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '@/context/ThemeContext'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { BrandProvider } from '@/context/BrandContext'
import { MainLayout } from '@/layout/MainLayout'
import { GemstonesPage } from '@/pages/Gemstones'
import { QuoteBuilderPage } from '@/pages/QuoteBuilder'
import { Dashboard } from '@/pages/Dashboard'
import { Charts } from '@/pages/Graphics'
import { HistoryPage } from '@/pages/Historial'
import { UsersPage } from '@/pages/Users'
import { Configuration } from '@/pages/Configuration'
import MasterTables from '@/pages/MasterTables'
import QuotesList from '@/pages/QuotesList'
import { ClientsPage } from '@/pages/Clients'
import { ClientDetailPage } from '@/pages/ClientDetail'
import { PublicQuotePage } from '@/pages/PublicQuote'
import Login from '@/pages/Login'
import SetupPassword from '@/pages/SetupPassword'
import { canAccess, defaultRouteFor, type NavKey } from '@/constants/permissions'

function PrivateRoutes() {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--theme-tertiary)' }}>
      <div className="flex items-center gap-2">
        <span
          className="h-3 w-3 animate-bounce rounded-full"
          style={{ backgroundColor: 'var(--theme-primary)', animationDelay: '0ms' }}
        />
        <span
          className="h-3 w-3 animate-bounce rounded-full"
          style={{ backgroundColor: 'var(--theme-primary)', animationDelay: '150ms' }}
        />
        <span
          className="h-3 w-3 animate-bounce rounded-full"
          style={{ backgroundColor: 'var(--theme-primary)', animationDelay: '300ms' }}
        />
      </div>
    </div>
  )
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}

function RequirePermission({ permission }: { permission: NavKey }) {
  const { user } = useAuth()
  if (!canAccess(user?.role, permission)) return <Navigate to={defaultRouteFor(user?.role)} replace />
  return <Outlet />
}

function HomeRedirect() {
  const { user } = useAuth()
  if (!canAccess(user?.role, 'dashboard')) return <Navigate to={defaultRouteFor(user?.role)} replace />
  return <Dashboard />
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrandProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/setup-password/:token" element={<SetupPassword />} />
            {/* Public, unauthenticated quote viewer for shareable links */}
            <Route path="/q/:token" element={<PublicQuotePage />} />
            <Route element={<PrivateRoutes />}>
              <Route element={<MainLayout />}>
                <Route path="/" element={<HomeRedirect />} />
                <Route element={<RequirePermission permission="quotes" />}>
                  <Route path="/quotes" element={<QuoteBuilderPage />} />
                </Route>
                <Route element={<RequirePermission permission="quotes-list" />}>
                  <Route path="/quotes-list" element={<QuotesList />} />
                </Route>
                <Route element={<RequirePermission permission="gemstones" />}>
                  <Route path="/gemstones" element={<GemstonesPage />} />
                </Route>
                <Route element={<RequirePermission permission="clients" />}>
                  <Route path="/clients" element={<ClientsPage />} />
                  <Route path="/clients/:id" element={<ClientDetailPage />} />
                </Route>
                <Route element={<RequirePermission permission="charts" />}>
                  <Route path="/charts" element={<Charts />} />
                </Route>
                <Route element={<RequirePermission permission="history" />}>
                  <Route path="/history" element={<HistoryPage />} />
                </Route>
                <Route element={<RequirePermission permission="users" />}>
                  <Route path="/users" element={<UsersPage />} />
                </Route>
                <Route element={<RequirePermission permission="configuration" />}>
                  <Route path="/configuration" element={<Configuration />} />
                </Route>
                <Route element={<RequirePermission permission="master-tables" />}>
                  <Route path="/master-tables" element={<MasterTables />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
        </BrandProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
