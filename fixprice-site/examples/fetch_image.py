"""Проверка: python examples/fetch_image.py 1902248"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fixprice_site import fetch_image_bytes, resolve_image_url  # noqa: E402


async def main() -> None:
    pid = sys.argv[1] if len(sys.argv) > 1 else "1902248"
    url = await resolve_image_url(pid)
    print("url:", url)
    data = await fetch_image_bytes(pid)
    if not data:
        print("FAIL: image not found")
        raise SystemExit(1)
    raw, ct = data
    out = Path(__file__).resolve().parent / f"{pid}.jpg"
    out.write_bytes(raw)
    print(f"ok: {ct}, {len(raw)} bytes -> {out}")


if __name__ == "__main__":
    asyncio.run(main())
