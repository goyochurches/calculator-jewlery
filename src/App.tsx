import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '@/context/ThemeContext'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { BrandProvider } from '@/context/BrandContext'
import { MainLayout } from '@/layout/MainLayout'
import { LoadingScreen } from '@/components/LoadingScreen'
import { GemstonesPage } from '@/pages/Gemstones'
import { QuoteBuilderPage } from '@/pages/QuoteBuilder'
import { QuoteBuilderWizardPage } from '@/pages/QuoteBuilderWizard'
import { Dashboard } from '@/pages/Dashboard'
import { Metals } from '@/pages/Metals'
import { UsersPage } from '@/pages/Users'
import { Configuration } from '@/pages/Configuration'
import { ReviewsPage } from '@/pages/Reviews'
import MasterTables from '@/pages/MasterTables'
import QuotesList from '@/pages/QuotesList'
import QuoteDetailPage from '@/pages/QuoteDetailPage'
import { ProfilePage } from '@/pages/Profile'
import { ClientsPage } from '@/pages/Clients'
import { ClientDetailPage } from '@/pages/ClientDetail'
import { InboxPage } from '@/pages/Inbox'
import { PublicQuotePage } from '@/pages/PublicQuote'
import { ApprovalPage } from '@/pages/Approval'
import { PaymentSuccessPage } from '@/pages/PaymentSuccess'
import { PaymentCancelPage } from '@/pages/PaymentCancel'
import { PaymentsPage } from '@/pages/Payments'
import { FEATURES, isFeatureKey } from '@/lib/featureFlags'
import { useFeatures } from '@/hooks/useFeatures'
import { canSeePayments } from '@/lib/paymentsAccess'
import Login from '@/pages/Login'
import SetupPassword from '@/pages/SetupPassword'
import { canAccess, defaultRouteFor, type NavKey } from '@/constants/permissions'

function PrivateRoutes() {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return <LoadingScreen message="Loading your workspace…" />
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}

function RequirePermission({ permission }: { permission: NavKey }) {
  const { user } = useAuth()
  const { isEnabled } = useFeatures()
  if (!canAccess(user?.role, permission)) return <Navigate to={defaultRouteFor(user?.role)} replace />
  // Runtime feature flag — a disabled module can't be reached by URL either.
  // Redirect to /profile (never feature-gated) so we can't loop on a default
  // route that is itself disabled.
  if (isFeatureKey(permission) && !isEnabled(permission)) return <Navigate to="/profile" replace />
  return <Outlet />
}

/** Stricter gate just for the payments route — uses the email-based
 *  canSeePayments check so even another ADMIN user can't reach the page
 *  by typing the URL directly. */
function RequirePaymentsAccess() {
  const { user } = useAuth()
  const { isEnabled } = useFeatures()
  if (!canSeePayments(user)) return <Navigate to={defaultRouteFor(user?.role)} replace />
  if (!isEnabled('payments')) return <Navigate to="/profile" replace />
  return <Outlet />
}

function HomeRedirect() {
  const { user } = useAuth()
  const { isEnabled } = useFeatures()
  if (!canAccess(user?.role, 'dashboard') || !isEnabled('dashboard')) {
    return <Navigate to={defaultRouteFor(user?.role)} replace />
  }
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
                <Route element={<RequirePermission permission="quotes-wizard" />}>
                  <Route path="/quotes-wizard" element={<QuoteBuilderWizardPage />} />
                </Route>
                <Route element={<RequirePermission permission="quotes-list" />}>
                  <Route path="/quotes-list" element={<QuotesList />} />
                  <Route path="/quotes-list/:id" element={<QuoteDetailPage />} />
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
