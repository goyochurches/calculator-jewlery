import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '@/context/ThemeContext'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { BrandProvider } from '@/context/BrandContext'
import { MainLayout } from '@/layout/MainLayout'
import { GemstonesPage } from '@/pages/Gemstones'
import { QuoteBuilderPage } from '@/pages/QuoteBuilder'
import { Dashboard } from '@/pages/Dashboard'
import { Metals } from '@/pages/Metals'
import { UsersPage } from '@/pages/Users'
import { Configuration } from '@/pages/Configuration'
import { ReviewsPage } from '@/pages/Reviews'
import MasterTables from '@/pages/MasterTables'
import QuotesList from '@/pages/QuotesList'
import { ProfilePage } from '@/pages/Profile'
import { ClientsPage } from '@/pages/Clients'
import { ClientDetailPage } from '@/pages/ClientDetail'
import { InboxPage } from '@/pages/Inbox'
import { PublicQuotePage } from '@/pages/PublicQuote'
import { ApprovalPage } from '@/pages/Approval'
import { PaymentSuccessPage } from '@/pages/PaymentSuccess'
import { PaymentCancelPage } from '@/pages/PaymentCancel'
import { PaymentsPage } from '@/pages/Payments'
import { FEATURES } from '@/lib/featureFlags'
import { canSeePayments } from '@/lib/paymentsAccess'
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

/** Stricter gate just for the payments route — uses the email-based
 *  canSeePayments check so even another ADMIN user can't reach the page
 *  by typing the URL directly. */
function RequirePaymentsAccess() {
  const { user } = useAuth()
  if (!canSeePayments(user)) return <Navigate to={defaultRouteFor(user?.role)} replace />
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
            {/* Public approval page reached from the WhatsApp link sent to
                the admin when a quote is saved as PENDING. */}
            <Route path="/approve/:token" element={<ApprovalPage />} />
            <Route path="/payment-success" element={<PaymentSuccessPage />} />
            <Route path="/payment-cancel" element={<PaymentCancelPage />} />
            <Route element={<PrivateRoutes />}>
              <Route element={<MainLayout />}>
                <Route path="/" element={<HomeRedirect />} />
                {/* Profile is available to every authenticated user — no
                 *  permission gate, since it only edits your own record. */}
                <Route path="/profile" element={<ProfilePage />} />
                <Route element={<RequirePermission permission="metals" />}>
                  <Route path="/metals" element={<Metals />} />
                </Route>
                <Route element={<RequirePermission permission="quotes" />}>
                  <Route path="/quotes" element={<QuoteBuilderPage />} />
                </Route>
                <Route element={<RequirePermission permission="quotes-list" />}>
                  <Route path="/quotes-list" element={<QuotesList />} />
                </Route>
                <Route element={<RequirePermission permission="messages" />}>
                  <Route path="/messages" element={<InboxPage />} />
                </Route>
                <Route element={<RequirePermission permission="gemstones" />}>
                  <Route path="/gemstones" element={<GemstonesPage />} />
                </Route>
                <Route element={<RequirePermission permission="clients" />}>
                  <Route path="/clients" element={<ClientsPage />} />
                  <Route path="/clients/:id" element={<ClientDetailPage />} />
                </Route>
                <Route element={<RequirePermission permission="users" />}>
                  <Route path="/users" element={<UsersPage />} />
                </Route>
                {FEATURES.payments && (
                  <Route element={<RequirePaymentsAccess />}>
                    <Route path="/payments" element={<PaymentsPage />} />
                  </Route>
                )}
                <Route element={<RequirePermission permission="reviews" />}>
                  <Route path="/reviews" element={<ReviewsPage />} />
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
