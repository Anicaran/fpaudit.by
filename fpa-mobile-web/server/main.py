"""FP Audit — мобильный веб + прокси к audit.fix-price.ru."""

from __future__ import annotations

import base64
import logging
import sys
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlencode

import httpx
from fastapi import FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.responses import Response

from audit_client import (
    DEFAULT_HOST,
    AuditClient,
    normalize_product_search,
    normalize_task_list,
    normalize_task_responses,
    task_update_body,
)

# Картинки с публичного каталога Fix Price (не из Audit)
_FIXPRICE_SITE_ROOT = Path(__file__).resolve().parents[2] / "fixprice-site"
if _FIXPRICE_SITE_ROOT.is_dir() and str(_FIXPRICE_SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(_FIXPRICE_SITE_ROOT))
try:
    from fixprice_site import fetch_image_bytes as _site_fetch_image_bytes
    from fixprice_site import resolve_image_url as _site_resolve_image_url
except ImportError:  # pragma: no cover
    _site_fetch_image_bytes = None  # type: ignore[assignment]
    _site_resolve_image_url = None  # type: ignore[assignment]

log = logging.getLogger("fpa.print")

AI_ASSISTANT_BASE_URL = "https://chatbot.fix-price.ru"
ANALYTICS_PROPERTY_KEY = "mobile.bi.url"
ROLE_INSPECTOR = "ROLE_INSPECTOR"
ROLE_REPORT_MBI = "REPORT_MBI"

WEB_DIR = Path(__file__).resolve().parent.parent / "web"
CLIENT_DIST = Path(__file__).resolve().parent.parent / "client" / "dist"


class NoCacheStaticFiles(StaticFiles):
    """Отдача JS/CSS без долгого кэша — иначе на телефоне остаётся старая вёрстка."""

    async def get_response(self, path: str, scope) -> Response:
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
        return response


def frontend_dir() -> Path:
    """React dist if built, otherwise legacy web/."""
    if (CLIENT_DIST / "index.html").is_file():
        return CLIENT_DIST
    return WEB_DIR


def html_response(path: Path) -> FileResponse:
    return FileResponse(
        path,
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


app = FastAPI(title="FP Audit Mobile Web", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _client(
    authorization: str | None,
    x_audit_host: str | None,
    x_device_uid: str | None,
) -> AuditClient:
    token = None
    if authorization:
        token = authorization.removeprefix("Bearer ").strip()
    host = (x_audit_host or DEFAULT_HOST).strip()
    return AuditClient(host=host, token=token, device_uid=x_device_uid)


class LoginRequest(BaseModel):
    username: str
    password: str
    server_host: str = DEFAULT_HOST


class LoginResponse(BaseModel):
    token: str
    expires: int | None = None
    server_host: str
    device_uid: str


class TaskActionRequest(BaseModel):
    version: int | None = None
    comment: str = ""


class ExpirationCheckItem(BaseModel):
    orderNumber: int
    localcode: str
    countWriteOff: int | None = None


class PrintElement(BaseModel):
    localCodeFrom: str | None = None
    localCodeTo: str | None = None
    productName: str | None = None
    priceTagType: str | None = None
    copyCount: int = 1
    modifiedFrom: str | None = None
    modifiedTo: str | None = None


class RecountSaveItem(BaseModel):
    localcode: str
    name: str = ""
    leftover: float = 0
    inShop: int | None = None
    inStock: int | None = None
    quantity: int = 0


class RecountSaveRequest(BaseModel):
    items: list[RecountSaveItem]


class UnsoldSubmitItem(BaseModel):
    id: int
    recount: int
    comment: str


class UnsoldSubmitRequest(BaseModel):
    sap: str
    items: list[UnsoldSubmitItem]


class PrintJobRequest(BaseModel):
    sap: str
    jobType: str = "PRICE_TAGS"
    inStock: bool = True
    elements: list[PrintElement]


def _account_roles(account: Any) -> list[str]:
    if not isinstance(account, dict):
        return []
    roles = account.get("roles")
    if isinstance(roles, list):
        return [str(r) for r in roles if r]
    if isinstance(roles, str) and roles.strip():
        return [roles.strip()]
    return []


def _has_role(roles: list[str], role: str) -> bool:
    return role in roles


def _is_inspector(roles: list[str]) -> bool:
    return _has_role(roles, ROLE_INSPECTOR)


def _is_report_mbi(roles: list[str]) -> bool:
    return _has_role(roles, ROLE_REPORT_MBI)


def _system_property_value(properties: Any, key: str) -> str:
    if not isinstance(properties, list):
        return ""
    for item in properties:
        if not isinstance(item, dict):
            continue
        prop_key = item.get("propertyKey") or item.get("key") or item.get("name")
        if prop_key == key:
            value = item.get("value")
            return str(value).strip() if value is not None else ""
    return ""


async def _linked_shop_saps(client: AuditClient, account: Any) -> list[str]:
    actor_id: int | None = None
    if isinstance(account, dict) and account.get("id") is not None:
        try:
            actor_id = int(account["id"])
        except (TypeError, ValueError):
            actor_id = None
    if actor_id is None:
        return []
    try:
        shops = await client.shops_linked_to_user(actor_id)
    except Exception:
        return []
    if not isinstance(shops, list):
        return []
    saps: list[str] = []
    for shop in shops:
        if not isinstance(shop, dict):
            continue
        sap = str(shop.get("sap") or shop.get("sapCode") or "").strip()
        if sap and sap not in saps:
            saps.append(sap)
    return saps


def _build_ai_assistant_url(account: Any, pfms: list[str]) -> str:
    roles = _account_roles(account)
    role = ",".join(roles) if roles else "USER"
    is_franchise = bool(isinstance(account, dict) and account.get("isFranchise"))
    country = ""
    if isinstance(account, dict):
        country = str(account.get("country") or account.get("countryCode") or "").strip()
    if not country:
        country = "RU"
    query = urlencode(
        {
            "role": role,
            "is_franchise": str(is_franchise).lower(),
            "country": country,
            "pfm": ",".join(pfms),
        },
        quote_via=quote,
    )
    return f"{AI_ASSISTANT_BASE_URL}?{query}"


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/login", response_model=LoginResponse)
async def login(body: LoginRequest) -> LoginResponse:
    client = AuditClient(host=body.server_host)
    try:
        data = await client.authenticate(body.username.strip(), body.password)
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, str(e)) from e
    except Exception as e:
        raise HTTPException(401, str(e)) from e
    finally:
        await client.aclose()
    expires = data.get("expires") if isinstance(data, dict) else None
    return LoginResponse(
        token=client.token or "",
        expires=int(expires) if expires is not None else None,
        server_host=client.host,
        device_uid=client.device_uid,
    )


@app.post("/api/product-search/by-image")
async def product_search_by_image(
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
    file: UploadFile = File(...),
    limit: int = Query(40, ge=1, le=100),
) -> Any:
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    content = await file.read()
    if not content:
        raise HTTPException(400, "Файл пустой")
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(400, "Файл слишком большой (макс. 15 МБ)")
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        raw = await client.product_search_by_image(
            content,
            filename=file.filename or "photo.jpg",
            content_type=file.content_type or "image/jpeg",
            limit=limit,
        )
        return _attach_site_image_proxies(normalize_product_search(raw))
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text[:400]) from e
    finally:
        await client.aclose()


