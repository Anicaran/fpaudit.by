import type { PrintJobDetail, PrintSubmitPayload } from './types';

const KEY = 'fpa_print_job_cache';

type CacheMap = Record<string, PrintJobDetail>;

function readCache(): CacheMap {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CacheMap) : {};
  } catch {
    return {};
  }
}

function writeCache(map: CacheMap) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function payloadToJobDetail(id: number, payload: PrintSubmitPayload): PrintJobDetail {
  return {
    id,
    sap: payload.sap,
    jobType: payload.jobType,
    inStock: payload.inStock,
    createDate: Date.now(),
    elements: payload.elements.map((el) => ({
      localCodeFrom: el.localCodeFrom ?? undefined,
      localCodeTo: el.localCodeTo ?? undefined,
      productName: el.productName ?? undefined,
      priceTagType: el.priceTagType ?? undefined,
      copyCount: el.copyCount,
    })),
  };
}

export function savePrintJobCache(detail: PrintJobDetail) {
  if (detail.id == null) return;
  const map = readCache();
  map[String(detail.id)] = detail;
  writeCache(map);
}

export function loadPrintJobCache(jobId: number): PrintJobDetail | null {
  return readCache()[String(jobId)] ?? null;
}

export function extractJobIdFromSubmitResponse(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const id = d.id ?? d.jobId ?? d.printJobId;
  if (id == null) return null;
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}
