# Audit API ↔ web proxy

База upstream: `https://{host}/api/`  
Заголовки как в APK: `x-auth-token`, `X-App-Version` (27.5), `X-Device-Uid`, `X-Device-Platform: android`.  
Тела start/stop — **gzip JSON**.

## Auth

| Web | Upstream |
|-----|----------|
| `POST /api/auth/login` | `POST xauth/authenticate?username&password` |
| `GET /api/auth/account` | `GET xauth/account` |

## Tasks

| Web | Upstream |
|-----|----------|
| `GET /api/tasks` | `GET tasks-manual/all?page&perPage&taskStatus&name` → нормализуем в массив |
| `GET /api/tasks/{id}/responses` | `GET tasks-manual/{id}/responses/` → `{ items }` |
| `POST /api/tasks/responses/{id}/start` | `POST tasks-manual/responses/{id}/start/` body как APK `UpdateTaskRequestDTO`: `{ version, startDate }` (+ comment если не пустой), gzip, `Content-Type: application/json`, дата `yyyy-MM-dd'T'HH:mm:ss'Z'` **без** `.000` |
| `POST /api/tasks/responses/{id}/complete` | `POST …/stop/` body: `{ version, finishDate }` (+ comment) |
| `GET /api/tasks/responses/{id}/executable` | `GET tasks-manual/responses/?responseIds=` (+ fallbacks) |

## Expiration

| Web | Upstream |
|-----|----------|
| `GET /api/tasks/expiration/{id}/goods` | executable → `expirationDateGoods` |
| `POST /api/tasks/expiration/{id}/check` | `POST tasks-manual/expiration/{id}/check` |

## Goods / print / search

| Web | Upstream |
|-----|----------|
| `GET /api/goods/info` | `GET goods/info?sap&codeType&code` |
| `GET /api/goods/image` | **не audit** — CDN + buyer API сайта |
| `POST /api/product-search/by-image` | `POST goods/productSearch/search` |
| `POST /api/print/submit` | `POST goods/priceTags/print` (без gzip) |

## Важно

- Ответ списка задач часто **Spring Page**: `{ content: [...] }` — всегда через `normalize_task_list`.
- У ответа есть `childTasks` → в web кладём в `responseList`.
- `version` обязателен для start/complete (иначе 400/409).
