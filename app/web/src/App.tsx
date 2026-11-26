import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { BarcodeGeneratorPage, BarcodeScannerPage } from './pages/Barcodes';
import ProtectedRoute from './components/ProtectedRoute';
import Customers from './pages/Customers';
import Dashboard from './pages/Dashboard';
import InstallmentDetail from './pages/InstallmentDetail';
import InstallmentModulePage from './pages/InstallmentModulePage';
import Installments from './pages/Installments';
import Login from './pages/Login';
import Recovery from './pages/Recovery';
import { AccountSecurity, ChangePasswordPage, WhatsAppSettings } from './pages/AccountSecurity';
import ResetPassword from './pages/ResetPassword';
import Orders from './pages/Orders';
import POS from './pages/POS';
import Products from './pages/Products';
import Register from './pages/Register';
import Reports from './pages/Reports';
import Help from './pages/Help';
import Backup from './pages/Backup';
import Spare from './pages/Spare';
import { useAuth } from './store/auth';
import { useTenant } from './hooks/useTenant';
import { availablePages } from './utils/access';

const StockReplenishment = lazy(() => import('./pages/OperationalModules').then(({ StockReplenishment }) => ({ default: StockReplenishment })));
const CollectionsForecast = lazy(() => import('./pages/OperationalModules').then(({ CollectionsForecast }) => ({ default: CollectionsForecast })));
const DataSync = lazy(() => import('./pages/DataSync'));
const Developer = lazy(() => import('./pages/Developer'));
const Settings = lazy(() => import('./pages/Settings'));
const SuperAdmin = lazy(() => import('./pages/SuperAdmin'));

function HomeRedirect() {
  const user = useAuth((s) => s.user);
  const { tenant } = useTenant();
  const firstPage = user ? availablePages(user, tenant)[0] : undefined;
  if (user && !user.isDeveloper && !user.isSuperAdmin && !firstPage) return <main className="card m-8 space-y-3"><h1 className="text-xl font-semibold">No modules assigned</h1><p>Ask your business owner to assign module rights to your account.</p><button type="button" className="btn-secondary" onClick={() => useAuth.getState().logout()}>Sign out</button></main>;
  const path = user?.isDeveloper ? '/developer' : user?.isSuperAdmin ? '/super-admin' : `/${firstPage?.key ?? 'pos'}`;
  return <Navigate to={path} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<p className="m-6" role="status">Loading page…</p>}><Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/account-security" element={<AccountSecurity />} />
      <Route path="/account-security/change-password" element={<ChangePasswordPage />} />
      <Route path="/account-security/whatsapp" element={<WhatsAppSettings />} />
      <Route path="/recover" element={<Recovery key="email" />} />
      <Route path="/recover/whatsapp" element={<Recovery key="whatsapp" channel="whatsapp" />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/register" element={<Register />} />

      <Route element={<ProtectedRoute superAdminOnly />}>
        <Route path="/super-admin" element={<SuperAdmin />} />
      </Route>
      <Route path="/developer" element={<Developer />} />
      <Route path="/developer/setup" element={<Navigate to="/developer" replace />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="help" element={<Help />} />
          <Route path="backup" element={<Backup />} />
          <Route element={<ProtectedRoute roles={['owner']} />}>
            <Route path="data-sync" element={<DataSync />} />
          </Route>
          <Route index element={<HomeRedirect />} />
          <Route path="pos" element={<POS />} />
          <Route path="orders" element={<Orders />} />
          <Route path="customers" element={<Customers />} />
          <Route element={<ProtectedRoute roles={['owner', 'admin', 'cashier']} />}>
            <Route path="barcode-generator" element={<BarcodeGeneratorPage />} />
            <Route path="barcode-scanner" element={<BarcodeScannerPage />} />
            <Route path="installments" element={<Installments />} />
            <Route path="installments/dashboard" element={<InstallmentModulePage title="Installment Dashboard" description="Independent installment metrics and tenant-safe payment activity." kind="dashboard" />} />
            <Route path="installments/products" element={<InstallmentModulePage title="Installment Products" description="Standalone installment catalog for high-value goods." kind="products" />} />
            <Route path="installments/customers" element={<InstallmentModulePage title="Installment Customers" description="Customers tied to independent installment agreements and ledgers." kind="customers" />} />
            <Route path="installments/sales/new" element={<InstallmentModulePage title="New Installment Sale" description="Create dedicated installment sales outside the POS catalog." kind="sales" />} />
            <Route path="installments/agreements" element={<InstallmentModulePage title="Installment Agreements" description="Review the tenant-owned agreement portfolio." kind="agreements" />} />
            <Route path="installments/payments" element={<InstallmentModulePage title="Payment Collection" description="Record customer payment activity against installment schedules." kind="payments" />} />
            <Route path="installments/schedules" element={<InstallmentModulePage title="Installment Schedules" description="Track due, paid, overdue, and remaining installments." kind="schedules" />} />
            <Route path="installments/ledgers" element={<InstallmentModulePage title="Customer Ledgers" description="Tenant-isolated customer installment and balance history." kind="ledgers" />} />
            <Route path="installments/receipts" element={<InstallmentModulePage title="Receipts" description="Payment receipts and receipt history for installment accounts." kind="receipts" />} />
            <Route path="installments/overdue" element={<InstallmentModulePage title="Overdue Accounts" description="Collections risk and overdue balances from independent installment sales." kind="overdue" />} />
            <Route path="installments/reports" element={<InstallmentModulePage title="Installment Reports" description="Independent metrics built from installment-only records." kind="reports" />} />
            <Route path="installments/settings" element={<InstallmentModulePage title="Installment Settings" description="Tenant configuration for the dedicated installment module." kind="settings" />} />
            <Route path="installments/:id" element={<InstallmentDetail />} />
          </Route>
          <Route element={<ProtectedRoute roles={['owner', 'admin']} />}>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="reports" element={<Reports />} />
            <Route path="stock-replenishment" element={<StockReplenishment />} />
            <Route path="collections-forecast" element={<CollectionsForecast />} />
            <Route path="products" element={<Products />} />
            <Route path="settings" element={<Settings />} />
            <Route path="spare" element={<Spare />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes></Suspense>
  );
}
