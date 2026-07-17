# proectaudit — FP Audit Mobile Web

Проект создан для сотрудников, которые пользуются iPhone и не имеют возможности работать через FP Audit из-за отсутствия официального приложения на iOS.

Это облегченная web-версия Audit с основным рабочим функционалом (задачи, поиск товара, фото-поиск, печать ценников).  
В дальнейшем планируется отдельное приложение для iPhone.

## Состав репозитория

| Папка | Назначение |
|-------|------------|
| [`fpa-mobile-web/`](fpa-mobile-web/) | Основное web-приложение (React + FastAPI proxy) |
| [`apk-ref/`](apk-ref/) | Быстрый справочник по APK/API контрактам |
| [`fixprice-site/`](fixprice-site/) | Модуль загрузки изображений товаров с публичного сайта Fix Price |

Документация публичного каталога Fix Price:  
[open-inflation.github.io/fixprice_api](https://open-inflation.github.io/fixprice_api/_api/fixprice_api.manager.html)

## Локальный запуск

### Frontend (React + Vite)

```bash
cd fpa-mobile-web/client
npm install
npm run dev
```

### Backend (FastAPI)

```bash
cd fpa-mobile-web/server
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## CI/CD (GitHub Actions)

В репозитории добавлен workflow `.github/workflows/ci-cd-deploy.yml`:
- `CI`: на каждый push в `main` — проверка backend (`py_compile`) и сборка frontend (`npm run build`).
- `CD`: **только вручную** (`workflow_dispatch`) и только если в поле confirm ввести `deploy`. Автодеплой на push отключён.

Важно про деплой:
- Синхронизируется только каталог `fpa-mobile-web/` в `DEPLOY_PATH`.
- Флаг `rsync --delete` **не используется** (раньше он мог стереть чужие файлы на сервере, если `DEPLOY_PATH` указывал на общий каталог).
- `DEPLOY_PATH` должен быть отдельной директорией приложения (например `/var/www/proectaudit`), не `/var/www`, не `public_html` и не домашний каталог.

Необходимые GitHub Secrets:
- `SSH_HOST`
- `SSH_USER`
- `SSH_PORT` (опционально, по умолчанию `22`)
- `SSH_KEY` (private key)
- `DEPLOY_PATH` (путь на сервере, например `/var/www/proectaudit`)
- `DEPLOY_RESTART_CMD` (опционально, например `sudo systemctl restart fpa-mobile-web`)
