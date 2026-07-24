/**
 * 스토어 — 공개(config/상품/약관) + 회원(주문 결제/내 주문).
 * 카드 결제: prepare→(앱이 토스 위젯)→confirm. config.toss_client_key 로 앱이 위젯 호출.
 * 주의: 통신판매중개 특성상 모든 페이지 푸터에 중개업자 고지 필수(스킬 store 표면 규약).
 */
import { request, BaasError } from "./http";
import { getProjectId } from "./config";
import { renderPaymentWidget } from "./toss";

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
export const listProducts = async (
  params: Record<string, string> = {}
): Promise<{ items: Product[] }> => {
  const qs = new URLSearchParams(params).toString();
  // 상품 목록 엔드포인트는 envelope.data 를 "맨 배열"로 주는 경우와 { items } 로 주는 경우가
  // 섞여 있다(백엔드 버전차). 소비 측(useStore)이 항상 { items } 로 다룰 수 있게 여기서 정규화한다.
  const d = await request<unknown>(`/public/store/${getProjectId()}/products${qs ? `?${qs}` : ""}`);
  const items = Array.isArray(d)
    ? (d as Product[])
    : (((d as { items?: Product[]; data?: Product[] } | null)?.items ??
        (d as { items?: Product[]; data?: Product[] } | null)?.data) ??
      []);
  return { items };
};
export const listCategories = () =>
  request(`/public/store/${getProjectId()}/categories`);
export const getProduct = (productId: string) =>
  request<Product>(`/public/store/${getProjectId()}/products/${productId}`);
// 구매약관 조회는 결제 공통 표면으로 이동 → core/payment.ts getPurchaseTerms (usePayment().fetchTerms)

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

// ── 회원: 결제위젯(인라인) — 앱 화면 안에서 결제(뒤로가기 유지). 결제는 위젯 방식으로 통일 ──
export interface StoreWidgetCheckoutParams {
  productId: string;
  quantity: number;
  /** 결제수단 위젯을 렌더할 앱 DOM 셀렉터(예: "#toss-payment-methods"). */
  methodsSelector: string;
  /** 약관 위젯을 렌더할 셀렉터(예: "#toss-agreement"). */
  agreementSelector: string;
  customerKey?: string;
}
export interface StoreWidgetHandle {
  amount: number;
  orderNo: string;
  /** 사용자가 결제 버튼을 누를 때 호출 — 성공 시 successUrl 로 리다이렉트, USER_CANCEL 은 throw. */
  requestPayment(opts: {
    successUrl: string;
    failUrl: string;
    orderName?: string;
    customerName?: string;
    customerEmail?: string;
  }): Promise<void>;
}

/**
 * 스토어 결제위젯 시작 — `getStoreConfig()` 로 위젯 키를 얻고 `prepareOrder()` 로 금액을 서버 확정한 뒤,
 * 결제수단/약관 위젯을 앱 DOM(셀렉터)에 렌더한다. 반환 handle 을 앱이 보관했다가 결제 버튼 클릭 시
 * `handle.requestPayment({ successUrl, failUrl })` 호출 → 성공 시 successUrl 로 리다이렉트(paymentKey/
 * orderId/amount 쿼리 포함), 복귀 페이지에서 `confirm({ order_no, payment_key, amount, product_id, quantity })`.
 * 결제수단 선택 UI가 앱 화면 안에 있어 결제 도중 뒤로가기가 유지된다. `toss_client_key` 는 결제위젯 키(gck_)여야 한다.
 */
export async function beginStoreWidgetCheckout(
  params: StoreWidgetCheckoutParams
): Promise<StoreWidgetHandle> {
  const cfg = await getStoreConfig();
  const clientKey = cfg.toss_client_key;
  if (!clientKey) {
    throw new BaasError("스토어 결제 설정이 없습니다(toss_client_key 미설정).", "STORE_NOT_CONFIGURED", 400);
  }
  const prepared = await prepareOrder(params.productId, params.quantity);
  const widget = await renderPaymentWidget({
    clientKey,
    amount: prepared.amount,
    methodsSelector: params.methodsSelector,
    agreementSelector: params.agreementSelector,
    customerKey: params.customerKey,
  });
  return {
    amount: prepared.amount,
    orderNo: prepared.order_no,
    requestPayment: (opts) =>
      widget.requestPayment({
        orderId: prepared.order_no,
        orderName: opts.orderName ?? prepared.order_name,
        successUrl: opts.successUrl,
        failUrl: opts.failUrl,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
      }),
  };
}
