import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { I18nProvider, useI18n } from './i18n'
import { AuthProvider } from './context/AuthContext'
import { Home } from './pages/Home'
import { LoginPage, SignupPage, ForgotPage, ResetPage } from './pages/AuthPages'

const AppArea = lazy(() => import('./pages/app/AppArea'))
const PublicInvoicePage = lazy(() => import('./pages/PublicInvoicePage'))

function AppFallback() {
  const { t } = useI18n()
  return <div className="flex min-h-screen items-center justify-center text-brand-ink/60">{t('common.loading')}</div>
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
            <Route path="/forgot" element={<ForgotPage />} />
            <Route path="/reset" element={<ResetPage />} />
            <Route
              path="/i"
              element={
                <Suspense fallback={<AppFallback />}>
                  <PublicInvoicePage />
                </Suspense>
              }
            />
            <Route
              path="/i/:token"
              element={
                <Suspense fallback={<AppFallback />}>
                  <PublicInvoicePage />
                </Suspense>
              }
            />
            <Route
              path="/app/*"
              element={
                <Suspense fallback={<AppFallback />}>
                  <AppArea />
                </Suspense>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  )
}
