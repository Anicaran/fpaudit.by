import { useCallback, useState } from 'react';
import { newId } from '../utils/id';
import type { PrintDraft, PrintJobDetail, PrintQueueItem, PrintWorkSession } from '../types';
import { draftToQueueItem, jobToQueueItems } from '../printUtils';

const STORAGE_KEY = 'fpa_print_session';

function loadSession(): PrintWorkSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as PrintWorkSession;
    if (!Array.isArray(s?.items)) return null;
    return {
      inStock: s.inStock ?? true,
      jobType: s.jobType || 'PRICE_TAGS',
      items: s.items.filter((i) => i && typeof i === 'object'),
    };
  } catch {
    return null;
  }
}

function saveSession(s: PrintWorkSession | null) {
  if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  else localStorage.removeItem(STORAGE_KEY);
}

function newSession(jobType = 'PRICE_TAGS'): PrintWorkSession {
  return { inStock: true, jobType, items: [] };
}

export function usePrintSession() {
  const [session, setSession] = useState<PrintWorkSession | null>(() => loadSession());

  const persist = useCallback((next: PrintWorkSession | null) => {
    setSession(next);
    saveSession(next);
  }, []);

  const createSession = useCallback(
    (jobType = 'PRICE_TAGS') => {
      const next = newSession(jobType);
      persist(next);
      return next;
    },
    [persist],
  );

  const cancelSession = useCallback(() => {
    persist(null);
  }, [persist]);

  const ensureSession = useCallback(() => {
    let next: PrintWorkSession | null = null;
    setSession((prev) => {
      next = prev ?? newSession();
      if (!prev) saveSession(next);
      return next;
    });
    return session ?? newSession();
  }, [session]);

  const addItem = useCallback(
    (item: Omit<PrintQueueItem, 'id'>) => {
      setSession((prev) => {
        const base = prev ?? newSession();
        const next: PrintWorkSession = {
          ...base,
          items: [...base.items, { ...item, id: newId() }],
        };
        saveSession(next);
        return next;
      });
    },
    [],
  );

  const addFromDraft = useCallback(
    (draft: PrintDraft, priceTagType: string, copyCount: number) => {
      addItem(draftToQueueItem(draft, priceTagType, copyCount));
    },
    [addItem],
  );

  const removeItem = useCallback((id: string) => {
    setSession((prev) => {
      if (!prev) return null;
      const items = prev.items.filter((i) => i.id !== id);
      const next = items.length ? { ...prev, items } : null;
      saveSession(next);
      return next;
    });
  }, []);

  const setInStock = useCallback((inStock: boolean) => {
    setSession((prev) => {
      if (!prev) return null;
      const next = { ...prev, inStock };
      saveSession(next);
      return next;
    });
  }, []);

  const importFromJob = useCallback((job: PrintJobDetail) => {
    const items = jobToQueueItems(job);
    if (!items.length) return;
    const next: PrintWorkSession = {
      inStock: job.inStock ?? true,
      jobType: job.jobType || 'PRICE_TAGS',
      items,
    };
    persist(next);
  }, [persist]);

  const clearAfterSubmit = useCallback(() => {
    persist(null);
  }, [persist]);

  const replaceSession = useCallback(
    (next: PrintWorkSession) => {
      persist(next);
    },
    [persist],
  );

  const setJobType = useCallback(
    (jobType: string) => {
      setSession((prev) => {
        const base = prev ?? newSession();
        const next = { ...base, jobType: jobType || 'PRICE_TAGS' };
        saveSession(next);
        return next;
      });
    },
    [],
  );

  return {
    session,
    isActive: !!session,
    createSession,
    cancelSession,
    ensureSession,
    addItem,
    addFromDraft,
    removeItem,
    setInStock,
    setJobType,
    replaceSession,
    importFromJob,
    clearAfterSubmit,
  };
}
