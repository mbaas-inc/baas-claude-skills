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
  /** 복귀 주소를 주면 리다이렉트(void), 생략하면 Promise 로 결과를 돌려준다(PC 전용). */
  requestPayment(params: TossWidgetRequestPaymentParams): Promise<void>;
  requestPayment(params: Omit<TossWidgetRequestPaymentParams, "successUrl" | "failUrl">): Promise<TossPaymentResult>;
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
    requestPayment: (p) =>
      isFramed() && !isMobileBrowser() ? requestPaymentInFrame(widgets, p) : widgets.requestPayment(p),
  };
}

/** 토스 Promise 방식 결과 — v2 는 amount 를 `{ currency, value }` 로 주지만 숫자인 경우도 받는다. */
export interface TossPaymentResult {
  paymentType?: string;
  orderId: string;
  paymentKey: string;
  amount: number | { value: number };
}

/** 앱이 다른 화면 안(iframe)에 떠 있나 — Studio 미리보기 등. 교차 출처라 top 을 못 읽어도 iframe 이다. */
function isFramed(): boolean {
  try {
    return typeof window !== "undefined" && window.self !== window.top;
  } catch {
    return true;
  }
}

function isMobileBrowser(): boolean {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/**
 * iframe 안에서의 결제 — 리다이렉트 대신 Promise 로 결과를 받아 앱 프레임이 스스로 복귀 주소로 이동한다.
 *
 * 리다이렉트 방식에서는 토스 결제창(iframe)이 결제 뒤 앱 프레임을 successUrl 로 옮기는데, 앱이 sandbox
 * iframe 안(Studio 미리보기)이면 결제창이 그 제한을 물려받아 상위 프레임을 옮기지 못한다 — 결제창은
 * 끝났는데 복귀 페이지가 열리지 않아 승인 요청이 오지 않는다. 자기 프레임 이동은 sandbox 에서도 되므로,
 * 복귀 페이지에는 토스 리다이렉트와 같은 쿼리를 붙여 `getPaymentRedirectResult()` 가 그대로 읽게 한다.
 * Promise 방식은 PC 전용이라 모바일은 리다이렉트 그대로 둔다(토스 문서).
 */
async function requestPaymentInFrame(
  widgets: TossWidgetsInstance,
  p: TossWidgetRequestPaymentParams,
): Promise<void> {
  const { successUrl, failUrl, ...params } = p;
  let result: TossPaymentResult;
  try {
    result = await widgets.requestPayment(params);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === "USER_CANCEL") throw e; // 리다이렉트 방식과 같다 — 앱이 무시한다
    window.location.assign(
      withQuery(failUrl, { code: err.code ?? "PAYMENT_FAILED", message: err.message ?? "", orderId: p.orderId }),
    );
    return;
  }
  const amount = typeof result.amount === "number" ? result.amount : result.amount.value;
  window.location.assign(
    withQuery(successUrl, {
      paymentType: result.paymentType ?? "NORMAL",
      orderId: result.orderId,
      paymentKey: result.paymentKey,
      amount: String(amount),
    }),
  );
}

function withQuery(url: string, params: Record<string, string>): string {
  const u = new URL(url, window.location.href);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}