@app.get("/api/product-search/barcodes/{localcode}")
async def product_search_barcodes(
    localcode: str,
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
) -> list[str]:
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        return await client.barcodes_by_localcode(localcode)
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text[:400]) from e
    finally:
        await client.aclose()


@app.get("/api/features/ai-assistant")
async def ai_assistant_feature(
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
) -> dict[str, Any]:
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        account = await client.get_account()
        roles = _account_roles(account)
        pfms = await _linked_shop_saps(client, account)
        has_access = bool(isinstance(account, dict) and account.get("hasAccessToAiAssistant"))
        if _is_inspector(roles):
            return {
                "available": False,
                "url": None,
                "reason": "AI Assistant недоступен для роли инспектора",
            }
        if not has_access:
            return {
                "available": False,
                "url": None,
                "reason": "AI Assistant не включён для вашего аккаунта",
            }
        return {
            "available": True,
            "url": _build_ai_assistant_url(account, pfms),
            "reason": None,
        }
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text[:400]) from e
    finally:
        await client.aclose()


@app.get("/api/features/analytics")
async def analytics_feature(
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
) -> dict[str, Any]:
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        account = await client.get_account()
        roles = _account_roles(account)
        if not _is_report_mbi(roles):
            return {
                "available": False,
                "url": None,
                "reason": "Аналитика доступна только роли REPORT_MBI",
            }
        props = await client.get_system_properties()
        analytics_url = _system_property_value(props, ANALYTICS_PROPERTY_KEY)
        if not analytics_url:
            return {
                "available": False,
                "url": None,
                "reason": "URL аналитики не настроен на сервере (mobile.bi.url)",
            }
        return {"available": True, "url": analytics_url, "reason": None}
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text[:400]) from e
    finally:
        await client.aclose()


@app.get("/api/auth/account")
async def account(
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
) -> Any:
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        return await client.get_account()
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text[:400]) from e
    finally:
        await client.aclose()


@app.get("/api/tasks")
async def tasks(
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
    page: int = Query(0, ge=0),
    per_page: int = Query(30, ge=1, le=100),
    status: str | None = Query(None, description="OPEN, IN_PROGRESS, CLOSED — через запятую"),
    name: str | None = None,
) -> Any:
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    statuses = [s.strip() for s in status.split(",") if s.strip()] if status else ["OPEN", "IN_PROGRESS"]
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        raw = await client.list_tasks(page=page, per_page=per_page, task_status=statuses, name=name)
        return normalize_task_list(raw)
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text[:400]) from e
    finally:
        await client.aclose()


@app.get("/api/tasks/{task_id}/responses")
async def task_responses(
    task_id: int,
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
    page: int = 0,
    size: int = 50,
) -> Any:
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        raw = await client.get_task_responses(task_id, page=page, size=size)
        return normalize_task_responses(raw)
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text[:400]) from e
    finally:
        await client.aclose()


@app.get("/api/shops")
async def shops(
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
    actor_id: int | None = Query(None, alias="actorId"),
) -> Any:
    """Магазины, привязанные к пользователю (как в FP Audit после входа)."""
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        uid = actor_id
        if uid is None:
            acc = await client.get_account()
            if isinstance(acc, dict) and acc.get("id") is not None:
                uid = int(acc["id"])
        if uid is None:
            raise HTTPException(400, "Не удалось определить id пользователя")
        return await client.shops_linked_to_user(uid)
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text[:400]) from e
    finally:
        await client.aclose()


class ShopSelectRequest(BaseModel):
    shop_id: int


@app.post("/api/shops/select")
async def select_shop(
    body: ShopSelectRequest,
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
) -> dict[str, str]:
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        await client.assign_shop(body.shop_id)
        return {"status": "ok"}
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text[:400]) from e
    finally:
        await client.aclose()


