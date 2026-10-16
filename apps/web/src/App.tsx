import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Customers from './pages/Customers';
import Dashboard from './pages/Dashboard';
import Developer from './pages/Developer';
import InstallmentDetail from './pages/InstallmentDetail';
import Installments from './pages/Installments';
import Login from './pages/Login';
import Orders from './pages/Orders';
import POS from './pages/POS';
import Products from './pages/Products';
import Register from './pages/Register';
import Settings from './pages/Settings';
import SuperAdmin from './pages/SuperAdmin';
import { useAuth } from './store/auth';

function HomeRedirect() {
  const user = useAuth((s) => s.user);
  const path = user?.isDeveloper ? '/developer' : user?.role === 'cashier' ? '/pos' : '/dashboard';
  return <Navigate to={path} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<ProtectedRoute superAdminOnly />}>
        <Route path="/super-admin" element={<SuperAdmin />} />
      </Route>
      <Route path="/developer" element={<Developer />} />
      <Route path="/developer/setup" element={<Navigate to="/developer" replace />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<HomeRedirect />} />
          <Route path="pos" element={<POS />} />
          <Route path="orders" element={<Orders />} />
          <Route path="customers" element={<Customers />} />
          <Route element={<ProtectedRoute roles={['owner', 'admin', 'cashier']} />}>
            <Route path="installments" element={<Installments />} />
            <Route path="installments/:id" element={<InstallmentDetail />} />
          </Route>
          <Route element={<ProtectedRoute roles={['owner', 'admin']} />}>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="products" element={<Products />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
