/**
 * 스토어 — 공개(config/상품/약관) + 회원(주문 결제/내 주문).
 * 결제(위젯): prepare→(앱이 토스 위젯, 결제수단 선택)→confirm. config.toss_client_key 로 앱이 위젯 호출.
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

// ── 회원: 결제 준비(위젯 금액용, 주문·세션 미생성) → 앱이 토스 위젯 호출 ──
export const prepareOrder = (productId: string, quantity: number) =>
  request<{ order_no: string; amount: number; order_name: string }>(`/store/orders/prepare`, {
    method: "POST",
    body: { product_id: productId, quantity, terms_agreed: true },
  });

// ── 회원: 결제 개시("결제하기" 클릭 시점) → 결제 세션(CREATED) + 주문(PENDING) 생성, order_no 발급 ──
// 위젯 열기(prepare)엔 만들지 않고, 실제 결제 요청 시점에만 세션을 만든다(미결제 세션 노이즈 방지).
// 반환 order_no 를 토스 orderId 로 쓴다 → 카드 confirm(동기) / 가상계좌 웹훅(비동기)이 이 세션을 완결.
export const startOrder = (productId: string, quantity: number) =>
  request<{ order_no: string; amount: number; order_name: string }>(`/store/orders/checkout/start`, {
    method: "POST",
    body: { product_id: productId, quantity, terms_agreed: true },
  });

// ── 회원: 결제 승인 = 주문 생성 ──
// 백엔드 /store/orders/confirm 계약과 1:1: order_no(prepare 응답의 order_no = 토스 orderId)·payment_key·
// amount·product_id·quantity·terms_agreed(필수). terms_agreed 는 위젯 결제가 동의 게이트 통과 후 진입 +
// prepare 도 terms_agreed:true 검증이라 기본 true(호출부가 명시 시 그 값 사용). store 는 order_no 로 일관.
export const confirmOrder = (data: {
  order_no: string;
  payment_key: string;
  amount: number;
  product_id: string;
  quantity: number;
  terms_agreed?: boolean;
}) =>
  request(`/store/orders/confirm`, {
    method: "POST",
    body: {
      order_no: data.order_no,
      payment_key: data.payment_key,
      amount: data.amount,
      product_id: data.product_id,
      quantity: data.quantity,
      terms_agreed: data.terms_agreed ?? true,
    },
  });

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
const STORE_CHECKOUT_CTX = "baas_store_checkout_ctx";

/** 결제 복귀 페이지에서 confirm 에 필요한 컨텍스트(order_no/상품·수량). start 시점에 저장된다. */
export interface StoreCheckoutContext {
  order_no: string;
  product_id: string;
  quantity: number;
}
export function getStoreCheckoutContext(): StoreCheckoutContext | null {
  try {
    const raw = sessionStorage.getItem(STORE_CHECKOUT_CTX);
    return raw ? (JSON.parse(raw) as StoreCheckoutContext) : null;
  } catch {
    return null;
  }
}
export function clearStoreCheckoutContext(): void {
  try {
    sessionStorage.removeItem(STORE_CHECKOUT_CTX);
  } catch {
    /* noop */
  }
}

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
  /** 사용자가 결제 버튼을 누를 때 호출 — 성공 시 successUrl 로 리다이렉트, USER_CANCEL 은 throw.
   *  ⚠ 반드시 클릭 핸들러 안에서 **동기로** 호출한다(앞에 await 를 두지 말 것) — 현대카드 등 팝업/앱카드
   *  결제창은 사용자 제스처가 끊기면 안 뜬다. 그래서 세션/주문(order_no)은 결제 요청 전에 미리 만들어 둔다. */
  requestPayment(opts: {
    successUrl: string;
    failUrl: string;
    orderName?: string;
    customerName?: string;
    customerEmail?: string;
  }): Promise<void>;
}

/**
 * 스토어 결제위젯 시작 — `getStoreConfig()` 로 위젯 키를 얻고 `startOrder()` 로 결제 세션(CREATED)+주문(PENDING)을
 * 만들어 order_no·금액을 서버 확정한 뒤 결제수단/약관 위젯을 앱 DOM(셀렉터)에 렌더한다. 반환 handle 을 앱이
 * 보관했다가 결제 버튼 클릭 시 `handle.requestPayment(...)` 를 **동기로** 호출한다(클릭~요청 사이에 비동기 작업을
 * 넣지 않는다 — 현대카드 등 팝업 결제창의 사용자 제스처 유지). 세션/주문은 이 위젯 진입 시점(보통 약관 동의 후)에
 * 만들어지고, 결제까지 안 간 미완료는 서버 정리 배치가 만료시킨다.
 *
 * 복귀 페이지에서는 `getStoreCheckoutContext()`(order_no/product_id/quantity) 또는 successUrl 쿼리(orderId)와
 * 토스 쿼리(paymentKey/amount)를 합쳐 `confirm({ order_no, payment_key, amount, product_id, quantity })` 후
 * `clearStoreCheckoutContext()`. 카드는 이 confirm(동기)이, 가상계좌는 입금 웹훅(비동기)이 결제를 완결한다.
 * `toss_client_key` 는 위젯 키(gck_).
 */
export async function beginStoreWidgetCheckout(
  params: StoreWidgetCheckoutParams
): Promise<StoreWidgetHandle> {
  const cfg = await getStoreConfig();
  const clientKey = cfg.toss_client_key;
  if (!clientKey) {
    throw new BaasError("스토어 결제 설정이 없습니다(toss_client_key 미설정).", "STORE_NOT_CONFIGURED", 400);
  }
  // 결제 세션+주문(PENDING)을 위젯 진입 시점에 생성 → order_no 확보(클릭 시 동기 requestPayment 위해).
  const started = await startOrder(params.productId, params.quantity);
  try {
    sessionStorage.setItem(
      STORE_CHECKOUT_CTX,
      JSON.stringify({
        order_no: started.order_no,
        product_id: params.productId,
        quantity: params.quantity,
      })
    );
  } catch {
    /* sessionStorage 불가 환경이면 앱이 successUrl 쿼리로 대체 전달해야 함 */
  }
  const widget = await renderPaymentWidget({
    clientKey,
    amount: started.amount,
    methodsSelector: params.methodsSelector,
    agreementSelector: params.agreementSelector,
    customerKey: params.customerKey,
  });
  return {
    amount: started.amount,
    orderNo: started.order_no,
    // 동기 호출 — 클릭 제스처 유지(현대카드 등 팝업 결제창). start 는 위에서 이미 끝남.
    requestPayment: (opts) =>
      widget.requestPayment({
        orderId: started.order_no,
        orderName: opts.orderName ?? started.order_name,
        successUrl: opts.successUrl,
        failUrl: opts.failUrl,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
      }),
  };
}