def _extract_response_version(obj: Any) -> int | None:
    """Достать version ответа (не родительской задачи)."""
    if not isinstance(obj, dict):
        return None
    for key in ("version", "childVersion", "responseVersion"):
        val = obj.get(key)
        if val is None or isinstance(val, bool):
            continue
        try:
            return int(val)
        except (TypeError, ValueError):
            continue
    child = obj.get("childTask")
    if isinstance(child, dict):
        return _extract_response_version(child)
    return None


async def _resolve_response_version(
    client: AuditClient,
    response_id: int,
    task_id: int | None = None,
) -> int | None:
    task, _ = await _fetch_executable_task(client, response_id, task_id)
    version = _extract_response_version(task)
    if version is not None:
        return version
    if task_id is None:
        return None
    try:
        raw = await client.get_task_responses(task_id)
    except httpx.HTTPStatusError:
        return None
    for item in normalize_task_responses(raw).get("items") or []:
        if not isinstance(item, dict):
            continue
        rid = item.get("id") if item.get("id") is not None else item.get("responseId")
        try:
            if rid is None or int(rid) != int(response_id):
                continue
        except (TypeError, ValueError):
            continue
        return _extract_response_version(item)
    return None


@app.post("/api/tasks/responses/{response_id}/start")
async def start_response(
    response_id: int,
    body: TaskActionRequest,
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
    task_id: int | None = Query(None, alias="taskId"),
) -> Any:
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        version = body.version
        if version is None:
            version = await _resolve_response_version(client, response_id, task_id)
        if version is None:
            raise HTTPException(
                400,
                "Не найден version ответа задачи. Обновите список и откройте задачу снова.",
            )
        payload = task_update_body(version, body.comment, finish=False)
        log.info("start responseId=%s taskId=%s payload=%s", response_id, task_id, payload)
        try:
            return await client.start_task_response(response_id, payload)
        except httpx.HTTPStatusError as e:
            # Устаревший version → один повтор с актуальным
            if e.response.status_code in (400, 409):
                fresh = await _resolve_response_version(client, response_id, task_id)
                log.warning(
                    "start retry responseId=%s status=%s oldVersion=%s freshVersion=%s body=%s",
                    response_id,
                    e.response.status_code,
                    version,
                    fresh,
                    (e.response.text or "")[:300],
                )
                if fresh is not None and fresh != version:
                    payload = task_update_body(fresh, body.comment, finish=False)
                    try:
                        return await client.start_task_response(response_id, payload)
                    except httpx.HTTPStatusError as e2:
                        e = e2
            detail = str(e)
            if e.response is not None and (e.response.text or "").strip():
                detail = e.response.text.strip()[:400]
            raise HTTPException(e.response.status_code if e.response else 400, detail) from e
    finally:
        await client.aclose()


@app.post("/api/tasks/responses/{response_id}/complete")
async def complete_response(
    response_id: int,
    body: TaskActionRequest,
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
    task_id: int | None = Query(None, alias="taskId"),
) -> Any:
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        version = body.version
        if version is None:
            version = await _resolve_response_version(client, response_id, task_id)
        if version is None:
            raise HTTPException(
                400,
                "Не найден version ответа задачи. Обновите список и откройте задачу снова.",
            )
        payload = task_update_body(version, body.comment, finish=True)
        try:
            return await client.close_task_response(response_id, payload)
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (400, 409):
                fresh = await _resolve_response_version(client, response_id, task_id)
                if fresh is not None and fresh != version:
                    payload = task_update_body(fresh, body.comment, finish=True)
                    try:
                        return await client.close_task_response(response_id, payload)
                    except httpx.HTTPStatusError as e2:
                        e = e2
            detail = (e.response.text or str(e))[:400] or f"HTTP {e.response.status_code}"
            raise HTTPException(e.response.status_code, detail) from e
    finally:
        await client.aclose()


def _normalize_goods_code_type(code_type: str) -> str:
    """APK отправляет LOCAL / BARCODE, не localcode."""
    key = (code_type or "").strip().lower()
    if key in ("local", "localcode", "loc"):
        return "LOCAL"
    if key in ("barcode", "bar", "bc"):
        return "BARCODE"
    return code_type.strip().upper() or "LOCAL"


def _pad_local_code(code: str) -> str:
    """11 ведущих нулей + до 7 цифр — как addLeadingZeroForLocalCode в APK."""
    short = (code.strip().lstrip("0") or "0")[:7]
    return f"00000000000{short}"


def _normalize_goods_info(data: Any) -> Any:
    if not isinstance(data, dict):
        return data
    out = dict(data)
    lc = out.get("localcode") or out.get("localCode")
    if lc is not None:
        out["localcode"] = lc
        out["localCode"] = lc
    return out


def _local_code_digits(code: str) -> str:
    digits = "".join(ch for ch in str(code) if ch.isdigit())
    return digits.lstrip("0") or digits


def _normalize_print_local_code(value: str | None) -> str:
    """Короткий локальный код (до 7 цифр) для печати."""
    if not value:
        return ""
    return _local_code_digits(str(value))[:7]


