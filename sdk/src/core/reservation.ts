/**
 * 예약 — 공개(대상/슬롯 조회) + 회원(예약 생성/결제/내 예약).
 * 카드 결제는 prepare→(앱이 토스 위젯 호출)→confirm 3단계. 토스 위젯은 앱 UI 담당.
 */
import { request } from "./http";
import { getProjectId } from "./config";

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
