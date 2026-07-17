# Куда править (web)

## Клиент `fpa-mobile-web/client/src/`

| Нужно | Файл |
|-------|------|
| Список задач | `components/TasksPanel.tsx` |
| Диалог задачи / «В работу» | `components/TaskDialog.tsx` |
| Сроки годности | `components/ExpirationGoodsCheck.tsx` |
| Пересчёт / неликвиды | `RecountGoodsCheck.tsx`, `UnsoldGoodsCheck.tsx` |
| Сканер / фокус | `hooks/useBarcodeScanner.ts`, `barcodeScan.ts` |
| Поиск по фото | `components/ProductSearchPanel.tsx` |
| Статусы / типы задач | `taskUtils.ts` |
| Типы | `types.ts` |
| Прокси API | `api.ts` |

## Сервер `fpa-mobile-web/server/`

| Нужно | Файл |
|-------|------|
| Все `/api/*` роуты | `main.py` |
| HTTP к audit | `audit_client.py` |
| Картинки с сайта | `../fixprice-site/` + вызов из `main.py` |

## Запуск

- HTTP: `fpa-mobile-web/start.bat` → `:8080`
- HTTPS (камера): `fpa-mobile-web/start-https.bat` → `:8443`