def _print_elements_payload(elements: list["PrintElement"], *, use_padded_local_code: bool) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for el in elements:
        base_from = _normalize_print_local_code(el.localCodeFrom or el.localCodeTo)
        base_to = _normalize_print_local_code(el.localCodeTo or el.localCodeFrom)
        code_from = _pad_local_code(base_from) if use_padded_local_code and base_from else base_from
        code_to = _pad_local_code(base_to) if use_padded_local_code and base_to else base_to
        item: dict[str, Any] = {
            "localCodeFrom": code_from,
            "copyCount": int(el.copyCount or 1),
        }
        if code_to and code_to != code_from:
            item["localCodeTo"] = code_to
        if el.productName and str(el.productName).strip():
            item["productName"] = str(el.productName).strip()
        if el.priceTagType and str(el.priceTagType).strip():
            item["priceTagType"] = str(el.priceTagType).strip()
        if el.modifiedFrom and str(el.modifiedFrom).strip():
            item["modifiedFrom"] = str(el.modifiedFrom).strip()
        if el.modifiedTo and str(el.modifiedTo).strip():
            item["modifiedTo"] = str(el.modifiedTo).strip()
        out.append(item)
    return out


def _clean_print_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "sap": str(payload.get("sap") or "").strip(),
        "jobType": payload.get("jobType") or "PRICE_TAGS",
        "inStock": bool(payload.get("inStock", True)),
        "elements": payload.get("elements") or [],
    }


def _catalog_product_ids(*raw_ids: str) -> list[str]:
    """Локальный код каталога Fix Price — до 7 цифр (не штрих-код EAN)."""
    seen: set[str] = set()
    out: list[str] = []
    for raw in raw_ids:
        pid = _local_code_digits(str(raw))
        if not pid or len(pid) > 7 or pid in seen:
            continue
        seen.add(pid)
        out.append(pid)
    return out


def _extract_local_code_from_goods(data: dict[str, Any]) -> str:
    for key in ("localcode", "localCode", "local_code"):
        val = data.get(key)
        if val is not None and str(val).strip():
            pid = _local_code_digits(str(val))
            if pid and len(pid) <= 7:
                return pid
    return ""


def _goods_image_proxy_path(*, localcode: str | None = None, barcode: str | None = None) -> str | None:
    query: dict[str, str] = {}
    lc = _local_code_digits(localcode or "")[:7]
    if lc:
        query["localcode"] = lc
    bc = (barcode or "").strip()
    if bc:
        query["barcode"] = bc
    if not query:
        return None
    return f"/api/goods/image?{urlencode(query)}"


def _attach_site_image_proxies(data: Any) -> Any:
    """Если Audit не дал image_url — подставить прокси сайта Fix Price."""
    if not isinstance(data, dict):
        return data
    results = data.get("results")
    if not isinstance(results, list):
        return data
    for item in results:
        if not isinstance(item, dict):
            continue
        if item.get("image_url") or item.get("imageUrl"):
            continue
        pid = item.get("product_id") if item.get("product_id") is not None else item.get("productId")
        if pid is None:
            continue
        proxy = _goods_image_proxy_path(localcode=str(pid))
        if proxy:
            item["image_url"] = proxy
            item["imageUrl"] = proxy
    return data


async def _find_product_image(*product_ids: str) -> str | None:
    """Картинка с сайта Fix Price (модуль fixprice-site), не из Audit."""
    catalog_ids = _catalog_product_ids(*product_ids)
    if not catalog_ids:
        return None
    if _site_resolve_image_url is None:
        return None
    return await _site_resolve_image_url(*catalog_ids)


async def _enrich_goods_info(
    data: Any,
    *,
    local_code: str,
    client: AuditClient | None = None,
    searched_barcode: str | None = None,
    searched_by_local: bool = False,
) -> Any:
    normalized = _normalize_goods_info(data)
    if not isinstance(normalized, dict):
        return normalized

    lc_short = _extract_local_code_from_goods(normalized)
    if not lc_short and client and searched_barcode:
        try:
            lc_from_bc = await client.localcode_by_barcode(searched_barcode.strip())
            lc_short = _local_code_digits(lc_from_bc)
        except httpx.HTTPError:
            pass
    if not lc_short and searched_by_local and local_code.strip():
        lc_short = _local_code_digits(local_code)

    lc_padded = _pad_local_code(lc_short) if lc_short else ""
    if lc_padded:
        normalized["localcode"] = lc_padded
        normalized["localCode"] = lc_padded

    barcodes: list[str] = []
    if searched_barcode:
        barcodes = [searched_barcode.strip()]
    elif client and lc_padded:
        try:
            barcodes = await client.barcodes_by_localcode(lc_padded)
        except httpx.HTTPError:
            pass
    if barcodes:
        normalized["barcodes"] = barcodes
        normalized["barcode"] = barcodes[0]

    proxy = _goods_image_proxy_path(
        localcode=lc_short,
        barcode=barcodes[0] if barcodes else searched_barcode,
    )
    if proxy:
        normalized["image"] = proxy
    return normalized


@app.get("/api/goods/info")
async def goods_info(
    sap: str,
    code: str,
    code_type: str = Query("LOCAL", alias="codeType"),
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
) -> Any:
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        code_type_norm = _normalize_goods_code_type(code_type)
        code_for_api = _pad_local_code(code) if code_type_norm == "LOCAL" else code.strip()
        data = await client.goods_info(sap, code_type_norm, code_for_api)
        searched_bc = code.strip() if code_type_norm == "BARCODE" else None
        return await _enrich_goods_info(
            data,
            local_code=code.strip(),
            client=client,
            searched_barcode=searched_bc,
            searched_by_local=code_type_norm == "LOCAL",
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text[:400]) from e
    finally:
        await client.aclose()


