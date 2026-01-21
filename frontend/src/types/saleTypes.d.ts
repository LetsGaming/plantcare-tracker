interface Sale {
  id: string;
  name: string;
  nameFull: string;
  seller: string;
  price: number;
  oldPrice: number;
  link: string;
  imageUrl?: string;
  isNew?: boolean;
}

interface SaleClientMeta {
  id: string;
  lastSeenPrice: number;
  lastSeenAt: number;
}

interface PricePoint {
  price: number;
  timestamp: number;
}

interface SalesCache {
  data: Sale[];
  meta: Record<string, SaleClientMeta>;
  timestamp: number;
}

interface PriceHistoryCache {
  [saleId: string]: PricePoint[];
}

interface APISale {
  sale_id: string;
  sale_name: string;
  sale_name_full: string;
  sale_seller: string;
  sale_new_price: number;
  sale_old_price: number;
  sale_link: string;
  sale_image_url?: string;
}
