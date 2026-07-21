# КонтентЗавод

Видеоконвейер: **сбор/анализ → сценарий → озвучка → визуал → сборка mp4 → ревью → календарь**.

## Пайплайн ролика

1. **Анализ** — собирает сигналы по нише и формирует редакционный бриф  
2. **Сценарий** — пишет хук, сцены, CTA и тексты под площадки  
3. **Озвучка** — `edge-tts` (ru-RU-DmitryNeural) или ffmpeg-fallback  
4. **Визуал** — вертикальные кадры 1080×1920 (Pillow)  
5. **Сборка** — `ffmpeg` склеивает кадры + голос в `final.mp4`  
6. **Ревью** — human-in-the-loop, календарь, stub-публикация  

## Стек

| Слой | Технология |
|------|------------|
| Frontend | React 19, Vite, React Router |
| Backend | FastAPI |
| Media | Pillow, edge-tts, ffmpeg |
| Storage | JSON + файлы в `server/data/media/` |

## Запуск

Нужны `ffmpeg` / `ffprobe` в системе.

```bash
# backend
cd content-factory/server
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

# frontend
cd content-factory/client
npm install && npm run dev
```

Откройте http://localhost:5174

В кабинете: **Идеи → В производство** — завод сам соберёт ролик и положит его в **Ревью**.

### Опционально

```bash
export OPENROUTER_API_KEY=sk-or-...   # живые идеи
# edge-tts использует сеть Microsoft; без сети включится локальный fallback-голос
```

## API

- `POST /api/jobs` — запуск полного видеопайплайна из идеи  
- `GET /api/jobs/{id}` — пакет с `video.video_url`, кадрами и сценами  
- Медиа: `/media/jobs/{id}/final.mp4`, `voice.mp3`, `frames/*.png`