@app.get("/api/goods/barcode/{barcode}/localcode")
async def barcode_localcode(
    barcode: str,
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
) -> dict[str, str]:
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        lc = await client.localcode_by_barcode(barcode)
        return {"localcode": lc}
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text[:400]) from e
    finally:
        await client.aclose()


@app.get("/api/goods/localcode/{localcode}/barcodes")
async def localcode_barcodes(
    localcode: str,
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
) -> list[str]:
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        lc = _pad_local_code(localcode)
        return await client.barcodes_by_localcode(lc)
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text[:400]) from e
    finally:
        await client.aclose()


@app.get("/api/goods/image")
async def goods_image_proxy(
    localcode: str | None = Query(None),
    barcode: str | None = Query(None),
) -> Any:
    """Прокси картинки с сайта Fix Price (CDN + buyer API), не из Audit."""
    lc_short = _local_code_digits(localcode or "")[:7]
    lookup_ids: list[str] = []
    if lc_short:
        lookup_ids.append(lc_short)
    if not lookup_ids:
        raise HTTPException(400, "Укажите localcode")
    if _site_fetch_image_bytes is None:
        raise HTTPException(503, "Модуль fixprice-site не найден")
    packed = await _site_fetch_image_bytes(*lookup_ids)
    if not packed:
        raise HTTPException(404, "Изображение не найдено на сайте Fix Price")
    content, media_type = packed
    return Response(
        content=content,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


def _pick_executable_task(payload: Any, response_id: int) -> dict[str, Any] | None:
    if isinstance(payload, dict):
        has_list = any(k in payload for k in ("content", "items", "childTasks", "responses"))
        if not has_list and (
            payload.get("id") == response_id
            or payload.get("responseId") == response_id
            or payload.get("expirationDateGoods") is not None
        ):
            return payload
    tasks = payload if isinstance(payload, list) else []
    if isinstance(payload, dict) and not tasks:
        tasks = payload.get("content") or payload.get("items") or payload.get("childTasks") or payload.get("responses") or []
    if not isinstance(tasks, list):
        tasks = []
    task = next(
        (
            t
            for t in tasks
            if isinstance(t, dict)
            and (t.get("id") == response_id or t.get("responseId") == response_id)
        ),
        None,
    )
    if not task:
        task = next((t for t in tasks if isinstance(t, dict)), None)
    return task if isinstance(task, dict) else None


def _expiration_goods_from_payload(payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not payload:
        return []
    raw = payload.get("expirationDateGoods")
    if raw is None and isinstance(payload.get("childTask"), dict):
        child = payload["childTask"]
        raw = (
            child.get("expirationDateGoods")
            or child.get("expirationGoods")
            or child.get("goods")
        )
    if raw is None:
        raw = (
            payload.get("expirationGoods")
            or payload.get("goods")
            or payload.get("checkDatesGoods")
        )
    if not isinstance(raw, list):
        return []
    items: list[dict[str, Any]] = []
    for idx, g in enumerate(raw):
        if not isinstance(g, dict):
            continue
        lc = g.get("localcode") or g.get("localCode") or g.get("local_code") or ""
        name = g.get("name") or g.get("productName") or g.get("title") or ""
        # Сохраняем orderNumber как в Audit (APK шлёт его без перенумерации)
        try:
            order_number = int(g["orderNumber"]) if g.get("orderNumber") is not None else idx + 1
        except (TypeError, ValueError):
            order_number = idx + 1
        items.append(
            {
                "orderNumber": order_number,
                "localcode": str(lc) if lc != "" else "",
                "name": name,
                "expirationDate": g.get("expirationDate") or g.get("expiryDate"),
                "orderDate": g.get("orderDate"),
                "countWriteOff": g.get("countWriteOff"),
                "image": _goods_image_proxy_path(localcode=str(lc)) if lc else None,
            }
        )
    return items


async def _fetch_expiration_goods(
    client: AuditClient,
    response_id: int,
    task_id: int | None,
) -> tuple[list[dict[str, Any]], str]:
    """Загрузить товары со сроками: как getExecutableTasks + fallback в APK."""
    raw = await client.get_executable_tasks([response_id])
    task = _pick_executable_task(raw, response_id)
    goods = _expiration_goods_from_payload(task)
    if goods:
        return goods, "executable_tasks"

    try:
        single = await client.get_executable_task(response_id)
        if isinstance(single, dict):
            goods = _expiration_goods_from_payload(single)
            if goods:
                return goods, "executable_task"
    except httpx.HTTPStatusError:
        pass

    if task_id:
        try:
            resp_raw = await client.get_task_responses(task_id)
            normalized = normalize_task_responses(resp_raw)
            for item in normalized.get("items") or []:
                if not isinstance(item, dict):
                    continue
                rid = item.get("id") if item.get("id") is not None else item.get("responseId")
                if rid is not None and int(rid) != response_id:
                    continue
                goods = _expiration_goods_from_payload(item)
                if goods:
                    return goods, "task_responses"
        except httpx.HTTPStatusError:
            pass

    return [], "none"


async def _fetch_executable_task(
    client: AuditClient,
    response_id: int,
    task_id: int | None,
) -> tuple[dict[str, Any] | None, str]:
    raw = await client.get_executable_tasks([response_id])
    task = _pick_executable_task(raw, response_id)
    if task:
        return task, "executable_tasks"
    try:
        single = await client.get_executable_task(response_id)
        if isinstance(single, dict):
            return single, "executable_task"
    except httpx.HTTPStatusError:
        pass
    if task_id:
        try:
            resp_raw = await client.get_task_responses(task_id)
            normalized = normalize_task_responses(resp_raw)
            for item in normalized.get("items") or []:
                if not isinstance(item, dict):
                    continue
                rid = item.get("id") if item.get("id") is not None else item.get("responseId")
                if rid is not None and int(rid) != response_id:
                    continue
                return item, "task_responses"
        except httpx.HTTPStatusError:
            pass
    return None, "none"


def _recount_goods_from_payload(payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not payload:
        return []
    raw = payload.get("goods")
    if raw is None and isinstance(payload.get("childTask"), dict):
        raw = payload["childTask"].get("goods")
    if not isinstance(raw, list):
        return []
    items: list[dict[str, Any]] = []
    for g in raw:
        if not isinstance(g, dict):
            continue
        lc = g.get("localcode") or g.get("localCode") or ""
        items.append(
            {
                "localcode": str(lc),
                "name": g.get("name") or "",
                "leftover": g.get("leftover"),
                "inShop": g.get("inShop"),
                "inStock": g.get("inStock"),
                "quantity": g.get("quantity") if g.get("quantity") is not None else 0,
                "image": _goods_image_proxy_path(localcode=str(lc)) if lc else None,
            }
        )
    return items


def _price_tags_from_payload(payload: dict[str, Any] | None) -> dict[str, Any]:
    if not payload:
        return {"sap": None, "inStock": True, "elements": []}
    price_tags = payload.get("priceTags")
    if price_tags is None and isinstance(payload.get("childTask"), dict):
        price_tags = payload["childTask"].get("priceTags")
    if not isinstance(price_tags, dict):
        return {"sap": None, "inStock": True, "elements": []}
    raw_elements = price_tags.get("elements") or []
    elements: list[dict[str, Any]] = []
    if isinstance(raw_elements, list):
        for el in raw_elements:
            if not isinstance(el, dict):
                continue
            lc_from = el.get("localCodeFrom") or el.get("localCode") or el.get("localcode") or ""
            lc_to = el.get("localCodeTo") or lc_from
            elements.append(
                {
                    "localCodeFrom": str(lc_from),
                    "localCodeTo": str(lc_to),
                    "productName": el.get("productName") or el.get("name") or "",
                    "priceTagType": el.get("priceTagType") or el.get("priceTag") or "",
                    "copyCount": int(el.get("copyCount") or 1),
                }
            )
    return {
        "sap": price_tags.get("sap"),
        "inStock": bool(price_tags.get("inStock", True)),
        "elements": elements,
    }


def _unsold_goods_from_payload(payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not payload:
        return []
    raw = payload.get("unsoldGoods")
    if raw is None and isinstance(payload.get("childTask"), dict):
        raw = payload["childTask"].get("unsoldGoods")
    if not isinstance(raw, list):
        return []
    items: list[dict[str, Any]] = []
    for g in raw:
        if not isinstance(g, dict):
            continue
        lc = g.get("localcode") or g.get("localCode") or ""
        items.append(
            {
                "id": g.get("id"),
                "localcode": str(lc),
                "name": g.get("name") or "",
                "daysWithoutSales": g.get("daysWithoutSales"),
                "quantity": g.get("quantity"),
                "lastDeliveryDate": g.get("lastDeliveryDate"),
                "recount": g.get("recount"),
                "comment": g.get("comment"),
                "image": _goods_image_proxy_path(localcode=str(lc)) if lc else None,
            }
        )
    return items


@app.get("/api/tasks/responses/{response_id}/executable")
async def executable_task(
    response_id: int,
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
    task_id: int | None = Query(None, alias="taskId"),
) -> Any:
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        task, source = await _fetch_executable_task(client, response_id, task_id)
        return {"task": task, "source": source}
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text[:400]) from e
    finally:
        await client.aclose()


@app.get("/api/tasks/recount/{response_id}/goods")
async def recount_task_goods(
    response_id: int,
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
    task_id: int | None = Query(None, alias="taskId"),
) -> Any:
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        task, source = await _fetch_executable_task(client, response_id, task_id)
        return {"items": _recount_goods_from_payload(task), "source": source}
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text[:400]) from e
    finally:
        await client.aclose()


@app.post("/api/tasks/recount/{response_id}/save")
async def recount_task_save(
    response_id: int,
    body: RecountSaveRequest,
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
) -> Any:
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    if not body.items:
        raise HTTPException(400, "Список товаров пуст")
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        account = await client.get_account()
        author_id: int | None = None
        if isinstance(account, dict) and account.get("id") is not None:
            author_id = int(account["id"])
        payload: list[dict[str, Any]] = []
        for item in body.items:
            in_shop = item.inShop if item.inShop is not None else 0
            in_stock = item.inStock if item.inStock is not None else 0
            leftover = float(item.leftover or 0)
            write_off = max(0, int(round(leftover - in_shop - in_stock)))
            lc = _pad_local_code(_normalize_print_local_code(item.localcode)) or item.localcode.strip()
            row: dict[str, Any] = {
                "responseId": response_id,
                "name": item.name.strip(),
                "localcode": lc,
                "leftover": leftover,
                "inShop": in_shop,
                "inStock": in_stock,
                "quantity": item.quantity,
                "quantityWriteOff": write_off,
            }
            if author_id is not None:
                row["authorId"] = author_id
            payload.append(row)
        return await client.send_recount_goods(payload)
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text[:400]) from e
    finally:
        await client.aclose()


@app.get("/api/tasks/print-task/{response_id}/items")
async def print_task_items(
    response_id: int,
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
    task_id: int | None = Query(None, alias="taskId"),
) -> Any:
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        task, source = await _fetch_executable_task(client, response_id, task_id)
        data = _price_tags_from_payload(task)
        return {**data, "source": source}
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text[:400]) from e
    finally:
        await client.aclose()


