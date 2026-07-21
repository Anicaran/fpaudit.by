export interface Session {
  token: string;
  serverHost: string;
  deviceUid: string;
  sap: string;
  shopId?: number;
  shopLabel?: string;
  username?: string;
  userId?: number;
}

export interface Shop {
  id: number;
  sap?: string;
  sapCode?: string;
  locality?: string;
  address?: string;
  name?: string;
}

export interface TaskResponse {
  id?: number;
  responseId?: number;
  version?: number;
  childVersion?: number;
  status?: string;
  myStatus?: string;
  taskStatus?: string;
  executorName?: string;
  comment?: string;
  expirationDateGoods?: ExpirationGoodItem[];
}

export interface Task {
  id: number;
  version?: number;
  name?: string;
  description?: string;
  status?: string;
  myStatus?: string;
  taskType?: string;
  deadlineDate?: number | string;
  executorName?: string;
  overdue?: boolean;
  childTaskId?: number;
  responseList?: TaskResponse[];
}

export interface GoodsInfo {
  name?: string;
  price?: number | string;
  cardPrice?: number | string;
  localcode?: string;
  localCode?: string;
  barcode?: string;
  barcodes?: string[];
  leftover?: number | string | null;
  quantity?: number | string | null;
  image?: string | null;
}

export type ExpirationSellStatus = 'sold' | 'unsold' | null;

export interface ExpirationGoodItem {
  orderNumber: number;
  localcode: string;
  name?: string;
  expirationDate?: string | null;
  orderDate?: string | null;
  countWriteOff?: number | null;
  image?: string | null;
  sellStatus?: ExpirationSellStatus;
}

export interface RecountGoodItem {
  localcode: string;
  name?: string;
  leftover?: number | null;
  inShop?: number | null;
  inStock?: number | null;
  quantity?: number | null;
  image?: string | null;
}

export interface UnsoldGoodItem {
  id: number;
  localcode: string;
  name?: string;
  daysWithoutSales?: number | null;
  quantity?: number | null;
  lastDeliveryDate?: string | null;
  recount?: number | null;
  comment?: string | null;
  image?: string | null;
}

export interface PrintQueueItem {
  id: string;
  localCodeFrom: string;
  localCodeTo?: string;
  productName: string;
  priceTagType: string;
  copyCount: number;
  modifiedFrom?: string | null;
  modifiedTo?: string | null;
}

export interface PrintWorkSession {
  inStock: boolean;
  jobType: string;
  items: PrintQueueItem[];
}

export interface PrintJobElement {
  localCodeFrom?: string;
  localCodeTo?: string;
  productName?: string;
  priceTagType?: string;
  copyCount?: number;
  modifiedFrom?: string | null;
  modifiedTo?: string | null;
}

export interface PrintJobSummary {
  id?: number;
  jobType?: string;
  type?: string;
  status?: string;
  createDate?: string | number;
}

export interface PrintJobDetail {
  id?: number;
  sap?: string;
  jobType?: string;
  inStock?: boolean;
  createDate?: string | number;
  elements?: PrintJobElement[];
}

export interface PrintSubmitPayload {
  sap: string;
  jobType: string;
  inStock: boolean;
  elements: Array<{
    localCodeFrom: string | null;
    localCodeTo: string | null;
    productName: string | null;
    priceTagType: string | null;
    copyCount: number;
    modifiedFrom?: string | null;
    modifiedTo?: string | null;
  }>;
}

export interface PrintDraft {
  localcode: string;
  name: string;
}

export type TabId =
  | 'tasks'
  | 'tags'
  | 'home'
  | 'print'
  | 'profile'
  | 'productSearch'
  | 'aiAssistant'
  | 'analytics'
  | 'calendar';

export interface ProductSearchResult {
  product_id?: number;
  productId?: number;
  title?: string;
  image_url?: string;
  imageUrl?: string;
  score?: number;
  sku?: string;
  brand?: string;
}

export interface ProductSearchResponse {
  query_id?: string;
  queryId?: string;
  results?: ProductSearchResult[];
  total_found?: number;
  totalFound?: number;
  search_time_ms?: number;
  searchTimeMs?: number;
}

export interface FeatureUrlResponse {
  available: boolean;
  url: string | null;
  reason: string | null;
}

export interface PriceLookupPreset {
  localcode?: string;
  barcode?: string;
}
