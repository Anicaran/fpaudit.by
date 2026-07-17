import { FormEvent, useEffect, useState } from 'react';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import type { GoodsInfo, PriceLookupPreset, PrintDraft } from '../types';
import {
  displayLocalCode,
  formatGoodsCount,
  formatGoodsPrice,
  goodsCodeType,
  normalizeLocalCodeInput,
  padLocalCodeForApi,
} from '../utils';
import { ProductImage } from './ProductImage';
import { ScannerDialog } from './ScannerDialog';

interface Props {
  onGoPrint: (draft: PrintDraft) => void;
  preset?: PriceLookupPreset | null;
  onPresetConsumed?: () => void;
}

export function PricePanel({ onGoPrint, preset, onPresetConsumed }: Props) {
  const { session, api } = useSession();
  const { toast } = useToast();
  const [barcode, setBarcode] = useState('');
  const [localcode, setLocalcode] = useState('');
  const [result, setResult] = useState<GoodsInfo | null>(null);
  const [resultError, setResultError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  async function fetchGoodsInfo(searchBarcode: string, searchLocal: string): Promise<GoodsInfo> {
    if (!session?.sap) throw new Error('Укажите SAP в разделе «Профиль»');
    const bc = searchBarcode.trim();
    const lc = normalizeLocalCodeInput(searchLocal);
    const url = new URL('/api/goods/info', location.origin);
    url.searchParams.set('sap', session.sap);
    if (bc) {
      url.searchParams.set('code', bc);
      url.searchParams.set('codeType', goodsCodeType('barcode'));
    } else if (lc) {
      url.searchParams.set('code', padLocalCodeForApi(lc));
      url.searchParams.set('codeType', goodsCodeType('local'));
    } else {
      throw new Error('Введите штрих-код или локальный код');
    }
    return api<GoodsInfo>(url.pathname + url.search);
  }

  useEffect(() => {
    if (!preset) return;
    const nextBarcode = preset.barcode?.trim() || '';
    const nextLocal = preset.localcode?.trim() || '';
    if (!nextBarcode && !nextLocal) {
      onPresetConsumed?.();
      return;
    }
    setBarcode(nextBarcode);
    setLocalcode(nextLocal);
    setResult(null);
    setResultError('');
    setSearched(true);
    setLoading(true);
    void (async () => {
      try {
        const info = await fetchGoodsInfo(nextBarcode, nextLocal);
        setResult(info);
        const lc = displayLocalCode(info, nextLocal);
        if (lc) setLocalcode(lc);
        const bc = info.barcode || info.barcodes?.[0];
        if (bc) setBarcode(bc);
      } catch (ex) {
        const message = ex instanceof Error ? ex.message : String(ex);
        setResultError(message);
        toast(message, 'err');
      } finally {
        setLoading(false);
        onPresetConsumed?.();
      }
    })();
  }, [preset, onPresetConsumed, toast, session?.sap]);

  async function checkPrice(e?: FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setSearched(true);
    setResult(null);
    setResultError('');
    try {
      const info = await fetchGoodsInfo(barcode, localcode);
      setResult(info);
      const lc = displayLocalCode(info, localcode);
      if (lc) setLocalcode(lc);
      const bc = info.barcode || info.barcodes?.[0];
      if (bc) setBarcode(bc);
    } catch (ex) {
      const message = ex instanceof Error ? ex.message : String(ex);
      setResultError(message);
      toast(message, 'err');
    } finally {
      setLoading(false);
    }
  }

  function handleScan(code: string) {
    const cleaned = code.replace(/\D/g, '').slice(0, 20) || code.trim();
    if (!cleaned) {
      toast('Штрих-код не распознан', 'err');
      return;
    }
    setBarcode(cleaned);
    setLocalcode('');
    setLoading(true);
    setSearched(true);
    setResult(null);
    setResultError('');
    void (async () => {
      try {
        const info = await fetchGoodsInfo(cleaned, '');
        setResult(info);
        const lc = displayLocalCode(info, '');
        if (lc) setLocalcode(lc);
        const bc = info.barcode || (Array.isArray(info.barcodes) ? info.barcodes[0] : '');
        if (bc) setBarcode(String(bc));
        toast('Товар найден', 'ok');
      } catch (ex) {
        const message = ex instanceof Error ? ex.message : String(ex);
        setResultError(message);
        toast(message, 'err');
      } finally {
        setLoading(false);
      }
    })();
  }

  const lc = result ? displayLocalCode(result, localcode) : localcode;
  const bc = result?.barcode || result?.barcodes?.[0] || barcode.trim() || '—';
  const priceValue = result?.price ?? result?.cardPrice;

  return (
    <div className="panel active">
      <form className="card" onSubmit={checkPrice}>
        <p className="muted small">Введите штрих-код или локальный код — достаточно одного поля.</p>
        <label>
          Штрих-код
          <div className="input-row">
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              inputMode="numeric"
              placeholder="EAN-13"
            />
            <button type="button" className="btn icon" onClick={() => setScannerOpen(true)}>
              📷
            </button>
          </div>
        </label>
        <label>
          Локальный код
          <input
            value={localcode}
            onChange={(e) => {
              // Если вводим новый локальный код вручную, не используем старый штрих-код в поиске.
              setLocalcode(normalizeLocalCodeInput(e.target.value));
              setBarcode('');
            }}
            inputMode="numeric"
            placeholder="до 7 цифр"
          />
        </label>
        <button type="submit" className="btn primary block" disabled={loading}>
          {loading ? 'Загрузка…' : 'Узнать цену'}
        </button>
      </form>
      {searched && (
        <div className="card result">
          {loading ? (
            <span className="muted">Загрузка…</span>
          ) : resultError ? (
            <span className="error">{resultError}</span>
          ) : result ? (
            <>
              <div className="result-image-wrap">
                <ProductImage
                  key={`${lc}-${bc}`}
                  info={result}
                  fallbackLocal={localcode}
                  fallbackBarcode={barcode}
                  alt={result.name || 'Товар'}
                  className="result-product-image"
                  placeholderClassName="result-product-image placeholder"
                />
              </div>
              <div>
                <strong>{result.name || '—'}</strong>
              </div>
              <div className="price-big">
                {priceValue != null && priceValue !== '' ? `${formatGoodsPrice(priceValue)} ₽` : '—'}
              </div>
              {result.cardPrice != null && result.price != null && result.cardPrice !== result.price ? (
                <div className="muted">Цена по карте: {formatGoodsPrice(result.cardPrice)} ₽</div>
              ) : null}
              <div className="muted">Штрих-код: {bc}</div>
              <div className="muted">Лок. код: {lc || '—'}</div>
              <div className="muted">Остаток: {formatGoodsCount(result.leftover)}</div>
              {result.quantity != null && result.quantity !== '' ? (
                <div className="muted">Кратность: {formatGoodsCount(result.quantity)}</div>
              ) : null}
              <div className="result-actions">
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    onGoPrint({ localcode: lc, name: result.name || '' });
                    toast('Данные перенесены в печать', 'ok');
                  }}
                >
                  Печать ценника
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}
      <ScannerDialog open={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={handleScan} />
    </div>
  );
}
