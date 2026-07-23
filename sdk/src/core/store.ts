/**
 * 스토어 — 공개(config/상품/약관) + 회원(주문 결제/내 주문).
 * 카드 결제: prepare→(앱이 토스 위젯)→confirm. config.toss_client_key 로 앱이 위젯 호출.
 * 주의: 통신판매중개 특성상 모든 페이지 푸터에 중개업자 고지 필수(스킬 store 표면 규약).
 */
import { request, BaasError } from "./http";
import { getProjectId } from "./config";
import { requestCardPayment, loadTossPayments } from "./toss";

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

// ── 회원: 카드결제 원스톱(config → prepare → 토스 결제창) ──
export interface StoreCheckoutOptions {
  /** 결제 성공 시 복귀 경로(평면 경로 권장: /checkout-success). 토스가 paymentKey/orderId/amount 쿼리를 붙여 리다이렉트한다. */
  successUrl: string;
  /** 결제 실패/취소 시 복귀 경로(예: /checkout-fail). */
  failUrl: string;
  /** 비회원/게스트면 생략(토스 ANONYMOUS 사용). 회원이면 계정 식별자 전달 권장. */
  customerKey?: string;
  customerName?: string;
  customerEmail?: string;
}

/**
 * 스토어 카드결제를 SDK가 원스톱으로 처리한다: `getStoreConfig()` → `prepareOrder()` → 토스 결제창 호출.
 * 앱은 토스 SDK 로드/버전/키 타입을 몰라도 된다(이 함수가 v2 `payment().requestPayment()` 로 고정).
 *
 * 성공 시 브라우저가 `successUrl` 로 리다이렉트되며(paymentKey/orderId/amount 쿼리 포함), 복귀 페이지에서
 * `confirmOrder({ order_no, payment_key, amount, product_id, quantity })` 를 호출해 승인을 완료한다.
 * 사용자가 결제창을 닫으면 `code === "USER_CANCEL"` 인 에러가 throw 되므로 앱에서 무시 처리할 수 있다.
 */
export async function startStoreCheckout(
  productId: string,
  quantity: number,
  opts: StoreCheckoutOptions
): Promise<void> {
  const cfg = await getStoreConfig();
  const clientKey = cfg.toss_client_key;
  if (!clientKey) {
    throw new BaasError(
      "스토어 결제 설정이 없습니다(toss_client_key 미설정).",
      "STORE_NOT_CONFIGURED",
      400
    );
  }
  const prepared = await prepareOrder(productId, quantity);
  await requestCardPayment(clientKey, {
    amount: prepared.amount,
    orderId: prepared.order_no,
    orderName: prepared.order_name,
    successUrl: opts.successUrl,
    failUrl: opts.failUrl,
    customerKey: opts.customerKey,
    customerName: opts.customerName,
    customerEmail: opts.customerEmail,
  });
}

// ── 회원: 위젯(인라인) 결제 — 앱 화면 안에서 결제(뒤로가기 유지). config.toss_client_key 가 gck_ 일 때 사용 ──
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
 * 위젯 결제 시작 — `prepareOrder` 로 금액을 서버 확정한 뒤 결제수단/약관 위젯을 앱 DOM 에 렌더한다.
 * 반환된 handle 을 앱이 보관했다가, 결제 버튼 클릭 시 `handle.requestPayment(...)` 를 호출한다.
 * `toss_client_key` 가 결제위젯 키(gck_)여야 한다(개별연동 키 ck_ 는 `startStoreCheckout`(리다이렉트) 사용).
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
  const TossPayments = await loadTossPayments();
  const widgets = TossPayments(clientKey).widgets({
    customerKey: params.customerKey ?? TossPayments.ANONYMOUS,
  });
  await widgets.setAmount({ currency: "KRW", value: prepared.amount });
  await Promise.all([
    widgets.renderPaymentMethods({ selector: params.methodsSelector, variantKey: "DEFAULT" }),
    widgets.renderAgreement({ selector: params.agreementSelector, variantKey: "AGREEMENT" }),
  ]);
  return {
    amount: prepared.amount,
    orderNo: prepared.order_no,
    requestPayment: (opts) =>
      widgets.requestPayment({
        orderId: prepared.order_no,
        orderName: opts.orderName ?? prepared.order_name,
        successUrl: opts.successUrl,
        failUrl: opts.failUrl,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
      }),
  };
}
