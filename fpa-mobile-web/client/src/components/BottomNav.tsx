import type { TabId } from '../types';

const TABS: { id: TabId; label: string }[] = [
  { id: 'tasks', label: 'Задачи' },
  { id: 'tags', label: 'Ценики' },
  { id: 'home', label: 'Главная' },
  { id: 'print', label: 'Ценики' },
  { id: 'profile', label: 'Профиль' },
];

const ICON = {
  strokeWidth: 1.75,
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function NavIcon({ id }: { id: TabId }) {
  switch (id) {
    case 'tasks':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"
            {...ICON}
          />
        </svg>
      );
    case 'tags':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"
            {...ICON}
          />
          <circle cx="7.5" cy="7.5" r="1.5" {...ICON} />
        </svg>
      );
    case 'home':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" {...ICON} />
        </svg>
      );
    case 'print':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6v-8z"
            {...ICON}
          />
        </svg>
      );
    case 'profile':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="4" {...ICON} />
          <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" {...ICON} />
        </svg>
      );
  }
}

interface Props {
  active: TabId;
  onChange: (tab: TabId) => void;
}

export function BottomNav({ active, onChange }: Props) {
  return (
    <div className="bottom-nav-wrap">
      <nav className="bottom-nav" aria-label="Основное меню">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={'nav-item' + (active === t.id ? ' active' : '')}
            onClick={() => onChange(t.id)}
            aria-current={active === t.id ? 'page' : undefined}
            aria-label={t.label}
          >
            <span className="nav-icon">
              <NavIcon id={t.id} />
            </span>
            <span className="nav-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
