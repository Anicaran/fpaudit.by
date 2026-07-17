# Поля DTO (алиасы)

## Task (список)

| Web ждёт | API может отдать |
|----------|------------------|
| `id` | `id` |
| `name`, `description` | то же |
| `status` / `myStatus` | + `taskStatus` |
| `taskType` | `EXPIRATION_DATE_CHECK` и др. |
| `responseList` | **`childTasks`** |
| `childTaskId` | id первого child / response |
| `version` | `version` |
| `deadlineDate`, `overdue`, `executorName` | то же |

## Response (ответ / child)

| Web | API |
|-----|-----|
| `id` | `id` / `responseId` |
| `version` | `version` / `childVersion` |
| `status` / `myStatus` | + `taskStatus` |
| `expirationDateGoods` | то же (массив товаров) |

## Expiration good

| Поле | Примечание |
|------|------------|
| `orderNumber` | обязателен для check |
| `localcode` / `localCode` | до 7 цифр в каталоге |
| `name`, `expirationDate`, `countWriteOff` | |
| `image` | в web подменяем на `/api/goods/image?…` |

## Product search (фото)

| Web | API |
|-----|-----|
| `results[]` | `results` / `items` / `products` |
| `product_id` / `productId` | + `localcode` / `id` |
| `image_url` / `imageUrl` | часто пусто → прокси сайта |
