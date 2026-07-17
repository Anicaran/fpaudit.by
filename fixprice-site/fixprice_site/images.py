"""Резолв и загрузка картинки товара с сайта Fix Price."""

from __future__ import annotations

import os

import httpx

from .client import (
    BROWSER_UA,
    catalog_product_ids,
    cdn_candidates,
    extract_image_urls,
    fetch_product_json,
    probe_image,
)


async def resolve_image_url(*product_ids: str, x_key: str | None = None) -> str | None:
    """
    Найти URL картинки: сначала CDN-шаблоны, затем buyer API каталога.
    product_ids — локальные коды (sku) до 7 цифр.
    """
    ids = catalog_product_ids(*product_ids)
    if not ids:
        return None

    key = x_key if x_key is not None else os.environ.get("FIXPRICE_X_KEY")

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as http:
        for url in cdn_candidates(*ids):
            if await probe_image(http, url):
                return url

        for pid in ids:
            payload = await fetch_product_json(http, pid, x_key=key)
            if not payload:
                continue
            for url in extract_image_urls(payload):
                # buyer отдаёт fit:800 — берём как есть (уже рабочий CDN url)
                if await probe_image(http, url):
                    return url
                # даже если HEAD/GET probe странный — URL из API обычно валиден
                return url
    return None


async def fetch_image_bytes(
    *product_ids: str,
    x_key: str | None = None,
) -> tuple[bytes, str] | None:
    """Скачать байты картинки. Возвращает (bytes, content_type) или None."""
    url = await resolve_image_url(*product_ids, x_key=x_key)
    if not url:
        return None
    async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as http:
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
            return None
        if resp.status_code != 200:
            return None
        ct = resp.headers.get("content-type") or "image/jpeg"
        if not ct.lower().startswith("image/"):
            return None
        return resp.content, ct
