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
import Login from '@/pages/Login'

function PrivateRoutes() {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--theme-tertiary)' }}>
      <div className="text-slate-500 text-sm">Loading…</div>
    </div>
  )
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrandProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<PrivateRoutes />}>
              <Route element={<MainLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/quotes" element={<QuoteBuilderPage />} />
                <Route path="/quotes-list" element={<QuotesList />} />
                <Route path="/gemstones" element={<GemstonesPage />} />
                <Route path="/charts" element={<Charts />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/configuration" element={<Configuration />} />
                <Route path="/master-tables" element={<MasterTables />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
        </BrandProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
