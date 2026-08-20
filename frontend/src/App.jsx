// ============================================================
// YOUXIS IOT — Routeur principal
// Mode sécurisé : chaque visite exige une authentification.
// Routes protégées via RequireAuth, token passé à LiveDataProvider.
// ============================================================
import { Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { LiveDataProvider } from './hooks/useLiveData.jsx';
import { RequireAuth } from './hooks/RequireAuth.jsx';
import Layout from './components/Layout.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Devices from './pages/Devices.jsx';
import DeviceDetail from './pages/DeviceDetail.jsx';
import Feu from './pages/Feu.jsx';
import Cycles from './pages/Cycles.jsx';
import Montage from './pages/Montage.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';

export default function App() {
  const { token } = useAuth();

  return (
    <LiveDataProvider token={token}>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<RequireAuth><Feu /></RequireAuth>} />
            <Route path="devices" element={<RequireAuth><Devices /></RequireAuth>} />
            <Route path="devices/:id" element={<RequireAuth><DeviceDetail /></RequireAuth>} />
            <Route path="feu" element={<RequireAuth><Feu /></RequireAuth>} />
            <Route path="cycles" element={<RequireAuth><Cycles /></RequireAuth>} />
            <Route path="montage" element={<RequireAuth><Montage /></RequireAuth>} />
          </Route>
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="*" element={<RequireAuth><Feu /></RequireAuth>} />
        </Routes>
      </ErrorBoundary>
    </LiveDataProvider>
  );
}