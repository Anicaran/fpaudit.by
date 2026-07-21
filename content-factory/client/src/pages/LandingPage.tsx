import { Link } from 'react-router-dom';
import { SiteNav } from '../components/SiteNav';

const steps = [
  {
    n: '01',
    title: 'Сигналы',
    text: 'Тренды, RSS и Telegram-источники собирают сырьё под вашу нишу.',
  },
  {
    n: '02',
    title: 'Идеи',
    text: 'Агенты предлагают углы и раскладывают их по столпам контента бренда.',
  },
  {
    n: '03',
    title: 'Черновик',
    text: 'Исследование → текст → адаптация под Telegram, VK, блог, Reels и рассылку.',
  },
  {
    n: '04',
    title: 'Ревью',
    text: 'Human-in-the-loop: вы одобряете, правите или отклоняете перед выходом.',
  },
  {
    n: '05',
    title: 'Календарь',
    text: 'Публикация по расписанию. Завод работает, пока вы занимаетесь бизнесом.',
  },
];

export function LandingPage() {
  return (
    <div className="app-shell">
      <SiteNav />
      <section className="hero">
        <div className="container hero-content">
          <p className="mono">конвейер контента · mvp 0.1</p>
          <h1 className="display">
            Контент
            <br />
            Завод
          </h1>
          <p>
            Система, которая сама находит темы, пишет материалы, адаптирует их под площадки и
            публикует по календарю — с вашим голосом бренда и контролем качества.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-signal" to="/app">
              Запустить кабинет
            </Link>
            <a className="btn btn-secondary" href="#pipeline" style={{ color: 'var(--paper)', borderColor: 'rgba(243,239,228,0.35)' }}>
              Как устроен пайплайн
            </a>
          </div>
        </div>
      </section>

      <div className="strip">
        <div className="strip-track" aria-hidden="true">
          <span>Telegram</span>
          <span>VK</span>
          <span>Блог / SEO</span>
          <span>Reels & Shorts</span>
          <span>Рассылка</span>
          <span>Human-in-the-loop</span>
          <span>Telegram</span>
          <span>VK</span>
          <span>Блог / SEO</span>
          <span>Reels & Shorts</span>
          <span>Рассылка</span>
          <span>Human-in-the-loop</span>
        </div>
      </div>

      <section className="section" id="pipeline">
        <div className="container">
          <h2 className="display">Один поток — пять этапов</h2>
          <p className="section-lead">
            Архитектура как у рабочих content factory: специализированные стадии, общий статус и
            гейт модерации перед публикацией.
          </p>
          <div className="pipeline-track">
            {steps.map((step) => (
              <article className="pipeline-step" key={step.n}>
                <div className="mono">{step.n}</div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container panel">
          <div className="panel-head">
            <h2 className="display" style={{ fontSize: '2rem' }}>
              Собран по образцу успешных заводов
            </h2>
          </div>
          <p style={{ marginTop: 0, color: 'var(--muted)', maxWidth: '46rem' }}>
            Взяли рабочие паттерны из ContentPulse, FITTIN Контентзавод и multi-agent пайплайнов:
            сбор сигналов, генерация идей, бриф, мультиканальные черновики, score качества и
            календарь публикаций. API-ключи опциональны — stub-адаптеры дают полный демо-цикл
            сразу после запуска.
          </p>
          <Link className="btn" to="/app/review">
            Перейти к очереди ревью
          </Link>
        </div>
      </section>

      <footer className="footer">
        <div className="container mono">КонтентЗавод · часть экосистемы Molly Web Studio</div>
      </footer>
    </div>
  );
}
