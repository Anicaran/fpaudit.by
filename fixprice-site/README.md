# fixprice-site — картинки с сайта Fix Price

Отдельный модуль: грузит фото товаров из **публичного каталога**  
`https://api.fix-price.com/buyer` + CDN `img.fix-price.com`,  
а не из Audit (там картинок часто нет).

Референс API: [FixPriceAPI manager](https://open-inflation.github.io/fixprice_api/_api/fixprice_api.manager.html)  
(`CATALOG_URL`, `Catalog`, product `images[].src`).

Полный `fixprice_api` (Camoufox/Playwright) здесь **не нужен** — для картинок достаточно прямого HTTP с браузерными заголовками.

## Использование

```python
from fixprice_site import resolve_image_url, fetch_image_bytes

url = await resolve_image_url("1902248")
data, content_type = await fetch_image_bytes("1902248")
```

CLI:

```bat
cd fixprice-site
..\fpa-mobile-web\server\.venv\Scripts\python.exe examples\fetch_image.py 1902248
```

## Подключение к web

`fpa-mobile-web/server/main.py` импортирует этот пакет для `GET /api/goods/image`.
