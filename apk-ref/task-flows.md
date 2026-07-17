# Типы задач и сценарии

| taskType (API) | APK enum | UI |
|----------------|----------|-----|
| `EXPIRATION_DATE_CHECK` | `CHECK_EXPIRATION_DATE` | Сроки: Продано / Не продано → Отправить |
| `AUTO_RECOUNT` / `MANUAL_RECOUNT` | то же | Пересчёт → SAP |
| `UNSOLD_GOODS` | то же | Неликвиды → SAP |
| `PRINT_PRICE_TAGS` | то же | Импорт в Печать |

Статусы ответа: `OPEN` → start → `IN_PROGRESS` → stop → `CLOSED` / `COMPLETED`.  
Поля: `status` / `myStatus` / `taskStatus` (нормализуем UPPERCASE).

## EXPIRATION_DATE_CHECK

1. Открыть задачу → выбрать response (`id` / `responseId`).
2. `POST …/start` с **version ответа (child)**, не родительской задачи + `startDate`.
   - Если version устарел → proxy сам перечитает executable и повторит (400/409).
   - Query `?taskId=` помогает найти version в `/responses`.
3. Показать `expirationDateGoods` (executable tasks).
4. Пользователь: **Продано** (`countWriteOff=0`) / **Не продано** (`countWriteOff` ≥ 1).
5. `POST …/expiration/{id}/check` через **IRestApi** (не ManualTasksApi), **без gzip**:
   массив `CheckDatesGoodRequest`: `{ orderNumber, localcode, countWriteOff }`  
   - `orderNumber` — **как с сервера**, не 1..N  
   - `localcode` = `"00000000000" + short`  
   - Продано → `countWriteOff: 0`, Не продано → `≥ 1`
6. Заново прочитать **version** ответа (после check он меняется!).
7. `POST …/stop` с `{ version, finishDate }` (gzip) → кнопка UI: **Отправить**.

Код: `TaskDialog.tsx` + `ExpirationGoodsCheck.tsx` + `main.py` expiration routes.