@app.get("/api/tasks/unsold/reasons")
async def unsold_reasons(
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
) -> Any:
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        raw = await client.get_unsold_reasons()
        if isinstance(raw, list):
            reasons = []
            for row in raw:
                if isinstance(row, dict):
                    reason = row.get("reason") or row.get("name")
                    if reason:
                        reasons.append(str(reason))
                elif row:
                    reasons.append(str(row))
            return {"reasons": reasons}
        return {"reasons": []}
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text[:400]) from e
    finally:
        await client.aclose()


@app.get("/api/tasks/unsold/{response_id}/goods")
async def unsold_task_goods(
    response_id: int,
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
    task_id: int | None = Query(None, alias="taskId"),
) -> Any:
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        task, source = await _fetch_executable_task(client, response_id, task_id)
        return {"items": _unsold_goods_from_payload(task), "source": source}
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text[:400]) from e
    finally:
        await client.aclose()


@app.post("/api/tasks/unsold/submit")
async def unsold_task_submit(
    body: UnsoldSubmitRequest,
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
) -> Any:
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    if not body.items:
        raise HTTPException(400, "Список товаров пуст")
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        from datetime import date

        payload = {
            "sap": body.sap.strip(),
            "date": date.today().isoformat(),
            "unsoldGoods": [
                {
                    "id": item.id,
                    "recount": item.recount,
                    "comment": item.comment.strip(),
                    "attachment": None,
                    "quantityWriteOff": None,
                }
                for item in body.items
            ],
        }
        return await client.submit_unsold_goods(payload)
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text[:400]) from e
    finally:
        await client.aclose()


