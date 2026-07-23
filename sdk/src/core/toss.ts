/**
 * 토스페이먼츠 v2(standard) 로더 — 스토어/예약 카드결제에서 SDK가 결제창 호출을 대신 담당하기 위한 글루.
 *
 * 앱이 v1/v2·키 타입(개별 연동 키 vs 결제위젯 키)을 알 필요 없게 이 한 곳에서 캡슐화한다.
 * mBaaS 스토어/예약의 `toss_client_key` 는 "API 개별 연동 키(test_ck_/live_ck_)" 이며,
 * v2 `payment().requestPayment()` 방식과 호환된다. (v2 위젯 `widgets()` 방식은 "결제위젯 연동 키
 * (test_gck_)" 전용이라 이 키로는 "결제위젯 연동 키의 클라이언트 키로 SDK를 연동해주세요" 에러가 난다.)
 */

const TOSS_SDK_URL = "https://js.tosspayments.com/v2/standard";

export interface TossRequestPaymentParams {
  method: "CARD" | string;
  amount: { currency: string; value: number };
  orderId: string;
  orderName: string;
  successUrl: string;
  failUrl: string;
  customerName?: string;
  customerEmail?: string;
}
export interface TossPaymentInstance {
  requestPayment(params: TossRequestPaymentParams): Promise<void>;
}
export interface TossPaymentsInstance {
  payment(options: { customerKey: string }): TossPaymentInstance;
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
