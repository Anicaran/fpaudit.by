# КонтентЗавод

MVP контент-завода: конвейер от сигналов и идей до мультиканальных черновиков, ревью и календаря публикаций.

Ориентиры: [ContentPulse](https://github.com/snehilmodani/ContentPulse), FITTIN «Контентзавод», multi-agent пайплайны (research → draft → adapt → approve → publish).

## Что умеет

- **Профиль бренда** — ниша, аудитория, голос, столпы контента
- **Сбор идей** — stub-тренды (или OpenRouter, если задан ключ)
- **Пайплайн** — исследование → черновик → адаптация под Telegram / VK / блог / Reels / рассылку
- **Quality score** и очередь **human-in-the-loop**
- **Календарь** и stub-publisher по расписанию

## Стек

| Слой | Технология |
|------|------------|
| Frontend | React 19, Vite, React Router |
| Backend | FastAPI |
| Хранение | JSON-файл (`server/data/factory.json`) |
| AI | Stub-адаптеры + опционально OpenRouter |

## Запуск

### Backend

```bash
cd content-factory/server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### Frontend

```bash
cd content-factory/client
npm install
npm run dev
```

Откройте http://localhost:5174 — Vite проксирует `/api` на порт `8001`.

### Опционально: живой LLM

```bash
export OPENROUTER_API_KEY=sk-or-...
export OPENROUTER_MODEL=openai/gpt-4o-mini
```

Без ключа завод полностью работает на детерминированных stub-адаптерах.

## API (кратко)

- `GET /api/dashboard` — метрики, задания, события
- `GET/PATCH /api/brand` — профиль бренда
- `POST /api/ideas/generate` — сбор сигналов + идеи
- `POST /api/ideas/{id}/approve` → затем `POST /api/jobs` запускает пайплайн
- `POST /api/jobs/{id}/approve` — опубликовать или запланировать
- `POST /api/publisher/tick` — опубликовать due-задания

## Дальше

1. Реальные коннекторы источников (RSS / Telegram)
2. Очередь воркеров (BullMQ / Celery) вместо синхронного пайплайна
3. Публикация в CMS и соцсети через официальные API
4. Аналитика охватов и петля улучшения голоса бренда
