import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { I18nProvider, useI18n } from './i18n'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Home } from './pages/Home'
import { LoginPage, SignupPage } from './pages/AuthPages'
import { AppShell } from './pages/app/AppShell'
import { InvoiceListPage } from './pages/app/InvoiceListPage'
import { InvoiceDetailPage } from './pages/app/InvoiceDetailPage'
import { InvoiceFormPage } from './pages/app/InvoiceFormPage'
import { ProfilePage } from './pages/app/ProfilePage'

function RequireAuth() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-brand-ink/60">{t('common.loading')}</div>
  }
  if (!user) return <Navigate to="/login" replace />
  return <AppShell />
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/app" element={<RequireAuth />}>
              <Route index element={<InvoiceListPage />} />
              <Route path="new" element={<InvoiceFormPage />} />
              <Route path="invoices/:invoiceId" element={<InvoiceDetailPage />} />
              <Route path="invoices/:invoiceId/edit" element={<InvoiceFormPage />} />
              <Route path="profile" element={<ProfilePage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  )
}
