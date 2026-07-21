import { NavLink } from 'react-router-dom';

export function SiteNav() {
  return (
    <header className="site-nav">
      <div className="container site-nav-inner">
        <NavLink to="/" className="brand-mark">
          Контент<span>Завод</span>
        </NavLink>
        <nav className="nav-links">
          <a href="/#pipeline">Пайплайн</a>
          <NavLink to="/app">Кабинет</NavLink>
          <NavLink to="/app/review" className="btn btn-signal">
            Открыть завод
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
