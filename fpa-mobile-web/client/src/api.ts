import type { Session } from './types';
import { parseError } from './utils';

const PROD_AUDIT_HOST = 'audit.fix-price.ru';

function authHeaders(session: Session): HeadersInit {
  if (!session.token) throw new Error('Не авторизован');
  return {
    Authorization: `Bearer ${session.token}`,
    'X-Audit-Host': PROD_AUDIT_HOST,
    'X-Device-Uid': session.deviceUid,
    'Content-Type': 'application/json',
  };
}

export async function apiUpload<T = unknown>(
  session: Session,
  path: string,
  formData: FormData,
): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.token}`,
      'X-Audit-Host': PROD_AUDIT_HOST,
      'X-Device-Uid': session.deviceUid,
    },
    body: formData,
  });
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }
  if (!res.ok) throw new Error(parseError(data, res.statusText));
  return data as T;
}

export async function apiRequest<T = unknown>(
  session: Session,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { ...authHeaders(session), ...(options.headers || {}) },
  });
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }
  if (!res.ok) throw new Error(parseError(data, res.statusText));
  return data as T;
}

export async function loginRequest(
  username: string,
  password: string,
): Promise<{ token: string; server_host: string; device_uid: string }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, server_host: PROD_AUDIT_HOST }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(parseError(data, 'Ошибка входа'));
  return data;
}
