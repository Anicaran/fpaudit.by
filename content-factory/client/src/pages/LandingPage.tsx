import { Link } from 'react-router-dom';
import { SiteNav } from '../components/SiteNav';

const steps = [
  {
    n: '01',
    title: 'Сбор и анализ',
    text: 'Завод собирает сигналы по нише и разбирает, что стоит превратить в ролик.',
  },
  {
    n: '02',
    title: 'Сценарий',
    text: 'Сам пишет хук, сцены, CTA и тексты под площадки — в голосе вашего бренда.',
  },
  {
    n: '03',
    title: 'Озвучка',
    text: 'Сам озвучивает сценарий (edge-tts / fallback) и готовит дорожку.',
  },
  {
    n: '04',
    title: 'Визуал',
    text: 'Сам рисует вертикальные кадры под каждую сцену.',
  },
  {
    n: '05',
    title: 'Сборка',
    text: 'Сам монтирует mp4 через ffmpeg и отдаёт ролик на ревью.',
  },
];

export function LandingPage() {
  return (
    <div className="app-shell">
      <SiteNav />
      <section className="hero">
        <div className="container hero-content">
          <p className="mono">видеоконвейер · mvp 0.2</p>
          <h1 className="display">
            Контент
            <br />
            Завод
          </h1>
          <p>
            Сам собирает и анализирует контент, сам пишет сценарий, сам озвучивает, сам делает
            визуал и сам собирает готовый ролик — вы только утверждаете.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-signal" to="/app">
              Запустить кабинет
            </Link>
            <a
              className="btn btn-secondary"
              href="#pipeline"
              style={{ color: 'var(--paper)', borderColor: 'rgba(243,239,228,0.35)' }}
            >
              Как собирается ролик
            </a>
          </div>
        </div>
      </section>

      <div className="strip">
        <div className="strip-track" aria-hidden="true">
          <span>Анализ</span>
          <span>Сценарий</span>
          <span>Озвучка</span>
          <span>Визуал</span>
          <span>Сборка mp4</span>
          <span>Ревью</span>
          <span>Анализ</span>
          <span>Сценарий</span>
          <span>Озвучка</span>
          <span>Визуал</span>
          <span>Сборка mp4</span>
          <span>Ревью</span>
        </div>
      </div>

      <section className="section" id="pipeline">
        <div className="container">
          <h2 className="display">Полный видеозавод</h2>
          <p className="section-lead">
            Не только тексты: от сырья до вертикального ролика в одном пайплайне.
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
              Что на выходе
            </h2>
          </div>
          <p style={{ marginTop: 0, color: 'var(--muted)', maxWidth: '46rem' }}>
            Готовый mp4 (1080×1920), озвучка, кадры сцен, тексты для Telegram/VK/блога и очередь
            модерации. Без API-ключей завод работает на stub/локальных движках; с OpenRouter и
            edge-tts — на живой генерации.
          </p>
          <Link className="btn" to="/app/review">
            Открыть очередь роликов
          </Link>
        </div>
      </section>

      <footer className="footer">
        <div className="container mono">КонтентЗавод · видеоконвейер Molly Web Studio</div>
      </footer>
    </div>
  );
}