@app.get("/api/tasks/expiration/{response_id}/goods")
async def expiration_task_goods(
    response_id: int,
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
    task_id: int | None = Query(None, alias="taskId"),
) -> Any:
    """Товары для задачи «Проверка сроков годности» (как getExecutableTasks в APK)."""
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        items, source = await _fetch_expiration_goods(client, response_id, task_id)
        return {"items": items, "source": source}
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text[:400]) from e
    finally:
        await client.aclose()


@app.post("/api/tasks/expiration/{response_id}/check")
async def expiration_task_check(
    response_id: int,
    body: list[ExpirationCheckItem],
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
) -> Any:
    """Как APK CheckDatesRepository.sendGoods → POST tasks-manual/expiration/{id}/check."""
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    if not body:
        raise HTTPException(400, "Пустой список товаров для проверки")
    client = _client(authorization, x_audit_host, x_device_uid)
    # Как APK CheckDatesGoodRequest: orderNumber с сервера (НЕ перенумеровывать!),
    # localcode = "00000000000" + short, countWriteOff: 0=продано
    payload: list[dict[str, Any]] = []
    for idx, item in enumerate(body):
        lc = _pad_local_code(item.localcode)
        if not lc:
            raise HTTPException(400, f"Некорректная позиция #{idx + 1}: пустой localcode")
        try:
            order_number = int(item.orderNumber)
        except (TypeError, ValueError) as exc:
            raise HTTPException(400, f"Некорректный orderNumber у позиции #{idx + 1}") from exc
        write_off = 0 if item.countWriteOff is None else int(item.countWriteOff)
        payload.append(
            {
                "orderNumber": order_number,
                "localcode": lc,
                "countWriteOff": write_off,
            }
        )
    log.info(
        "expiration check responseId=%s items=%s sample=%s",
        response_id,
        len(payload),
        payload[:2],
    )
    try:
        return await client.submit_expiration_check(response_id, payload)
    except httpx.HTTPStatusError as e:
        detail = (e.response.text or "").strip()[:400]
        if not detail:
            detail = (
                f"Audit отклонил проверку сроков (HTTP {e.response.status_code}). "
                "Проверьте, что задача в работе и товары отмечены."
            )
        raise HTTPException(e.response.status_code, detail) from e
    finally:
        await client.aclose()


@app.get("/api/print/types")
async def print_types(
    sap: str,
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
) -> Any:
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        return await client.price_tag_types(sap)
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text[:400]) from e
    finally:
        await client.aclose()


@app.get("/api/print/jobs")
async def print_jobs(
    sap: str,
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
    page: int = 0,
    size: int = 20,
) -> Any:
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        return await client.list_print_jobs(sap, page=page, size=size)
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text[:400]) from e
    finally:
        await client.aclose()


@app.get("/api/print/jobs/{job_id}")
async def print_job_detail(
    job_id: int,
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
    sap: str | None = Query(None),
) -> Any:
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        return await client.get_print_job(job_id, sap=sap)
    except httpx.HTTPStatusError as e:
        body = (e.response.text or "")[:400]
        raise HTTPException(e.response.status_code, body or e.response.reason_phrase) from e
    finally:
        await client.aclose()


def _audit_error_message(resp: httpx.Response) -> str:
    err_header = resp.headers.get("x-error-text") or resp.headers.get("X-Error-Text")
    if err_header:
        try:
            decoded = base64.b64decode(err_header).decode("utf-8").strip()
            if decoded:
                return decoded
        except Exception:
            pass

    text = (resp.text or "").strip()
    if not text:
        return f"Ошибка FP Audit (HTTP {resp.status_code})"
    try:
        data = resp.json()
    except Exception:
        return text[:800]
    if not isinstance(data, dict):
        return text[:800]
    for key in ("message", "error", "detail", "title", "description"):
        val = data.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
        if isinstance(val, list):
            parts: list[str] = []
            for item in val:
                if isinstance(item, str):
                    parts.append(item)
                elif isinstance(item, dict):
                    msg = item.get("message") or item.get("msg") or item.get("detail")
                    if msg:
                        parts.append(str(msg))
            if parts:
                return "; ".join(parts)
    return text[:800]


