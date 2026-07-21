import { useSession } from '../context/SessionContext';
import { useNewTasksCount } from '../hooks/useNewTasksCount';
import type { TabId } from '../types';

interface Props {
  onNavigate: (tab: TabId) => void;
}

export function HomePanel({ onNavigate }: Props) {
  const { session } = useSession();
  const { count: newTasksCount } = useNewTasksCount();
  const shop =
    session?.shopLabel || (session?.sap ? `SAP ${session.sap}` : 'Магазин не выбран');

  const shortcuts = [
    { tab: 'tasks' as TabId, title: 'Задачи', desc: 'Список и выполнение', emoji: '📋' },
    { tab: 'calendar' as TabId, title: 'Календарь', desc: 'Дедлайны задач по дням', emoji: '📅' },
    { tab: 'tags' as TabId, title: 'Ценики', desc: 'Инфо и поиск по фото', emoji: '🏷' },
    { tab: 'productSearch' as TabId, title: 'Поиск по фото', desc: 'Открыть вкладку поиска товара', emoji: '📷' },
    { tab: 'aiAssistant' as TabId, title: 'AI Assistant', desc: 'Чат-помощник', emoji: '🤖' },
    { tab: 'analytics' as TabId, title: 'Аналитика', desc: 'Отчёты BI', emoji: '📊' },
    { tab: 'print' as TabId, title: 'Печать', desc: 'Отправка в SAP', emoji: '🖨' },
    { tab: 'profile' as TabId, title: 'Профиль', desc: 'Магазин и аккаунт', emoji: '👤' },
  ];

  function tasksDesc(base: string) {
    if (newTasksCount <= 0) return base;
    const n = newTasksCount;
    const word = n === 1 ? 'новая задача' : n < 5 ? 'новые задачи' : 'новых задач';
    return `${n} ${word} не в работе`;
  }

  return (
    <div className="panel active home-panel">
      <div className="home-hero card">
        <p className="home-greet">Добро пожаловать</p>
        <h2 className="home-user">{session?.username || 'Сотрудник'}</h2>
        <p className="home-shop">{shop}</p>
        {newTasksCount > 0 ? (
          <p className="home-alert">Есть задачи, которые ещё не взяты в работу</p>
        ) : null}
      </div>

      <div className="home-grid">
        {shortcuts.map((s) => {
          const isTasks = s.tab === 'tasks';
          const badge = isTasks && newTasksCount > 0 ? newTasksCount : 0;
          return (
            <button
              key={s.tab}
              type="button"
              className={'home-tile' + (badge ? ' home-tile-notify' : '')}
              onClick={() => onNavigate(s.tab)}
            >
              <span className="home-tile-icon-wrap">
                <span className="home-tile-icon">{s.emoji}</span>
                {badge ? (
                  <span className="home-badge" aria-label={`${badge} новых задач`}>
                    {badge > 99 ? '99+' : badge}
                  </span>
                ) : null}
              </span>
              <strong>{s.title}</strong>
              <span className={'muted' + (badge ? ' home-tile-notify-text' : '')}>
                {isTasks ? tasksDesc(s.desc) : s.desc}
              </span>
            </button>
          );
        })}
      </div>

      <div className="card home-tip">
        <p className="muted small">
          Быстрый доступ: отсканируйте штрих-код в разделе «Ценики» или отправьте задание на
          печать из карточки товара.
        </p>
      </div>
    </div>
  );
}
