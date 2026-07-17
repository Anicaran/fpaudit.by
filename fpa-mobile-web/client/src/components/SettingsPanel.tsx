import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import type { Shop } from '../types';
import { escapeHtml, shopDisplayName } from '../utils';

export function SettingsPanel() {
  const { session, api, fetchLinkedShops, applyShop } = useSession();
  const { toast } = useToast();
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [accountHtml, setAccountHtml] = useState('Загрузка…');
  const [contactOpen, setContactOpen] = useState(false);
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');

  const loadAccountInfo = useCallback(async () => {
    setAccountHtml('Загрузка…');
    try {
      const acc = await api<Record<string, unknown>>('/api/auth/account');
      const lines: string[] = [];
      if (acc.username || acc.login) lines.push(`Логин: ${acc.username || acc.login}`);
      const first = acc.firstName as string | undefined;
      const last = acc.lastName as string | undefined;
      if (first || last) lines.push(`Имя: ${[first, last].filter(Boolean).join(' ')}`);
      if (acc.email) lines.push(`Email: ${acc.email}`);
      if (Array.isArray(acc.roles) && acc.roles.length) lines.push(`Роли: ${acc.roles.join(', ')}`);
      setAccountHtml(
        lines.length
          ? lines.map((l) => escapeHtml(l)).join('<br>')
          : `<pre class="muted">${escapeHtml(JSON.stringify(acc, null, 2))}</pre>`,
      );
    } catch (ex) {
      setAccountHtml(ex instanceof Error ? ex.message : String(ex));
    }
  }, [api]);

  const loadShops = useCallback(async () => {
    try {
      const list = await fetchLinkedShops();
      setShops(list);
      if (session?.shopId != null) setSelectedShopId(String(session.shopId));
    } catch {
      setShops([]);
    }
  }, [fetchLinkedShops, session?.shopId]);

  useEffect(() => {
    void loadAccountInfo();
    void loadShops();
  }, [loadAccountInfo, loadShops]);

  async function saveShop() {
    const shop = shops.find((s) => String(s.id) === selectedShopId);
    if (!shop) {
      toast('Выберите магазин', 'err');
      return;
    }
    await applyShop(shop, true);
    toast('Магазин применён', 'ok');
  }

  const shopCurrent =
    session?.shopLabel || (session?.sap ? `SAP ${session.sap}` : 'Не выбран');

  function openContactDialog() {
    setContactEmail('');
    setContactMessage('');
    setContactOpen(true);
  }

  function sendToDeveloper() {
    const to = 'kolik17@list.ru';
    const from = contactEmail.trim();
    const body = [
      from ? `Email для ответа: ${from}` : 'Email для ответа не указан',
      '',
      contactMessage.trim() || '(без сообщения)',
    ].join('\n');
    const subject = 'FP Audit Mobile Web: обращение';
    const mailto = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    toast('Открылся почтовый клиент для отправки письма', 'ok');
    setContactOpen(false);
  }

  return (
    <div className="panel active">
      <div className="card">
        <h3 className="card-title">Магазин</h3>
        <p className="muted">Текущий: {shopCurrent}</p>
        <label>
          Сменить магазин
          <select value={selectedShopId} onChange={(e) => setSelectedShopId(e.target.value)}>
            <option value="">— выберите магазин —</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {shopDisplayName(s)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn primary block" onClick={() => void saveShop()}>
          Применить
        </button>
      </div>
      <div className="card">
        <h3 className="card-title">Аккаунт</h3>
        <div className="account-box" dangerouslySetInnerHTML={{ __html: accountHtml }} />
        <button type="button" className="btn sm block" onClick={() => void loadAccountInfo()}>
          Обновить
        </button>
      </div>
      <div className="card small muted">
        <div>Сервер: {session?.serverHost || '—'}</div>
        <div>Сборка клиента: 1.0.1</div>
        <button type="button" className="btn sm block" onClick={openContactDialog}>
          Связаться с разработчиком
        </button>
      </div>
      {contactOpen
        ? createPortal(
            <div
              className="modal-overlay"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget) setContactOpen(false);
              }}
            >
              <div className="modal-sheet" role="dialog" aria-modal="true" aria-label="Связаться с разработчиком">
                <div className="modal-sheet-header">
                  <h2>Связаться с разработчиком</h2>
                  <button
                    type="button"
                    className="modal-close"
                    onClick={() => setContactOpen(false)}
                    aria-label="Закрыть"
                  >
                    ✕
                  </button>
                </div>
                <label>
                  Ваш email
                  <input
                    type="email"
                    placeholder="example@mail.ru"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                  />
                </label>
                <label>
                  Сообщение
                  <textarea
                    rows={5}
                    placeholder="Опишите проблему или пожелание"
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                  />
                </label>
                <div className="row-actions">
                  <button type="button" className="btn" onClick={() => setContactOpen(false)}>
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={sendToDeveloper}
                    disabled={!contactMessage.trim()}
                  >
                    Отправить
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