def _validate_print_request(body: "PrintJobRequest") -> None:
    if not (body.sap or "").strip():
        raise HTTPException(400, "Не указан SAP магазина (раздел «Профиль»)")
    if not body.elements:
        raise HTTPException(400, "Добавьте хотя бы одну позицию в задание")
    for idx, el in enumerate(body.elements, start=1):
        lc = _normalize_print_local_code(el.localCodeFrom or el.localCodeTo)
        if not lc:
            raise HTTPException(400, f"Позиция {idx}: не указан локальный код товара")
        tag_type = (el.priceTagType or "").strip()
        if not tag_type or tag_type.upper() == "STANDARD":
            raise HTTPException(
                400,
                f"Позиция {idx}: не выбран тип ценника (65X57 / 65X57_CARD)",
            )


async def _submit_print_job(client: AuditClient, body: PrintJobRequest) -> Any:
    """Отправка задания на печать: как IRestApi в APK (JSON без gzip)."""
    last_error: httpx.HTTPStatusError | None = None
    for use_padded in (True, False):
        payload = _clean_print_payload(body.model_dump())
        payload["elements"] = _print_elements_payload(body.elements, use_padded_local_code=use_padded)
        log.info(
            "print submit sap=%s items=%s padded=%s sample=%s",
            payload.get("sap"),
            len(payload.get("elements") or []),
            use_padded,
            (payload.get("elements") or [None])[0],
        )
        try:
            return await client.create_print_job(payload)
        except httpx.HTTPStatusError as exc:
            last_error = exc
            log.warning(
                "print submit failed padded=%s status=%s body=%s header=%s",
                use_padded,
                exc.response.status_code,
                (exc.response.text or "")[:300],
                exc.response.headers.get("x-error-text"),
            )
    assert last_error is not None
    raise last_error


@app.post("/api/print/submit")
async def print_submit(
    body: PrintJobRequest,
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
) -> Any:
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    _validate_print_request(body)
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        return await _submit_print_job(client, body)
    except httpx.HTTPStatusError as e:
        detail = _audit_error_message(e.response)
        raise HTTPException(e.response.status_code, detail) from e
    except Exception as e:
        log.exception("print_submit unexpected error")
        raise HTTPException(500, f"Ошибка отправки на печать: {e}") from e
    finally:
        await client.aclose()


@app.post("/api/print/preview")
async def print_preview(
    body: PrintJobRequest,
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
) -> Any:
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    _validate_print_request(body)
    client = _client(authorization, x_audit_host, x_device_uid)
    last_error: httpx.HTTPStatusError | None = None
    try:
        for use_padded in (True, False):
            payload = _clean_print_payload(body.model_dump())
            payload["elements"] = _print_elements_payload(body.elements, use_padded_local_code=use_padded)
            try:
                return await client.print_preview(payload)
            except httpx.HTTPStatusError as exc:
                last_error = exc
        assert last_error is not None
        raise last_error
    except httpx.HTTPStatusError as e:
        detail = _audit_error_message(e.response)
        raise HTTPException(e.response.status_code, detail) from e
    except Exception as e:
        log.exception("print_preview unexpected error")
        raise HTTPException(500, f"Ошибка превью печати: {e}") from e
    finally:
        await client.aclose()


@app.get("/api/print/files/{doc_id}")
async def print_file(
    doc_id: str,
    file_name: str | None = Query(None, alias="fileName"),
    authorization: str | None = Header(None),
    x_audit_host: str | None = Header(None, alias="X-Audit-Host"),
    x_device_uid: str | None = Header(None, alias="X-Device-Uid"),
) -> Any:
    """Прокси preview-файла (PDF) по docId."""
    if not authorization:
        raise HTTPException(401, "Требуется авторизация")
    client = _client(authorization, x_audit_host, x_device_uid)
    try:
        resp = await client.get_file(doc_id, file_name=file_name)
        if resp.status_code >= 400:
            body = (resp.text or "")[:400]
            raise HTTPException(resp.status_code, body or "Не удалось загрузить файл превью")
        content_type = resp.headers.get("content-type", "application/pdf")
        name = (file_name or "").strip() or f"{doc_id}.pdf"
        if "." not in name:
            name = f"{name}.pdf"
        return Response(
            content=resp.content,
            media_type=content_type,
            headers={
                "Cache-Control": "no-store",
                "Content-Disposition": f'inline; filename="{name}"',
            },
        )
    finally:
        await client.aclose()


@app.get("/")
async def index() -> FileResponse:
    return html_response(frontend_dir() / "index.html")


@app.get("/manifest.json")
async def manifest() -> FileResponse:
    path = frontend_dir() / "manifest.json"
    if path.is_file():
        return html_response(path)
    raise HTTPException(404, "manifest not found")


@app.get("/api/frontend-info")
async def frontend_info() -> dict[str, str]:
    root = frontend_dir()
    return {
        "frontend": "react" if root == CLIENT_DIST else "legacy",
        "path": str(root),
    }


if (CLIENT_DIST / "assets").is_dir():
    app.mount("/assets", NoCacheStaticFiles(directory=CLIENT_DIST / "assets"), name="assets")

if WEB_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")
