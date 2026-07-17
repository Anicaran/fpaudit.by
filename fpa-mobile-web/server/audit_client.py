"""HTTP-клиент к audit.fix-price.ru (как FP Audit 26.1)."""

from __future__ import annotations

import gzip
import json
import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import httpx

DEFAULT_HOST = "audit.fix-price.ru"
APP_VERSION = "27.5"


class AuditClient:
    def __init__(
        self,
        host: str = DEFAULT_HOST,
        token: str | None = None,
        device_uid: str | None = None,
        timeout: float = 60.0,
    ) -> None:
        self.host = host.strip().lower().replace("https://", "").replace("http://", "").split("/")[0]
        self.token = token
        self.device_uid = device_uid or f"web-{uuid.uuid4().hex[:12]}"
        self.base_url = f"https://{self.host}/api/"
        self._client = httpx.AsyncClient(timeout=timeout, follow_redirects=True)

    async def aclose(self) -> None:
        await self._client.aclose()

    def _headers(self, *, gzip_body: bool = False) -> dict[str, str]:
        # Как HeaderInterceptor в APK 27.5
        h: dict[str, str] = {
            "X-App-Version": APP_VERSION,
            "X-Device-Platform": "android",
            "X-Device-Uid": self.device_uid,
            "X-Device-Model": "WebProxy",
            "Accept": "application/json",
        }
        if gzip_body:
            h["Content-Encoding"] = "gzip"
        if self.token:
            h["x-auth-token"] = self.token
            h["Authorization"] = self.token
        return h

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: Any = None,
        gzip_body: bool = False,
        raw: bool = False,
        extra_headers: dict[str, str] | None = None,
    ) -> httpx.Response:
        url = path if path.startswith("http") else f"{self.base_url}{path.lstrip('/')}"
        headers = self._headers(gzip_body=gzip_body)
        if extra_headers:
            headers.update(extra_headers)
        kwargs: dict[str, Any] = {
            "method": method,
            "url": url,
            "params": params,
            "headers": headers,
        }
        if json_body is not None:
            if gzip_body:
                # APK: Content-Type application/json (без charset) + GzipRequestInterceptor
                payload = json.dumps(json_body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
                kwargs["content"] = gzip.compress(payload)
                headers["Content-Type"] = "application/json"
            else:
                headers["Content-Type"] = "application/json"
                kwargs["content"] = json.dumps(json_body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        resp = await self._client.request(**kwargs)
        if raw:
            return resp
        return resp

    async def authenticate(self, username: str, password: str) -> dict[str, Any]:
        resp = await self._request(
            "POST",
            "xauth/authenticate",
            params={"username": username, "password": password},
            gzip_body=True,
        )
        if resp.status_code >= 400:
            detail = resp.text[:500] if resp.text else resp.reason_phrase
            raise httpx.HTTPStatusError(
                f"Авторизация не удалась ({resp.status_code}): {detail}",
                request=resp.request,
                response=resp,
            )
        data = resp.json()
        token = data.get("token") if isinstance(data, dict) else None
        if not token:
            raise ValueError("Сервер не вернул token")
        self.token = str(token)
        return data

    async def get_account(self) -> Any:
        resp = await self._request("GET", "xauth/account")
        resp.raise_for_status()
        return resp.json()

    async def list_tasks(
        self,
        *,
        page: int = 0,
        per_page: int = 30,
        task_status: list[str] | None = None,
        name: str | None = None,
    ) -> Any:
        params: dict[str, Any] = {
            "page": page,
            "perPage": per_page,
            "divisionIds": [],
        }
        if task_status:
            params["taskStatus"] = task_status
        if name:
            params["name"] = name
        resp = await self._request("GET", "tasks-manual/all", params=params)
        resp.raise_for_status()
        return resp.json()

    async def get_task_responses(self, task_id: int, *, size: int = 50, page: int = 0) -> Any:
        resp = await self._request(
            "GET",
            f"tasks-manual/{task_id}/responses/",
            params={"size": size, "page": page},
        )
        resp.raise_for_status()
        return resp.json()

    @staticmethod
    def _json_or_ok(resp: httpx.Response) -> Any:
        if not resp.content:
            return {"ok": True, "status": resp.status_code}
        try:
            return resp.json()
        except Exception:
            return {"ok": True, "status": resp.status_code, "text": resp.text[:200]}

    async def start_task_response(self, response_id: int, body: dict[str, Any]) -> Any:
        # Как APK ManualTasksApi.startTask + GzipRequestInterceptor
        resp = await self._request(
            "POST",
            f"tasks-manual/responses/{response_id}/start/",
            json_body=body,
            gzip_body=True,
        )
        # Fallback без gzip — на случай если сервер отверг encoding
        if resp.status_code == 400:
            resp2 = await self._request(
                "POST",
                f"tasks-manual/responses/{response_id}/start/",
                json_body=body,
                gzip_body=False,
            )
            if resp2.status_code < 400:
                return self._json_or_ok(resp2)
            resp = resp2
        if resp.status_code >= 400:
            detail = (resp.text or "").strip()[:400]
            if not detail:
                detail = (
                    "HTTP 400 — задача уже взята в работу, неверный version "
                    "или магазин не выбран (как в APK: StartTaskUseCaseImpl)."
                )
            raise httpx.HTTPStatusError(
                f"Не удалось взять задачу в работу ({resp.status_code}): {detail}",
                request=resp.request,
                response=resp,
            )
        return self._json_or_ok(resp)

    async def close_task_response(self, response_id: int, body: dict[str, Any]) -> Any:
        resp = await self._request(
            "POST",
            f"tasks-manual/responses/{response_id}/stop/",
            json_body=body,
            gzip_body=True,
        )
        if resp.status_code == 400:
            resp2 = await self._request(
                "POST",
                f"tasks-manual/responses/{response_id}/stop/",
                json_body=body,
                gzip_body=False,
            )
            if resp2.status_code < 400:
                return self._json_or_ok(resp2)
            resp = resp2
        if resp.status_code >= 400:
            detail = (resp.text or "").strip()[:400] or f"HTTP {resp.status_code}"
            raise httpx.HTTPStatusError(
                f"Не удалось завершить задачу ({resp.status_code}): {detail}",
                request=resp.request,
                response=resp,
            )
        return self._json_or_ok(resp)

    async def goods_info(self, sap: str, code_type: str, code: str) -> Any:
        resp = await self._request(
            "GET",
            "goods/info",
            params={"sap": sap, "codeType": code_type, "code": code},
        )
        resp.raise_for_status()
        return resp.json()

    async def localcode_by_barcode(self, barcode: str) -> str:
        resp = await self._request("GET", f"goods/barcode/{quote(barcode, safe='')}/localcode")
        resp.raise_for_status()
        return resp.text.strip().strip('"')

    async def barcodes_by_localcode(self, localcode: str) -> list[str]:
        resp = await self._request("GET", f"goods/localcode/{quote(localcode, safe='')}/barcodes")
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, list):
            return [str(x) for x in data]
        return []

    async def get_executable_tasks(self, response_ids: list[int]) -> Any:
        params: list[tuple[str, Any]] = [("responseIds", rid) for rid in response_ids]
        url = f"{self.base_url}tasks-manual/responses/"
        resp = await self._client.request(
            "GET",
            url,
            params=params,
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json()

    async def get_executable_task(self, response_id: int) -> Any:
        resp = await self._request("GET", f"tasks-manual/responses/{response_id}")
        resp.raise_for_status()
        return resp.json()

    async def submit_expiration_check(
        self,
        response_id: int,
        goods: list[dict[str, Any]],
    ) -> Any:
        """APK IRestApi.sendGoodsCheckExpirationDates — plain JSON array, без gzip."""
        # expirationdates/di/NetworkModuleKt: Gson, без GzipRequestInterceptor
        resp = await self._request(
            "POST",
            f"tasks-manual/expiration/{response_id}/check",
            json_body=goods,
            gzip_body=False,
        )
        if resp.status_code >= 400:
            detail = (resp.text or "").strip()[:400] or f"HTTP {resp.status_code}"
            raise httpx.HTTPStatusError(
                f"Не удалось отправить проверку сроков ({resp.status_code}): {detail}",
                request=resp.request,
                response=resp,
            )
        if resp.content:
            try:
                return resp.json()
            except Exception:
                return {"status": resp.status_code, "ok": True}
        return {"status": resp.status_code, "ok": True}

    async def price_tag_types(self, sap: str) -> Any:
        resp = await self._request("GET", "goods/priceTags/types", params={"sap": sap})
        resp.raise_for_status()
        return resp.json()

    async def create_print_job(self, body: dict[str, Any]) -> Any:
        # Модуль печати в APK (IRestApi) шлёт обычный JSON, без gzip.
        resp = await self._request(
            "POST",
            "goods/priceTags/print",
            json_body=body,
            gzip_body=False,
        )
        if resp.status_code >= 400:
            resp.raise_for_status()
        if resp.content:
            try:
                return resp.json()
            except Exception:
                return {"status": resp.status_code, "text": resp.text}
        return {"status": resp.status_code, "ok": True}

    async def print_preview(self, body: dict[str, Any]) -> Any:
        resp = await self._request(
            "POST",
            "goods/priceTags/print/preview",
            json_body=body,
            gzip_body=False,
        )
        resp.raise_for_status()
        return resp.json()

    async def get_file(self, doc_id: str, file_name: str | None = None) -> httpx.Response:
        """Скачать файл превью PDF (разные окружения Audit используют разные пути)."""
        doc = quote(str(doc_id), safe="")
        name = quote(str(file_name or "").strip(), safe="")

        candidates: list[tuple[str, dict[str, Any] | None]] = [
            (f"files/{doc}", None),
            (f"files/{doc}", {"fileName": str(file_name).strip()}) if file_name else (f"files/{doc}", None),
        ]
        if name:
            candidates.extend(
                [
                    (f"files/{name}", None),
                    (f"files/{name}", {"docId": str(doc_id).strip()}),
                    (f"files/{doc}/{name}", None),
                    (f"files/{name}/{doc}", None),
                ]
            )

        tried: set[tuple[str, tuple[tuple[str, str], ...]]] = set()
        last: httpx.Response | None = None
        for path, params in candidates:
            params_key = tuple(sorted((str(k), str(v)) for k, v in (params or {}).items()))
            key = (path, params_key)
            if key in tried:
                continue
            tried.add(key)
            resp = await self._request(
                "GET",
                path,
                params=params,
                raw=True,
                extra_headers={"Accept": "application/pdf, application/octet-stream, */*"},
            )
            last = resp
            # Если нашли не-404, возвращаем как есть (200/401/500 и т.д.)
            if resp.status_code != 404:
                return resp
        assert last is not None
        return last

    async def list_print_jobs(self, sap: str, *, page: int = 0, size: int = 20) -> Any:
        resp = await self._request(
            "GET",
            "goods/priceTags/print",
            params={"sap": sap, "page": page, "size": size, "sort": "createDate,desc"},
        )
        resp.raise_for_status()
        return resp.json()

    async def get_print_job(self, job_id: int, *, sap: str | None = None) -> Any:
        params = {"sap": sap} if sap else None
        resp = await self._request("GET", f"goods/priceTags/print/{job_id}", params=params)
        resp.raise_for_status()
        return resp.json()

    async def list_shops(self, *, active: bool = True) -> Any:
        resp = await self._request("GET", "orgstruct/shops", params={"active": active})
        resp.raise_for_status()
        return resp.json()

    async def shops_linked_to_user(self, actor_id: int) -> Any:
        resp = await self._request(
            "GET",
            "mobile/v31/shopsLinkedToUser",
            params={"actorId": actor_id},
        )
        resp.raise_for_status()
        return resp.json()

    async def assign_shop(self, shop_id: int) -> None:
        resp = await self._request(
            "POST",
            "shops/assignShop",
            params={"shopId": shop_id},
            json_body={},
            gzip_body=True,
        )
        resp.raise_for_status()

    async def get_system_properties(self) -> Any:
        resp = await self._request("GET", "admin/systemProperties")
        resp.raise_for_status()
        return resp.json()

    async def product_search_by_image(
        self,
        image_bytes: bytes,
        *,
        filename: str = "photo.jpg",
        content_type: str = "image/jpeg",
        limit: int = 40,
        score_threshold: float | None = None,
    ) -> Any:
        """Поиск товара по фото (ProductSearchApi.searchByImageFile в FP Audit)."""
        params: dict[str, Any] = {"limit": limit}
        if score_threshold is not None:
            params["scoreThreshold"] = score_threshold
        url = f"{self.base_url}goods/productSearch/search"
        headers = self._headers()
        headers.pop("Accept", None)
        files = {"file": (filename, image_bytes, content_type or "image/jpeg")}
        resp = await self._client.post(url, params=params, headers=headers, files=files)
        if resp.status_code >= 400:
            resp.raise_for_status()
        return resp.json()

    async def send_recount_goods(self, goods: list[dict[str, Any]]) -> Any:
        resp = await self._request(
            "PUT",
            "tasks-manual/goods/save",
            json_body=goods,
            gzip_body=False,
        )
        if resp.status_code >= 400:
            resp.raise_for_status()
        if resp.content:
            try:
                return resp.json()
            except Exception:
                return {"status": resp.status_code, "text": resp.text[:200]}
        return {"status": resp.status_code, "ok": True}

    async def get_unsold_reasons(self) -> Any:
        resp = await self._request("GET", "goods/unsold/reasons")
        resp.raise_for_status()
        return resp.json()

    async def submit_unsold_goods(self, body: dict[str, Any]) -> Any:
        resp = await self._request(
            "POST",
            "tasks-manual/unsoldGoods",
            json_body=body,
            gzip_body=False,
        )
        if resp.status_code >= 400:
            resp.raise_for_status()
        if resp.content:
            try:
                return resp.json()
            except Exception:
                return {"status": resp.status_code}
        return {"status": resp.status_code, "ok": True}


def _normalize_task_item(task: Any) -> dict[str, Any] | None:
    """Привести одну задачу к виду, который ждёт web-клиент."""
    if not isinstance(task, dict):
        return None
    item = dict(task)
    responses = item.get("responseList")
    if not isinstance(responses, list) or not responses:
        child = item.get("childTasks")
        if isinstance(child, list) and child:
            item["responseList"] = child
    if item.get("childTaskId") is None:
        resp_list = item.get("responseList") if isinstance(item.get("responseList"), list) else []
        for resp in resp_list:
            if not isinstance(resp, dict):
                continue
            rid = resp.get("id") if resp.get("id") is not None else resp.get("responseId")
            if rid is not None:
                item["childTaskId"] = rid
                break
    return item


def normalize_task_list(data: Any) -> list[dict[str, Any]]:
    """Распаковать пагинированный ответ tasks-manual/all в плоский список задач."""
    if isinstance(data, list):
        raw_items = data
    elif isinstance(data, dict):
        raw_items = (
            data.get("content")
            or data.get("items")
            or data.get("tasks")
            or data.get("childTasks")
            or []
        )
        if not isinstance(raw_items, list):
            raw_items = []
    else:
        raw_items = []

    out: list[dict[str, Any]] = []
    for task in raw_items:
        normalized = _normalize_task_item(task)
        if normalized is not None:
            out.append(normalized)
    return out


def normalize_task_responses(data: Any) -> dict[str, Any]:
    """Привести ответ tasks-manual/{id}/responses/ к единому виду."""
    if isinstance(data, list):
        return {"items": data}
    if not isinstance(data, dict):
        return {"items": []}
    items = (
        data.get("childTasks")
        or data.get("content")
        or data.get("responses")
        or data.get("items")
        or []
    )
    return {
        "items": items if isinstance(items, list) else [],
        "page": data.get("number"),
        "last": data.get("last"),
    }


def normalize_product_search(data: Any) -> dict[str, Any]:
    """Унифицировать ответ поиска по фото под web-клиент."""
    if isinstance(data, list):
        raw = data
        base: dict[str, Any] = {}
    elif isinstance(data, dict):
        base = dict(data)
        raw = (
            data.get("results")
            or data.get("items")
            or data.get("products")
            or data.get("content")
            or []
        )
        if not isinstance(raw, list):
            raw = []
    else:
        return {"results": []}

    results: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        product_id = (
            item.get("product_id")
            if item.get("product_id") is not None
            else item.get("productId")
            if item.get("productId") is not None
            else item.get("localcode")
            if item.get("localcode") is not None
            else item.get("localCode")
            if item.get("localCode") is not None
            else item.get("id")
        )
        image_url = (
            item.get("image_url")
            or item.get("imageUrl")
            or item.get("image")
            or item.get("thumbnail")
            or item.get("thumbUrl")
        )
        row = dict(item)
        if product_id is not None:
            row["product_id"] = product_id
            row["productId"] = product_id
        if image_url:
            row["image_url"] = image_url
            row["imageUrl"] = image_url
        if product_id is not None:
            results.append(row)

    out = dict(base)
    out["results"] = results
    if "total_found" not in out and "totalFound" in out:
        out["total_found"] = out["totalFound"]
    return out


def task_update_body(version: int | None = None, comment: str = "", *, finish: bool = False) -> dict[str, Any]:
    """Тело как UpdateTaskRequestDTO в APK 27.5 (Instant ISO-8601 с Z, без .000)."""
    # kotlinx.datetime.Instant / InstantIso8601Serializer → yyyy-MM-dd'T'HH:mm:ss'Z'
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    body: dict[str, Any] = {}
    if version is not None:
        body["version"] = int(version)
    # Пустой comment APK часто не шлёт; непустой — шлём
    if comment:
        body["comment"] = comment
    if finish:
        body["finishDate"] = now
    else:
        body["startDate"] = now
    return body
