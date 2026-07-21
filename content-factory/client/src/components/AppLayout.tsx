import { NavLink, Outlet } from 'react-router-dom';
import { SiteNav } from './SiteNav';

const links = [
  { to: '/app', end: true, label: 'Обзор' },
  { to: '/app/ideas', label: 'Идеи' },
  { to: '/app/review', label: 'Ревью' },
  { to: '/app/calendar', label: 'Календарь' },
  { to: '/app/brand', label: 'Бренд' },
];

export function AppLayout() {
  return (
    <div className="app-shell">
      <SiteNav />
      <div className="container dashboard">
        <div className="dash-grid">
          <aside className="side-nav">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end}>
                {link.label}
              </NavLink>
            ))}
          </aside>
          <main>
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
