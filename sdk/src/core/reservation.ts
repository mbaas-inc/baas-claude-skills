/**
 * 예약 — 공개(대상/슬롯 조회) + 회원(예약 생성/결제/내 예약).
 * 결제(위젯)는 prepare→(앱이 토스 위젯 호출)→confirm 3단계. 토스 위젯은 앱 UI 담당.
 */
import { request, BaasError } from "./http";
import { getProjectId } from "./config";
import { renderPaymentWidget } from "./toss";

export interface ReservationTarget {
  id: string;
  name: string;
  is_active?: boolean;
  [key: string]: unknown;
}

// ── 공개 조회 ──
export const listTargets = () =>
  request<ReservationTarget[]>(`/public/reservation/${getProjectId()}/targets`);
export const getTarget = (targetId: string) =>
  request<ReservationTarget>(`/public/reservation/${getProjectId()}/targets/${targetId}`);
export const getAvailableSlots = (targetId: string, params: Record<string, string>) =>
  request(`/public/reservation/${getProjectId()}/targets/${targetId}/available-slots?${new URLSearchParams(params)}`);
export const getSlotRange = (targetId: string, params: Record<string, string>) =>
  request(`/public/reservation/${getProjectId()}/targets/${targetId}/available-slots/range?${new URLSearchParams(params)}`);

// ── 회원: 무료/현장 예약 즉시 생성 ──
export const createBooking = (
  targetId: string,
  data: { reserved_at: string; form_data: Record<string, unknown>; payment_method?: string }
) => request(`/reservation/targets/${targetId}/bookings`, { method: "POST", body: data });

// ── 회원: 결제(위젯) 준비(금액·client_key용, 예약·세션 미생성) → 앱이 토스 위젯 호출 ──
export const prepareBooking = (
  targetId: string,
  data: { reserved_at: string; form_data: Record<string, unknown> }
) => request(`/reservation/targets/${targetId}/bookings/prepare`, {
  method: "POST",
  body: { ...data, payment_method: "online" },
});

// ── 회원: 결제 개시("결제하기" 클릭 시점) → 결제 세션(CREATED) + 예약(PENDING) 생성, order_no 발급 ──
// 위젯 열기(prepare)엔 만들지 않고 실제 결제 요청 시점에만 만든다(미결제 세션 노이즈 방지). 이 시점에
// 정원·폼을 재검증하고 슬롯을 선점(예약 생성)한다. order_no 를 토스 orderId 로 쓴다.
export const startBooking = (
  targetId: string,
  data: { reserved_at: string; form_data: Record<string, unknown> }
) => request<{ order_no: string; amount: number; client_key?: string }>(
  `/reservation/targets/${targetId}/bookings/start`,
  { method: "POST", body: { ...data, payment_method: "online" } }
);

// ── 회원: 결제(위젯) 승인 = 예약 생성 ──
export const confirmBooking = (
  targetId: string,
  payload: { order_no: string; payment_key: string; amount: number; reserved_at: string; form_data: Record<string, unknown> }
) => request(`/reservation/targets/${targetId}/bookings/confirm`, { method: "POST", body: payload });

// ── 회원: 내 예약 ──
export const listMyBookings = (params: Record<string, string> = {}) =>
  request(`/reservation/bookings/me${Object.keys(params).length ? `?${new URLSearchParams(params)}` : ""}`);
export const getBooking = (reservationId: string) =>
  request(`/reservation/bookings/${reservationId}`);
export const updateBooking = (reservationId: string, data: Record<string, unknown>) =>
  request(`/reservation/bookings/${reservationId}`, { method: "PATCH", body: data });
export const cancelBooking = (reservationId: string) =>
  request<boolean>(`/reservation/bookings/${reservationId}`, { method: "DELETE" });

// ── 회원: 예약 결제위젯(인라인) — 앱 화면 안에서 결제(뒤로가기 유지). 결제는 위젯 방식으로 통일 ──
const RSV_CHECKOUT_CTX = "baas_reservation_checkout_ctx";

export interface ReservationCheckoutContext {
  target_id: string;
  order_no: string;
  reserved_at: string;
  form_data: Record<string, unknown>;
}
export interface ReservationWidgetCheckoutParams {
  reserved_at: string;
  form_data: Record<string, unknown>;
  /** 결제수단 위젯을 렌더할 앱 DOM 셀렉터. */
  methodsSelector: string;
  /** 약관 위젯을 렌더할 셀렉터. */
  agreementSelector: string;
  customerKey?: string;
}
export interface ReservationWidgetHandle {
  amount: number;
  /** 사용자가 결제 버튼을 누를 때 호출 — 이 시점에 예약(PENDING)+결제 세션을 생성(start)한 뒤 토스 결제 요청. */
  requestPayment(opts: {
    successUrl: string;
    failUrl: string;
    orderName?: string;
    customerName?: string;
    customerEmail?: string;
  }): Promise<void>;
}

