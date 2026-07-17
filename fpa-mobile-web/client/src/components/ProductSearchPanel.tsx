import { ChangeEvent, useRef, useState } from 'react';
import { apiUpload } from '../api';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import type { ProductSearchResponse, ProductSearchResult } from '../types';
import { goodsImageProxyUrl, padLocalCodeForApi } from '../utils';

interface Props {
  onOpenProduct: (localcode: string, title?: string) => void;
}

type SearchItem = ProductSearchResult & {
  localcode?: string | number;
  localCode?: string | number;
  id?: string | number;
  image?: string;
  thumbnail?: string;
  thumbUrl?: string;
};

function resultId(item: SearchItem): string {
  const id =
    item.product_id ?? item.productId ?? item.localcode ?? item.localCode ?? item.id;
  return id != null ? String(id) : '';
}

function resultImage(item: SearchItem): string | undefined {
  const direct = item.image_url ?? item.imageUrl ?? item.image ?? item.thumbnail ?? item.thumbUrl;
  if (direct) return String(direct);
  const id = resultId(item);
  return id ? goodsImageProxyUrl(id) || undefined : undefined;
}

function resultScorePercent(score: number | undefined): number | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score > 1) return Math.round(Math.min(score, 100));
  return Math.round(score * 100);
}

function extractRawResults(data: ProductSearchResponse | SearchItem[] | Record<string, unknown>): SearchItem[] {
  if (Array.isArray(data)) return data as SearchItem[];
  if (!data || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  const list = obj.results ?? obj.items ?? obj.products ?? obj.content;
  return Array.isArray(list) ? (list as SearchItem[]) : [];
}

function normalizeResults(data: ProductSearchResponse | SearchItem[] | Record<string, unknown>): SearchItem[] {
  return extractRawResults(data).filter((item) => !!resultId(item));
}

export function ProductSearchPanel({ onOpenProduct }: Props) {
  const { session } = useSession();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searched, setSearched] = useState(false);

  function revokePreview(url: string | null) {
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
  }

  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Выберите изображение', 'err');
      return;
    }
    revokePreview(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setResults([]);
    setSearched(false);
  }

  function clearPhoto() {
    revokePreview(previewUrl);
    setPreviewUrl(null);
    setSelectedFile(null);
    setResults([]);
    setSearched(false);
  }

  async function searchByPhoto() {
    if (!session || !selectedFile) {
      toast('Сначала выберите фото', 'err');
      return;
    }
    setLoading(true);
    setSearched(true);
    setResults([]);
    try {
      const form = new FormData();
      form.append('file', selectedFile, selectedFile.name);
      const data = await apiUpload<ProductSearchResponse>(
        session,
        '/api/product-search/by-image?limit=40',
        form,
      );
      const items = normalizeResults(data);
      setResults(items);
      if (!items.length) toast('Похожие товары не найдены', 'err');
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : String(ex), 'err');
    } finally {
      setLoading(false);
    }
  }

  async function openResult(item: SearchItem) {
    const localcode = resultId(item);
    if (!localcode) return;
    onOpenProduct(padLocalCodeForApi(localcode), item.title);
  }

  return (
    <div className="panel active product-search-panel">
      <div className="card">
        <h3 className="card-title">Поиск по фото</h3>
        <p className="muted small">Сфотографируйте товар или выберите снимок из галереи.</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden-input"
          onChange={onPickFile}
        />
        <div className="row-actions product-search-actions">
          <button type="button" className="btn primary" onClick={() => fileInputRef.current?.click()}>
            {previewUrl ? 'Другое фото' : 'Выбрать фото'}
          </button>
          {previewUrl ? (
            <button type="button" className="btn" onClick={clearPhoto}>
              Очистить
            </button>
          ) : null}
        </div>
        {previewUrl ? (
          <div className="product-search-preview-wrap">
            <img src={previewUrl} alt="Выбранное фото" className="product-search-preview" />
          </div>
        ) : null}
        <button
          type="button"
          className="btn primary block"
          disabled={!selectedFile || loading}
          onClick={() => void searchByPhoto()}
        >
          {loading ? 'Поиск…' : 'Найти товар'}
        </button>
      </div>

      {searched && !loading && results.length === 0 ? (
        <div className="card muted">Ничего не найдено. Попробуйте другой ракурс или освещение.</div>
      ) : null}

      {results.length > 0 ? (
        <div className="card product-search-results">
          <h3 className="card-title">Результаты ({results.length})</h3>
          <ul className="product-search-list">
            {results.map((item) => {
              const id = resultId(item);
              const image = resultImage(item);
              const score = resultScorePercent(item.score);
              return (
                <li key={`${id}-${item.title || ''}`}>
                  <button type="button" className="product-search-item" onClick={() => void openResult(item)}>
                    {image ? (
                      <img src={image} alt="" className="product-search-thumb" loading="lazy" />
                    ) : (
                      <span className="product-search-thumb placeholder">нет фото</span>
                    )}
                    <span className="product-search-meta">
                      <strong>{item.title || `Товар ${id}`}</strong>
                      <span className="muted small">
                        Код {id}
                        {item.sku ? ` · SKU ${item.sku}` : ''}
                        {score != null ? ` · ${score}%` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
