import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../i18n'
import { AppShell } from './AppShell'
import { InvoiceListPage } from './InvoiceListPage'
import { InvoiceDetailPage } from './InvoiceDetailPage'
import { InvoiceFormPage } from './InvoiceFormPage'
import { ObligationListPage } from './ObligationListPage'
import { ObligationFormPage } from './ObligationFormPage'
import { StatementPage } from './StatementPage'
import { ProfilePage } from './ProfilePage'
import { OverviewPage } from './OverviewPage'
import { FinancePage } from './FinancePage'
import { ProjectsPage } from './ProjectsPage'
import { MercuryPage } from './MercuryPage'
import { ReportsLayout } from './ReportsLayout'
import { UpgradePage } from './UpgradePage'
import { ClientListPage } from './ClientListPage'
import { ClientFormPage } from './ClientFormPage'
import { ItemListPage } from './ItemListPage'
import { ItemFormPage } from './ItemFormPage'
import { UsersPage } from './UsersPage'
import { InvoiceSettingsPage } from './InvoiceSettingsPage'

/** Everything behind login. Loaded on demand, so visitors to the landing page do not download the app. */
export default function AppArea() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-brand-ink/60">{t('common.loading')}</div>
  }
  if (!user) return <Navigate to="/login" replace />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<InvoiceListPage />} />
        <Route path="new" element={<InvoiceFormPage />} />
        <Route path="upgrade" element={<UpgradePage />} />
        <Route path="invoices/settings/:tab?" element={<InvoiceSettingsPage />} />
        <Route path="invoices/:invoiceId" element={<InvoiceDetailPage />} />
        <Route path="invoices/:invoiceId/edit" element={<InvoiceFormPage />} />
        <Route path="statement" element={<StatementPage />} />
        <Route element={<ReportsLayout />}>
          <Route path="finance" element={<FinancePage />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="mercury" element={<MercuryPage />} />
        </Route>
        <Route path="obligations" element={<ObligationListPage />} />
        <Route path="obligations/new" element={<ObligationFormPage />} />
        <Route path="obligations/:obligationId/edit" element={<ObligationFormPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="recurring" element={<Navigate to="/app/invoices/settings/recurring" replace />} />
        <Route path="clients" element={<ClientListPage />} />
        <Route path="clients/new" element={<ClientFormPage />} />
        <Route path="clients/:clientId" element={<ClientFormPage />} />
        <Route path="items" element={<ItemListPage />} />
        <Route path="items/new" element={<ItemFormPage />} />
        <Route path="items/:itemId" element={<ItemFormPage />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>
    </Routes>
  )
}
