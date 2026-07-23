/**
 * 예약 — 공개(대상/슬롯 조회) + 회원(예약 생성/결제/내 예약).
 * 카드 결제는 prepare→(앱이 토스 위젯 호출)→confirm 3단계. 토스 위젯은 앱 UI 담당.
 */
import { request, BaasError } from "./http";
import { getProjectId } from "./config";
import { requestCardPayment } from "./toss";

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

// ── 회원: 카드 결제 준비(예약 미생성) → 앱이 토스 위젯 호출 ──
export const prepareBooking = (
  targetId: string,
  data: { reserved_at: string; form_data: Record<string, unknown> }
) => request(`/reservation/targets/${targetId}/bookings/prepare`, {
  method: "POST",
  body: { ...data, payment_method: "online" },
});

// ── 회원: 카드 결제 승인 = 예약 생성 ──
export const confirmBooking = (
  targetId: string,
  payload: { order_id: string; payment_key: string; amount: number; reserved_at: string; form_data: Record<string, unknown> }
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

// ── 회원: 카드예약 원스톱(prepare → 토스 결제창) ──
const RSV_CHECKOUT_CTX = "baas_reservation_checkout_ctx";

export interface ReservationCheckoutContext {
  target_id: string;
  order_id: string;
  reserved_at: string;
  form_data: Record<string, unknown>;
}
export interface ReservationCheckoutOptions {
  reserved_at: string;
  form_data: Record<string, unknown>;
  /** 결제 성공 복귀 경로(평면 경로 권장: /reservation-payment-success). 토스가 paymentKey/amount 쿼리 부착. */
  successUrl: string;
  failUrl: string;
  /** 결제창에 표시할 주문명(예: `${target.name} 예약`). 생략 시 "예약". */
  orderName?: string;
  customerKey?: string;
  customerName?: string;
  customerEmail?: string;
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
 * 예약 카드결제를 SDK가 원스톱으로 처리한다: `prepareBooking()`(응답에 client_key/order_id/amount 포함)
 * → 토스 결제창(v2 payment().requestPayment). 앱은 토스 SDK/버전/키타입을 몰라도 된다.
 *
 * confirm 에 필요한 reserved_at/form_data 는 리다이렉트 사이에 유지돼야 하므로 sessionStorage 에
 * 저장한다 → 복귀 페이지에서 `getReservationCheckoutContext()` 로 읽고, 토스 쿼리(paymentKey/amount)와
 * 합쳐 `confirm(target_id, { order_id, payment_key, amount, reserved_at, form_data })` 호출 후
 * `clearReservationCheckoutContext()`.
 * 사용자가 결제창을 닫으면 `code === "USER_CANCEL"` 에러가 throw 된다.
 */
export async function startReservationCheckout(
  targetId: string,
  opts: ReservationCheckoutOptions
): Promise<void> {
  const prepared = (await prepareBooking(targetId, {
    reserved_at: opts.reserved_at,
    form_data: opts.form_data,
  })) as { order_id?: string; amount?: number; client_key?: string } | null;

  const clientKey = prepared?.client_key;
  const orderId = prepared?.order_id;
  const amount = prepared?.amount;
  if (!clientKey || !orderId || amount == null) {
    throw new BaasError(
      "예약 결제 준비 정보가 올바르지 않습니다(client_key/order_id/amount 누락).",
      "RESERVATION_PREPARE_INVALID",
      400
    );
  }

  try {
    sessionStorage.setItem(
      RSV_CHECKOUT_CTX,
      JSON.stringify({
        target_id: targetId,
        order_id: orderId,
        reserved_at: opts.reserved_at,
        form_data: opts.form_data,
      })
    );
  } catch {
    /* sessionStorage 불가 환경이면 앱이 successUrl 쿼리로 대체 전달해야 함 */
  }

  await requestCardPayment(clientKey, {
    amount,
    orderId,
    orderName: opts.orderName ?? "예약",
    successUrl: opts.successUrl,
    failUrl: opts.failUrl,
    customerKey: opts.customerKey,
    customerName: opts.customerName,
    customerEmail: opts.customerEmail,
  });
}
