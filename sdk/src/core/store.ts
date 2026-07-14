/**
 * 스토어 — 공개(config/상품/약관) + 회원(주문 결제/내 주문).
 * 카드 결제: prepare→(앱이 토스 위젯)→confirm. config.toss_client_key 로 앱이 위젯 호출.
 * 주의: 통신판매중개 특성상 모든 페이지 푸터에 중개업자 고지 필수(스킬 store 표면 규약).
 */
import { request } from "./http";
import { getProjectId } from "./config";

export interface StoreConfig {
  store_enabled: boolean;
  toss_client_key?: string;
  [key: string]: unknown;
}
export interface Product {
  id: string;
  name: string;
  price: number;
  is_active?: boolean;
  [key: string]: unknown;
}

// ── 공개 조회 ──
export const getStoreConfig = () =>
  request<StoreConfig>(`/public/store/${getProjectId()}/config`);
export const listProducts = (params: Record<string, string> = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request<{ items: Product[]; [k: string]: unknown }>(
    `/public/store/${getProjectId()}/products${qs ? `?${qs}` : ""}`
  );
};
export const listCategories = () =>
  request(`/public/store/${getProjectId()}/categories`);
export const getProduct = (productId: string) =>
  request<Product>(`/public/store/${getProjectId()}/products/${productId}`);
export const getStoreTerms = () =>
  request(`/public/store/${getProjectId()}/terms`);

// ── 회원: 결제 준비(주문 미생성) → 앱이 토스 위젯 호출 ──
export const prepareOrder = (productId: string, quantity: number) =>
  request<{ order_no: string; amount: number; order_name: string }>(`/store/orders/prepare`, {
    method: "POST",
    body: { product_id: productId, quantity, terms_agreed: true },
  });

// ── 회원: 결제 승인 = 주문 생성 ──
export const confirmOrder = (data: {
  order_no: string;
  payment_key: string;
  amount: number;
  product_id: string;
  quantity: number;
}) => request(`/store/orders/confirm`, { method: "POST", body: data });

// ── 회원: 내 주문 ──
export const listMyOrders = (params: Record<string, string> = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/store/orders/me${qs ? `?${qs}` : ""}`);
};
export const getOrder = (orderId: string) => request(`/store/orders/${orderId}`);
export const confirmPurchase = (orderId: string) =>
  request(`/store/orders/${orderId}/confirm`, { method: "POST" });
export const cancelOrder = (orderId: string, reason: string) =>
  request(`/store/orders/${orderId}/cancel`, { method: "POST", body: { reason } });
