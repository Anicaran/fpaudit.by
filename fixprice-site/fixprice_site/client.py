"""HTTP к api.fix-price.com/buyer — как в fixprice_api (без Camoufox)."""

from __future__ import annotations

from typing import Any

import httpx

CATALOG_HOSTS = ("fix-price.com",)
# .by часто отвечает 400 на RU sku — оставляем запасным
FALLBACK_HOSTS = ("fix-price.by",)

DEFAULT_CITY_ID = "3"  # Москва
DEFAULT_LANGUAGE = "ru"

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


def catalog_headers(
    host: str = "fix-price.com",
    *,
    city_id: str = DEFAULT_CITY_ID,
    language: str = DEFAULT_LANGUAGE,
    x_key: str | None = None,
) -> dict[str, str]:
    headers = {
        "User-Agent": BROWSER_UA,
        "Accept": "application/json, text/plain, */*",
        "Origin": f"https://{host}",
        "Referer": f"https://{host}/catalog",
        "x-city": str(city_id),
        "x-language": language,
    }
    if x_key:
        headers["X-Key"] = x_key
    return headers


def local_code_digits(raw: str | None) -> str:
    if not raw:
        return ""
    digits = "".join(ch for ch in str(raw) if ch.isdigit())
    if not digits:
        return ""
    stripped = digits.lstrip("0")
    return stripped or "0"


def catalog_product_ids(*raw_ids: str) -> list[str]:
    """Локальный код каталога — до 7 цифр (не EAN)."""
    seen: set[str] = set()
    out: list[str] = []
    for raw in raw_ids:
        pid = local_code_digits(raw)
        if not pid or len(pid) > 7 or pid in seen:
            continue
        seen.add(pid)
        out.append(pid)
    return out


def cdn_candidates(*product_ids: str) -> list[str]:
    urls: list[str] = []
    for product_id in catalog_product_ids(*product_ids):
        base = (
            "https://img.fix-price.com/insecure/rs:fit:400:400/plain/"
            f"pim/images/_default_upload_bucket/{product_id}"
        )
        urls.extend(
            [
                f"{base}.jpg",
                f"{base}_1.jpg",
                f"{base}_2.jpg",
                f"{base}_1080_1.jpg",
                f"{base}_1080_2.jpg",
            ]
        )
    return urls


def extract_image_urls(payload: Any) -> list[str]:
    if not isinstance(payload, dict):
        return []
    out: list[str] = []
    single = payload.get("image")
    if isinstance(single, str) and single.startswith("http"):
        out.append(single)
    elif isinstance(single, dict):
        src = single.get("src")
        if isinstance(src, str) and src.startswith("http"):
            out.append(src)
    images = payload.get("images")
    if isinstance(images, list):
        for img in images:
            if isinstance(img, str) and img.startswith("http"):
                out.append(img)
            elif isinstance(img, dict):
                src = img.get("src")
                if isinstance(src, str) and src.startswith("http"):
                    out.append(src)
    # уникализация с сохранением порядка
    seen: set[str] = set()
    uniq: list[str] = []
    for url in out:
        if url not in seen:
            seen.add(url)
            uniq.append(url)
    return uniq


async def fetch_product_json(
    http: httpx.AsyncClient,
    product_id: str,
    *,
    x_key: str | None = None,
) -> dict[str, Any] | None:
    for host in (*CATALOG_HOSTS, *FALLBACK_HOSTS):
        url = f"https://api.{host}/buyer/v1/product/{product_id}"
        try:
            resp = await http.get(url, headers=catalog_headers(host, x_key=x_key))
        except httpx.HTTPError:
            continue
        if resp.status_code != 200:
            continue
        try:
            data = resp.json()
        except Exception:
            continue
        if isinstance(data, dict) and (data.get("id") is not None or data.get("images") or data.get("image")):
            return data
    return None


async def probe_image(http: httpx.AsyncClient, url: str) -> bool:
    try:
        resp = await http.get(
            url,
            headers={
                "User-Agent": BROWSER_UA,
                "Accept": "image/*,*/*;q=0.8",
                "Referer": "https://fix-price.com/",
            },
        )
    except httpx.HTTPError:
        return False
    if resp.status_code != 200:
        return False
    ct = (resp.headers.get("content-type") or "").lower()
    return ct.startswith("image/")
