import { NavLink, Outlet } from 'react-router-dom';
import { useRestaurant } from '../lib/session';
import { canEdit } from '../lib/live';
import { ReadOnlyBanner } from './ui';

const tabs = [
  { to: '/', label: 'الطلبات', icon: '🔔' },
  { to: '/menu', label: 'المنيو', icon: '📋' },
  { to: '/tables', label: 'الـ QR', icon: '🔳' },
  { to: '/settings', label: 'الإعدادات', icon: '⚙️' },
];

export function Layout() {
  const { restaurant } = useRestaurant();
  return (
    <div className="mx-auto min-h-dvh max-w-3xl pb-24">
      <header className="sticky top-0 z-30 flex items-center justify-between bg-stone-100/90 px-4 py-3 backdrop-blur">
        <h1 className="truncate text-lg font-bold">{restaurant.name.ar}</h1>
      </header>
      <main className="px-4">
        {!canEdit(restaurant) && <ReadOnlyBanner />}
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-3xl grid-cols-4">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-xs font-bold ${isActive ? 'text-stone-900' : 'text-stone-400'}`
              }
            >
              <span className="text-xl" aria-hidden>{t.icon}</span>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
