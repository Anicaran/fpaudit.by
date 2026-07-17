# Картинки товаров

Audit часто **не отдаёт** image — больше половины пустые.

## Цепочка в web

1. UI всегда ходит в `GET /api/goods/image?localcode=…`
2. Сервер резолвит URL через пакет **`fixprice-site`** (сайт Fix Price, не Audit)
3. Проксирует байты картинки клиенту

## Источники (по приоритету)

1. CDN `img.fix-price.com/.../pim/images/_default_upload_bucket/{id}*.jpg`
2. Buyer API `https://api.fix-price.com/buyer/v1/product/{id}` → `images[].src` / `image`
3. (опц.) `.by` host — часто 400 для RU sku

Нужны заголовки как у браузера: `Origin`, `Referer`, `x-city`, `x-language`, desktop UA.  
Библиотека-референс: [fixprice_api.manager](https://open-inflation.github.io/fixprice_api/_api/fixprice_api.manager.html) (`CATALOG_URL = https://api.fix-price.com/buyer`).

Код: `fixprice-site/fixprice_site/` → вызывается из `fpa-mobile-web/server/main.py`.
