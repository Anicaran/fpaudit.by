import { newId } from './utils/id';
import { padLocalCodeForApi } from './utils';
import type {
  PrintDraft,
  PrintJobDetail,
  PrintJobElement,
  PrintQueueItem,
  PrintSubmitPayload,
  PrintWorkSession,
} from './types';

export function buildPrintPayload(
  sap: string,
  inStock: boolean,
  jobType: string,
  elements: PrintJobElement[],
): PrintSubmitPayload {
  return {
    sap,
    jobType: jobType || 'PRICE_TAGS',
    inStock,
    elements: elements.map((el) => {
      const lc = el.localCodeFrom || el.localCodeTo || '';
      const lcTo = el.localCodeTo || el.localCodeFrom || lc;
      const paddedFrom = lc ? padLocalCodeForApi(lc) : '';
      const paddedTo = lcTo ? padLocalCodeForApi(lcTo) : paddedFrom;
      return {
        localCodeFrom: paddedFrom || null,
        localCodeTo: paddedTo || null,
        productName: el.productName || null,
        priceTagType: el.priceTagType || null,
        copyCount: el.copyCount ?? 1,
        modifiedFrom: el.modifiedFrom || null,
        modifiedTo: el.modifiedTo || null,
      };
    }),
  };
}

export function buildPrintPayloadFromSession(sap: string, session: PrintWorkSession): PrintSubmitPayload {
  return buildPrintPayload(
    sap,
    session.inStock,
    session.jobType,
    session.items.map(queueItemToElement),
  );
}

export function buildPrintPayloadFromJob(job: PrintJobDetail): PrintSubmitPayload {
  return buildPrintPayload(
    job.sap || '',
    job.inStock ?? true,
    job.jobType || 'PRICE_TAGS',
    job.elements || [],
  );
}

export function queueItemToElement(item: PrintQueueItem): PrintJobElement {
  return {
    localCodeFrom: item.localCodeFrom,
    localCodeTo: item.localCodeTo || item.localCodeFrom,
    productName: item.productName || undefined,
    priceTagType: item.priceTagType || undefined,
    copyCount: item.copyCount,
    modifiedFrom: item.modifiedFrom,
    modifiedTo: item.modifiedTo,
  };
}

export function draftToQueueItem(
  draft: PrintDraft,
  priceTagType: string,
  copyCount: number,
  localCodeTo?: string,
): Omit<PrintQueueItem, 'id'> {
  const lc = padLocalCodeForApi(draft.localcode);
  const lcTo = localCodeTo?.trim() ? padLocalCodeForApi(localCodeTo) : lc;
  return {
    localCodeFrom: lc,
    localCodeTo: lcTo,
    productName: draft.name.trim(),
    priceTagType,
    copyCount: copyCount || 1,
  };
}

export function jobToQueueItems(job: PrintJobDetail): PrintQueueItem[] {
  return (job.elements || []).map((el) => {
    const from = el.localCodeFrom || el.localCodeTo || '';
    return {
      id: newId(),
      localCodeFrom: from,
      localCodeTo: el.localCodeTo || from,
      productName: el.productName || '',
      priceTagType: el.priceTagType || '',
      copyCount: el.copyCount ?? 1,
      modifiedFrom: el.modifiedFrom,
      modifiedTo: el.modifiedTo,
    };
  });
}

export function elementsToQueueItems(elements: PrintJobElement[]): PrintQueueItem[] {
  return jobToQueueItems({ elements });
}

export function printJobTypeLabel(job: PrintJobDetail | { jobType?: string; type?: string }): string {
  return String(job.jobType || job.type || 'PRICE_TAGS');
}
