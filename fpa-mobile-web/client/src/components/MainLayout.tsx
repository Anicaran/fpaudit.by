import { useCallback, useMemo, useState } from 'react';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { usePrintSession } from '../hooks/usePrintSession';
import type { PriceLookupPreset, PrintDraft, TabId } from '../types';
import { AiAssistantPanel } from './AiAssistantPanel';
import { AnalyticsPanel } from './AnalyticsPanel';
import { BottomNav } from './BottomNav';
import { HomePanel } from './HomePanel';
import { PricePanel } from './PricePanel';
import { PrintPanel } from './PrintPanel';
import { ProductSearchPanel } from './ProductSearchPanel';
import { SettingsPanel } from './SettingsPanel';
import { TasksPanel } from './TasksPanel';

type ProductTab = 'photo' | 'info';

const TITLES: Record<TabId, string> = {
  tasks: 'Задачи',
  tags: 'Ценики',
  home: 'Главная',
  print: 'Ценики',
  profile: 'Профиль',
  productSearch: 'Поиск по фото',
  aiAssistant: 'AI Assistant',
  analytics: 'Аналитика',
};

export function MainLayout() {
  const { session, logout } = useSession();
  const { toast } = useToast();
  const printSession = usePrintSession();
  const [tab, setTab] = useState<TabId>('home');
  const [productTab, setProductTab] = useState<ProductTab>('info');
  const [pricePreset, setPricePreset] = useState<PriceLookupPreset | null>(null);
  const clearPricePreset = useCallback(() => setPricePreset(null), []);

  const topbarSub = useMemo(() => {
    const shop =
      session?.shopLabel || (session?.sap ? `SAP ${session.sap}` : 'Магазин не выбран');
    return [session?.username, shop].filter(Boolean).join(' · ');
  }, [session]);

  function goPrint(draft: PrintDraft) {
    if (!draft.localcode.trim()) return;
    printSession.ensureSession();
    printSession.addFromDraft(draft, '65X57', 1);
    setTab('print');
    toast('Товар добавлен в задание на печать', 'ok');
  }

  function openProductFromSearch(localcode: string, title?: string) {
    setPricePreset({ localcode });
    setProductTab('info');
    setTab('tags');
    if (title) toast(`Открываем: ${title}`, 'ok');
  }

  function handleTabChange(nextTab: TabId) {
    if (nextTab === 'productSearch') {
      setProductTab('photo');
      setTab('tags');
      return;
    }
    setTab(nextTab);
  }

  const showBack = tab !== 'home';

  return (
    <section className="screen active main-screen">
      <header className="topbar">
        {showBack ? (
          <button type="button" className="btn-back" onClick={() => setTab('home')} aria-label="Назад">
            ←
          </button>
        ) : null}
        <div className="topbar-info">
          <strong>{TITLES[tab]}</strong>
          <small>{topbarSub}</small>
        </div>
        <button type="button" className="btn-logout" onClick={logout} aria-label="Выход">
          Выход
        </button>
      </header>
      <main className={'content' + (tab === 'aiAssistant' || tab === 'analytics' ? ' content-webview' : '')}>
        {tab === 'tasks' && (
          <TasksPanel
            onImportPrintTask={(session) => printSession.replaceSession(session)}
            onGoPrint={() => setTab('print')}
            sap={session?.sap}
          />
        )}
        {tab === 'tags' && (
          <>
            <div className="chips">
              <button
                type="button"
                className={'chip' + (productTab === 'photo' ? ' active' : '')}
                onClick={() => setProductTab('photo')}
              >
                Поиск товара по фото
              </button>
              <button
                type="button"
                className={'chip' + (productTab === 'info' ? ' active' : '')}
                onClick={() => setProductTab('info')}
              >
                Инфо о товаре
              </button>
            </div>
            {productTab === 'photo' ? (
              <ProductSearchPanel onOpenProduct={openProductFromSearch} />
            ) : (
              <PricePanel
                onGoPrint={goPrint}
                preset={pricePreset}
                onPresetConsumed={clearPricePreset}
              />
            )}
          </>
        )}
        {tab === 'home' && <HomePanel onNavigate={handleTabChange} />}
        {tab === 'print' && <PrintPanel printSession={printSession} />}
        {tab === 'profile' && <SettingsPanel />}
        {tab === 'aiAssistant' && <AiAssistantPanel />}
        {tab === 'analytics' && <AnalyticsPanel />}
      </main>
      <BottomNav active={tab} onChange={handleTabChange} />
    </section>
  );
}
