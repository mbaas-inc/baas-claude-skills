/** 결제 공통 표면 — 결제가 들어가는 모든 흐름에서 공유(표준 구매약관 조회 · 커스텀 결제 위젯). 규약은 스킬 참조. */
import { BaasError, request } from "./http";
import { getProjectId } from "./config";
import { renderPaymentWidget } from "./toss";

export interface PurchaseTerms {
  version: string;
  title: string;
  content: string;
  [key: string]: unknown;
}

/** 표준 구매약관 조회(프로젝트 공통) — 결제 진입 전 content 표시 + 동의용. */
export const getPurchaseTerms = () =>
  request<PurchaseTerms>(`/public/store/${getProjectId()}/terms`);

// ── 커스텀 결제(위젯) — 커스텀 백엔드가 만든 결제 세션으로 위젯을 띄운다 (aiapp-service#900) ──

/**
 * 커스텀 백엔드(serverFn)가 서버 SDK `payments.create` 로 만든 결제 세션 — 응답을 그대로 넘긴다.
 * 금액·주문번호·키는 서버가 정한 값이다. 앱이 금액을 만들어 넣지 않는다(위젯 금액을 바꿔도 승인에서 거절된다).
 */
export interface CustomPaymentSession {
  order_no: string;
  amount: number;
  client_key: string;
  item_name?: string | null;
  /** "test" 면 테스트 결제(실제 청구 없음). 화면에 「테스트 결제」 안내를 띄울 때 쓴다. */
  payment_mode?: "test" | "live";
}
export interface PaymentWidgetParams {
  /** 결제수단 위젯을 렌더할 앱 DOM 셀렉터. */
  methodsSelector: string;
  /** 약관 위젯을 렌더할 셀렉터. */
  agreementSelector: string;
  customerKey?: string;
}
export interface CustomPaymentWidgetHandle {
  orderNo: string;
  amount: number;
  paymentMode: "test" | "live";
  /** 결제 버튼 클릭 시 **동기로** 호출한다(앞에 await 금지 — 현대카드 등 팝업 결제창의 사용자 제스처 유지).
   *  성공하면 successUrl 로 이동하고 USER_CANCEL 은 throw. */
  requestPayment(opts: {
    successUrl: string;
    failUrl: string;
    orderName?: string;
    customerName?: string;
    customerEmail?: string;
  }): Promise<void>;
}

/**
 * 커스텀 결제 위젯 — serverFn 이 만든 세션(`payments.create` 응답)으로 결제수단/약관 위젯을 앱 DOM 에 렌더한다.
 * 승인은 **브라우저가 하지 않는다.** successUrl 로 돌아오면 `getPaymentRedirectResult()` 로 읽은
 * orderNo·paymentKey·amount 를 serverFn 에 넘기고, serverFn 이 `payments.confirm` 후 자기 원장을 확정한다.
 */
export async function beginPaymentWidget(
  session: CustomPaymentSession,
  params: PaymentWidgetParams
): Promise<CustomPaymentWidgetHandle> {
  if (!session || !session.order_no || session.amount == null) {
    throw new BaasError(
      "결제 세션이 올바르지 않습니다(order_no/amount 누락) — serverFn 의 payments.create 응답을 그대로 넘기세요.",
      "PAYMENT_SESSION_INVALID",
      400
    );
  }
  const widget = await renderPaymentWidget({
    clientKey: session.client_key,
    amount: session.amount,
    methodsSelector: params.methodsSelector,
    agreementSelector: params.agreementSelector,
    customerKey: params.customerKey,
  });
  return {
    orderNo: session.order_no,
    amount: session.amount,
    paymentMode: session.payment_mode ?? "test",
    requestPayment: (opts) =>
      widget.requestPayment({
        orderId: session.order_no,
        orderName: opts.orderName ?? session.item_name ?? "결제",
        successUrl: opts.successUrl,
        failUrl: opts.failUrl,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
      }),
  };
}

/** 결제 복귀 결과 — successUrl 이면 ok=true(승인 전이다), failUrl 이면 ok=false(code·message). */
export type PaymentRedirectResult =
  | { ok: true; orderNo: string; paymentKey: string; amount: number }
  | { ok: false; orderNo: string | null; code: string; message: string };

/**
 * successUrl / failUrl 복귀 페이지에서 토스 쿼리를 읽는다. 토스 쿼리가 없으면 null.
 * ok=true 여도 **아직 결제 완료가 아니다** — serverFn 에 넘겨 `payments.confirm` 이 PAID 를 돌려줘야 완료다.
 */
export function getPaymentRedirectResult(search?: string): PaymentRedirectResult | null {
  const raw = search ?? (typeof window !== "undefined" ? window.location.search : "");
  const q = new URLSearchParams(raw);
  const orderNo = q.get("orderId");
  const paymentKey = q.get("paymentKey");
  const amount = q.get("amount");
  if (orderNo && paymentKey && amount) {
    return { ok: true, orderNo, paymentKey, amount: Number(amount) };
  }
  const code = q.get("code");
  if (code) {
    return { ok: false, orderNo, code, message: q.get("message") ?? "결제가 완료되지 않았습니다." };
  }
  return null;
}
