export function parseError(data: unknown, fallback: string): string {
  const pick = (value: string | undefined | null): string | null => {
    const t = (value || '').trim();
    return t || null;
  };
  if (!data || typeof data !== 'object') return pick(String(data ?? '')) || fallback;
  const d = data as Record<string, unknown>;
  if (typeof d.message === 'string') {
    const msg = pick(d.message);
    if (msg) return msg;
  }
  if (typeof d.error === 'string') {
    const err = pick(d.error);
    if (err) return err;
  }
  if (typeof d.detail === 'string') {
    const detail = pick(d.detail);
    if (detail) return detail;
  }
  if (Array.isArray(d.detail)) {
    const joined = d.detail
      .map((item) => {
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg: unknown }).msg);
        }
        return JSON.stringify(item);
      })
      .join('; ');
    return pick(joined) || fallback;
  }
  if (typeof d.detail === 'object' && d.detail !== null) {
    return pick(JSON.stringify(d.detail)) || fallback;
  }
  // Не показывать сырой {"detail":""} — это пустой ответ Audit
  const raw = pick(JSON.stringify(data));
  if (raw && raw !== '{"detail":""}' && raw !== '{"detail":null}') return raw;
  return fallback;
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function statusLabel(st: string | undefined): string {
  const map: Record<string, string> = {
    OPEN: 'Открыта',
    IN_PROGRESS: 'В работе',
    CLOSED: 'Закрыта',
    COMPLETED: 'Выполнена',
  };
  return map[st ?? ''] || st || '—';
}

export function badgeClass(st: string | undefined): string {
  if (st === 'CLOSED' || st === 'COMPLETED') return 'done';
  if (st === 'IN_PROGRESS') return '';
  return '';
}

export function formatDate(value: unknown): string {
  if (!value) return '—';
  const n = Number(value);
  if (!Number.isNaN(n) && n > 1e11) {
    return new Date(n).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  const str = String(value);
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (!Number.isNaN(n)) {
    return new Date(n).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return str;
}

/** Как в APK: codeType для goods/info — LOCAL или BARCODE. */
export function goodsCodeType(kind: 'local' | 'barcode' = 'local'): string {
  return kind === 'barcode' ? 'BARCODE' : 'LOCAL';
}

/** Убирает ведущие нули для отображения (ExtensionKt.truncateLeadingZero). */
export function truncateLeadingZero(value: string): string {
  const trimmed = value.trim().replace(/^0+/, '');
  return trimmed || '0';
}

/** Ввод локального кода: до 7 цифр, как validateLocalCode в APK. */
export function normalizeLocalCodeInput(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.slice(0, 7);
}

export function displayLocalCode(info: { localcode?: string; localCode?: string } | null, fallback = ''): string {
  const raw = info?.localcode || info?.localCode || fallback;
  return raw ? truncateLeadingZero(raw) : fallback;
}

/** URL прокси картинки через наш сервер (CDN + buyer API на бэкенде). */
export function goodsImageProxyUrl(localcode?: string, barcode?: string): string | null {
  const params = new URLSearchParams();
  const lc = localcode ? normalizeLocalCodeInput(truncateLeadingZero(localcode)) : '';
  if (lc) params.set('localcode', lc);
  const bc = (barcode || '').trim();
  if (bc) params.set('barcode', bc);
  return params.size ? `/api/goods/image?${params.toString()}` : null;
}

/** Список URL для <img>: прокси, затем прямой CDN (если был в ответе API). */
export function goodsImageCandidates(
  info: { image?: string | null; localcode?: string; localCode?: string; barcode?: string; barcodes?: string[] },
  fallbackLocal = '',
  fallbackBarcode = '',
): string[] {
  const lc = displayLocalCode(info, fallbackLocal);
  const bc = info.barcode || info.barcodes?.[0] || fallbackBarcode.trim();
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (url: string | null | undefined) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push(url);
  };
  add(goodsImageProxyUrl(lc, bc));
  if (info.image?.startsWith('/api/goods/image')) add(info.image);
  else if (info.image?.startsWith('http')) add(info.image);
  return out;
}

/** SAP-формат локального кода для API (ExtensionKt.addLeadingZeroForLocalCode). */
export function padLocalCodeForApi(value: string): string {
  const short = normalizeLocalCodeInput(truncateLeadingZero(value));
  return short ? `00000000000${short}` : value.trim();
}

export function formatGoodsPrice(value: unknown): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatGoodsCount(value: unknown): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}

export function shopDisplayName(s: {
  sap?: string;
  sapCode?: string;
  locality?: string;
  address?: string;
  name?: string;
}): string {
  const sap = s.sap ?? s.sapCode ?? '';
  const loc = s.locality || s.address || s.name || '';
  return loc ? `${loc} (SAP ${sap})` : `SAP ${sap}`;
}