/** 결제 복귀 페이지에서 confirm 에 필요한 컨텍스트(reserved_at/form_data 등)를 읽는다. */
export function getReservationCheckoutContext(): ReservationCheckoutContext | null {
  try {
    const raw = sessionStorage.getItem(RSV_CHECKOUT_CTX);
    return raw ? (JSON.parse(raw) as ReservationCheckoutContext) : null;
  } catch {
    return null;
  }
}
export function clearReservationCheckoutContext(): void {
  try {
    sessionStorage.removeItem(RSV_CHECKOUT_CTX);
  } catch {
    /* noop */
  }
}

/**
 * 예약 결제위젯 시작 — `prepareBooking()`(응답에 client_key/amount 포함)로 금액을 서버 확정해 결제수단/약관
 * 위젯을 앱 DOM(셀렉터)에 렌더한다(이 시점엔 예약·세션을 만들지 않는다 — 위젯만 열고 이탈해도 잔재 없음).
 * 반환 handle 을 앱이 보관했다가 결제 버튼 클릭 시 `handle.requestPayment(...)` 호출: **이 시점에** `startBooking()`
 * 으로 예약(PENDING)+결제 세션(CREATED)을 만들고(슬롯 선점) 그 order_no 로 토스 결제를 요청한다.
 *
 * confirm 에 필요한 컨텍스트(order_no/reserved_at/form_data)는 리다이렉트 사이 유지돼야 하므로 start 직후
 * sessionStorage 에 저장한다 → 복귀 페이지에서 `getReservationCheckoutContext()` 로 읽고 토스 쿼리(paymentKey/
 * amount)와 합쳐 `confirm(target_id, { order_no, payment_key, amount, reserved_at, form_data })` 후
 * `clearReservationCheckoutContext()`. 카드는 이 confirm(동기)이, 가상계좌는 입금 웹훅(비동기)이 결제를 완결한다.
 * 예약은 `toss_client_key` 를 config 가 아니라 `prepareBooking` 응답으로 받는다(store 와의 차이).
 */
export async function beginReservationWidgetCheckout(
  targetId: string,
  params: ReservationWidgetCheckoutParams
): Promise<ReservationWidgetHandle> {
  // 위젯 렌더용 금액/키만 서버 확정(예약·세션 미생성).
  const prepared = (await prepareBooking(targetId, {
    reserved_at: params.reserved_at,
    form_data: params.form_data,
  })) as { amount?: number; client_key?: string } | null;

  const clientKey = prepared?.client_key;
  const amount = prepared?.amount;
  if (!clientKey || amount == null) {
    throw new BaasError(
      "예약 결제 준비 정보가 올바르지 않습니다(client_key/amount 누락).",
      "RESERVATION_PREPARE_INVALID",
      400
    );
  }

  const widget = await renderPaymentWidget({
    clientKey,
    amount,
    methodsSelector: params.methodsSelector,
    agreementSelector: params.agreementSelector,
    customerKey: params.customerKey,
  });
  return {
    amount,
    requestPayment: async (opts) => {
      // "결제하기" 클릭 시점 = 결제 요청 → 여기서 예약+세션(PENDING) 생성(슬롯 선점, 노이즈 방지).
      const started = await startBooking(targetId, {
        reserved_at: params.reserved_at,
        form_data: params.form_data,
      });
      const orderId = started?.order_no;
      if (!orderId) {
        throw new BaasError(
          "예약 결제 개시에 실패했습니다(order_no 누락).",
          "RESERVATION_START_INVALID",
          400
        );
      }
      try {
        sessionStorage.setItem(
          RSV_CHECKOUT_CTX,
          JSON.stringify({
            target_id: targetId,
            order_no: orderId,
            reserved_at: params.reserved_at,
            form_data: params.form_data,
          })
        );
      } catch {
        /* sessionStorage 불가 환경이면 앱이 successUrl 쿼리로 대체 전달해야 함 */
      }
      await widget.requestPayment({
        orderId,
        orderName: opts.orderName ?? "예약",
        successUrl: opts.successUrl,
        failUrl: opts.failUrl,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
      });
    },
  };
}
