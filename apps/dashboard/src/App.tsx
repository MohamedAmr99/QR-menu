import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Menu } from './pages/Menu';
import { Orders } from './pages/Orders';
import { Settings } from './pages/Settings';
import { Tables } from './pages/Tables';
import { logout, SessionProvider, useSession } from './lib/session';

function Gate() {
  const s = useSession();
  if (s.state === 'loading' || (s.state === 'ready' && !s.restaurant))
    return <div className="flex min-h-dvh items-center justify-center text-stone-500">جاري التحميل…</div>;
  if (s.state === 'signedOut') return <Login />;
  if (s.state === 'noRestaurant') {
    void logout();
    return <Login notice="الحساب ده مش مربوط بمطعم. كلمنا على واتساب." />;
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Orders />} />
        <Route path="menu" element={<Menu />} />
        <Route path="tables" element={<Tables />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Gate />
      </SessionProvider>
    </BrowserRouter>
  );
}
