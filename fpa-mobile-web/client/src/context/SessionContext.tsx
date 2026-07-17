import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiRequest, loginRequest } from '../api';
import type { Session, Shop } from '../types';
import { shopDisplayName } from '../utils';
import { useToast } from './ToastContext';

const STORAGE_KEY = 'fpa_mobile_session';
const USERNAME_KEY = 'fpa_mobile_username';
const PROD_AUDIT_HOST = 'audit.fix-price.ru';

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    return { ...parsed, serverHost: PROD_AUDIT_HOST };
  } catch {
    return null;
  }
}

function saveSession(s: Session | null) {
  if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  else localStorage.removeItem(STORAGE_KEY);
}

interface SessionContextValue {
  session: Session | null;
  savedUsername: string;
  shopPickerShops: Shop[] | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  applyShop: (shop: Shop, notifyServer?: boolean) => Promise<void>;
  resolveShopAfterLogin: () => Promise<void>;
  closeShopPicker: () => void;
  pickShopFromDialog: (shop: Shop) => Promise<void>;
  api: <T = unknown>(path: string, options?: RequestInit) => Promise<T>;
  fetchLinkedShops: () => Promise<Shop[]>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [savedUsername] = useState(() => localStorage.getItem(USERNAME_KEY) || '');
  const [shopPickerShops, setShopPickerShops] = useState<Shop[] | null>(null);

  const applyShopWithSession = useCallback(
    async (base: Session, shop: Shop, notifyServer = true) => {
      const sap = String(shop.sap ?? shop.sapCode ?? '').trim();
      const shopId = Number(shop.id);
      const next: Session = {
        ...base,
        sap,
        shopId: Number.isFinite(shopId) ? shopId : undefined,
        shopLabel: shopDisplayName(shop),
      };
      setSession(next);
      saveSession(next);
      if (notifyServer && next.shopId) {
        try {
          await apiRequest(next, '/api/shops/select', {
            method: 'POST',
            body: JSON.stringify({ shop_id: next.shopId }),
          });
        } catch (ex) {
          toast('Магазин выбран локально: ' + (ex instanceof Error ? ex.message : String(ex)), 'err');
        }
      }
    },
    [toast],
  );

  const applyShop = useCallback(
    async (shop: Shop, notifyServer = true) => {
      if (!session) return;
      await applyShopWithSession(session, shop, notifyServer);
    },
    [session, applyShopWithSession],
  );

  const api = useCallback(
    <T,>(path: string, options?: RequestInit) => {
      if (!session) throw new Error('Не авторизован');
      return apiRequest<T>(session, path, options);
    },
    [session],
  );

  const fetchLinkedShops = useCallback(async () => {
    const shops = await api<Shop[]>('/api/shops');
    return Array.isArray(shops) ? shops : [];
  }, [api]);

  const resolveShopForSession = useCallback(
    async (s: Session) => {
      try {
        const shops = await apiRequest<Shop[]>(s, '/api/shops');
        const list = Array.isArray(shops) ? shops : [];
        if (!list.length) {
          toast('Нет привязанных магазинов — выберите в «Профиль»', 'err');
          return;
        }
        const savedId = s.shopId;
        const saved = savedId != null ? list.find((shop) => Number(shop.id) === Number(savedId)) : null;
        if (saved) {
          await applyShopWithSession(s, saved, true);
          return;
        }
        if (list.length === 1) {
          await applyShopWithSession(s, list[0], true);
          toast(`Магазин: ${shopDisplayName(list[0])}`, 'ok');
          return;
        }
        setShopPickerShops(list);
      } catch (ex) {
        toast('Магазины: ' + (ex instanceof Error ? ex.message : String(ex)), 'err');
      }
    },
    [applyShopWithSession, toast],
  );

  const resolveShopAfterLogin = useCallback(async () => {
    if (!session) return;
    await resolveShopForSession(session);
  }, [session, resolveShopForSession]);

  const login = useCallback(
    async (username: string, password: string) => {
      const data = await loginRequest(username, password);
      const next: Session = {
        token: data.token,
        serverHost: PROD_AUDIT_HOST,
        deviceUid: data.device_uid,
        sap: '',
        username,
      };
      localStorage.setItem(USERNAME_KEY, username);
      setSession(next);
      saveSession(next);
      await resolveShopForSession(next);
    },
    [resolveShopForSession],
  );

  const logout = useCallback(() => {
    setSession(null);
    saveSession(null);
    setShopPickerShops(null);
  }, []);

  const closeShopPicker = useCallback(() => setShopPickerShops(null), []);

  const pickShopFromDialog = useCallback(
    async (shop: Shop) => {
      await applyShop(shop, true);
      setShopPickerShops(null);
      toast('Магазин выбран', 'ok');
    },
    [applyShop, toast],
  );

  useEffect(() => {
    const s = loadSession();
    if (s?.token && !s.sap) {
      void resolveShopForSession(s);
    }
  }, [resolveShopForSession]);

  const value = useMemo(
    () => ({
      session,
      savedUsername,
      shopPickerShops,
      login,
      logout,
      applyShop,
      resolveShopAfterLogin,
      closeShopPicker,
      pickShopFromDialog,
      api,
      fetchLinkedShops,
    }),
    [
      session,
      savedUsername,
      shopPickerShops,
      login,
      logout,
      applyShop,
      resolveShopAfterLogin,
      closeShopPicker,
      pickShopFromDialog,
      api,
      fetchLinkedShops,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}
