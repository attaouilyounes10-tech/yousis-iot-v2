// ============================================================
// YOUXIS IOT — Routeur principal
// Pas de token => pages publiques (login/register) uniquement.
// Avec token => app privée + données temps réel.
// ============================================================
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { LiveDataProvider } from './hooks/useLiveData.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Devices from './pages/Devices.jsx';
import DeviceDetail from './pages/DeviceDetail.jsx';
import Dashboard from './pages/Dashboard.jsx';
import TableauDeBord from './pages/TableauDeBord.jsx';

export default function App() {
  const { token } = useAuth();

  if (!token) {
    return (
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <LiveDataProvider token={token}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="devices" element={<Devices />} />
          <Route path="devices/:id" element={<DeviceDetail />} />
          <Route path="tableau-bord" element={<TableauDeBord />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </LiveDataProvider>
  );
}