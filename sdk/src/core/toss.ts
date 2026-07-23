/**
 * 토스페이먼츠 v2(standard) 결제위젯 로더 + 공용 렌더 프리미티브.
 *
 * mBaaS 결제는 **결제위젯(인라인)** 방식으로 통일한다 — 결제수단/약관 UI를 앱 DOM 에 렌더하므로
 * 결제 중에도 앱 화면(헤더·뒤로가기)이 유지된다. `toss_client_key` 는 결제위젯 키(`test_gck_/live_gck_`)
 * 여야 하며, SDK 가 v2 `widgets()` 를 이 한 곳에서 캡슐화한다(앱은 토스 SDK/버전/키타입을 몰라도 됨).
 */

import { BaasError } from "./http";

const TOSS_SDK_URL = "https://js.tosspayments.com/v2/standard";

export interface TossWidgetRequestPaymentParams {
  orderId: string;
  orderName: string;
  successUrl: string;
  failUrl: string;
  customerName?: string;
  customerEmail?: string;
}
/** 위젯(인라인) — 결제수단/약관을 앱 DOM 에 렌더한 뒤 requestPayment. 앱 화면을 벗어나지 않아 뒤로가기가 유지된다. */
export interface TossWidgetsInstance {
  setAmount(amount: { currency: string; value: number }): Promise<void>;
  renderPaymentMethods(opts: { selector: string; variantKey?: string }): Promise<unknown>;
  renderAgreement(opts: { selector: string; variantKey?: string }): Promise<unknown>;
  requestPayment(params: TossWidgetRequestPaymentParams): Promise<void>;
}
export interface TossPaymentsInstance {
  widgets(options: { customerKey: string }): TossWidgetsInstance;
}
export interface TossPaymentsCtor {
  (clientKey: string): TossPaymentsInstance;
  ANONYMOUS: string;
}

let tossPromise: Promise<TossPaymentsCtor> | null = null;

/** 토스 v2 SDK 스크립트를 1회 로드하고 window.TossPayments 생성자를 반환한다. */
export function loadTossPayments(): Promise<TossPaymentsCtor> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("토스 결제는 브라우저 환경에서만 사용할 수 있습니다."));
  }
  const w = window as unknown as { TossPayments?: TossPaymentsCtor };
  if (w.TossPayments) return Promise.resolve(w.TossPayments);
  if (tossPromise) return tossPromise;

  tossPromise = new Promise<TossPaymentsCtor>((resolve, reject) => {
    const settle = () => {
      if (w.TossPayments) resolve(w.TossPayments);
      else reject(new Error("토스 결제 SDK를 초기화하지 못했습니다."));
    };
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TOSS_SDK_URL}"]`);
    if (existing) {
      existing.addEventListener("load", settle);
      existing.addEventListener("error", () =>
        reject(new Error("토스 결제 SDK 로드에 실패했습니다.")),
      );
      return;
    }
    const script = document.createElement("script");
    script.src = TOSS_SDK_URL;
    script.async = true;
    script.onload = settle;
    script.onerror = () => reject(new Error("토스 결제 SDK 로드에 실패했습니다."));
    document.head.appendChild(script);
  });
  return tossPromise;
}

/**
 * 결제위젯 공용 프리미티브 — clientKey·금액·컨테이너 셀렉터만 주면 결제수단/약관 위젯을 앱 DOM 에 렌더하고,
 * 결제 버튼에서 호출할 `requestPayment` 를 가진 handle 을 돌려준다. store/reservation 이 각자의 prepare 로
 * 주문(금액·orderId·clientKey)을 만든 뒤 이 함수를 호출한다.
 * (SDK 내부 전용 — 백엔드 prepare 없이 단독 호출하면 주문 없는 결제가 되므로 공개 표면으로 노출하지 않는다.)
 */
export interface WidgetRenderParams {
  clientKey: string;
  amount: number;
  methodsSelector: string;
  agreementSelector: string;
  customerKey?: string;
}
export interface PaymentWidgetHandle {
  requestPayment(params: TossWidgetRequestPaymentParams): Promise<void>;
}
export async function renderPaymentWidget(params: WidgetRenderParams): Promise<PaymentWidgetHandle> {
  if (!params.clientKey) {
    throw new BaasError("결제 클라이언트 키가 없습니다(toss client key).", "TOSS_CLIENT_KEY_MISSING", 400);
  }
  const TossPayments = await loadTossPayments();
  const widgets = TossPayments(params.clientKey).widgets({
    customerKey: params.customerKey ?? TossPayments.ANONYMOUS,
  });
  await widgets.setAmount({ currency: "KRW", value: params.amount });
  await Promise.all([
    widgets.renderPaymentMethods({ selector: params.methodsSelector, variantKey: "DEFAULT" }),
    widgets.renderAgreement({ selector: params.agreementSelector, variantKey: "AGREEMENT" }),
  ]);
  return {
    requestPayment: (p) => widgets.requestPayment(p),
  };
}
