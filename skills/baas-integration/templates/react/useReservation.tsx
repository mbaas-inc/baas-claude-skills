/**
 * BaaS 예약(슬롯/캘린더) React Hooks
 *
 * 운영시간 기반 슬롯 예약 — 대상 목록/상세/슬롯/캘린더 조회 + 예약 생성/내역/수정/취소.
 * 조회(targets/slots)는 인증 불필요, 예약 생성·내역·수정·취소는 프로젝트 회원 로그인 필요.
 *
 * 훅은 API 호출 + 상태관리만 제공합니다. UI(캘린더/슬롯 버튼/동적 폼)는 직접 작성하세요.
 * 렌더링 레시피는 references/reservation.md "## 구현 패턴"을 참고하세요.
 *
 * 사용법:
 * const { targets, fetchTargets, fetchTargetDetail, target } = useReservationTargets();
 * const { slots, monthCounts, fetchSlots, fetchMonth } = useReservationSlots(targetId);
 * const { book, isLoading, error } = useReservationBooking(targetId);
 * const { reservations, fetchMine, update, cancel } = useMyReservations();
 *
 * 환경변수 설정 필요:
 * - REACT_APP_BAAS_PROJECT_ID (React CRA)
 * - NEXT_PUBLIC_BAAS_PROJECT_ID (Next.js)
 * - VITE_BAAS_PROJECT_ID (Vite)
 */

import { useState, useCallback } from 'react';
import { BASE_URL, getProjectId } from './config';

// =============================================================================
// 타입 정의
// =============================================================================

export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW';

export interface ReservationTargetSummary {
  id: string;                    // target_id — 이후 모든 예약 API에 사용
  name: string;
  description: string | null;
  image_url: string | null;
  display_order: number;
}

type TimeRange = [string, string]; // ["11:00", "15:00"]

export interface ReservationSettings {
  operating_hours: {
    mon: TimeRange[]; tue: TimeRange[]; wed: TimeRange[]; thu: TimeRange[];
    fri: TimeRange[]; sat: TimeRange[]; sun: TimeRange[];
  };
  slot_policy: {
    slot_duration_min: number;
    slot_capacity: number;
    advance_booking_days: number;
    min_lead_time_min: number;
  };
  approval_policy: {
    auto_confirm: boolean;
    confirmation_message: string;
  };
  user_policy: {
    cancel_deadline_min: number;
    allow_self_modify: boolean;
    max_active_per_user: number;
  };
}

export interface ReservationFormField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'email' | 'phone' | 'number' | 'select' | 'checkbox' | 'radio';
  required: boolean;
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
}

export interface ReservationTargetDetail extends ReservationTargetSummary {
  project_id: string;
  is_active: boolean;
  reservation_settings: ReservationSettings;
  reservation_form_schema: { fields: ReservationFormField[] };
  created_at: string;
  updated_at: string;
}

export interface ReservationSlot {
  slot: string;        // ISO 8601 슬롯 시작 시각 — 예약 생성의 reserved_at으로 사용
  remaining: number;   // 0이면 마감
}

export interface Reservation {
  id: string;
  target_id: string;
  account_id: string;
  reserved_at: string;
  form_data: Record<string, any>;
  status: ReservationStatus;
  admin_memo: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
}

// =============================================================================
// useReservationTargets — 대상 목록 + 상세
// =============================================================================

interface UseReservationTargetsReturn {
  targets: ReservationTargetSummary[];
  target: ReservationTargetDetail | null;
  isLoading: boolean;
  error: string | null;
  fetchTargets: () => Promise<void>;
  fetchTargetDetail: (targetId: string) => Promise<ReservationTargetDetail | null>;
}

export function useReservationTargets(): UseReservationTargetsReturn {
  const [targets, setTargets] = useState<ReservationTargetSummary[]>([]);
  const [target, setTarget] = useState<ReservationTargetDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTargets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const projectId = getProjectId();
      const res = await fetch(
        `${BASE_URL}/public/reservation/${projectId}/targets`,
        { credentials: 'include' }
      );
      const json = await res.json();
      if (json.result !== 'SUCCESS') throw new Error(json.message || '대상 목록 조회 실패');
      setTargets(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchTargetDetail = useCallback(async (targetId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const projectId = getProjectId();
      const res = await fetch(
        `${BASE_URL}/public/reservation/${projectId}/targets/${targetId}`,
        { credentials: 'include' }
      );
      const json = await res.json();
      if (json.result !== 'SUCCESS') throw new Error(json.message || '대상 상세 조회 실패');
      setTarget(json.data);
      return json.data as ReservationTargetDetail;
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { targets, target, isLoading, error, fetchTargets, fetchTargetDetail };
}

// =============================================================================
// useReservationSlots — 날짜별 슬롯 + 월간 캘린더
// =============================================================================

interface UseReservationSlotsReturn {
  slots: ReservationSlot[];
  monthCounts: Record<string, number>;  // {"2026-06-01": 12, ...}
  isLoading: boolean;
  error: string | null;
  fetchSlots: (date: string) => Promise<void>;        // date: YYYY-MM-DD
  fetchMonth: (start: string, end: string) => Promise<void>; // 최대 60일
}

export function useReservationSlots(targetId: string): UseReservationSlotsReturn {
  const [slots, setSlots] = useState<ReservationSlot[]>([]);
  const [monthCounts, setMonthCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSlots = useCallback(async (date: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const projectId = getProjectId();
      const params = new URLSearchParams({ date });
      const res = await fetch(
        `${BASE_URL}/public/reservation/${projectId}/targets/${targetId}/available-slots?${params}`,
        { credentials: 'include' }
      );
      const json = await res.json();
      if (json.result !== 'SUCCESS') throw new Error(json.message || '슬롯 조회 실패');
      setSlots(json.data.slots);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setIsLoading(false);
    }
  }, [targetId]);

  const fetchMonth = useCallback(async (start: string, end: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const projectId = getProjectId();
      const params = new URLSearchParams({ start, end });
      const res = await fetch(
        `${BASE_URL}/public/reservation/${projectId}/targets/${targetId}/available-slots/range?${params}`,
        { credentials: 'include' }
      );
      const json = await res.json();
      if (json.result !== 'SUCCESS') throw new Error(json.message || '캘린더 조회 실패');
      setMonthCounts(json.data.counts);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setIsLoading(false);
    }
  }, [targetId]);

  return { slots, monthCounts, isLoading, error, fetchSlots, fetchMonth };
}

// =============================================================================
// useReservationBooking — 예약 생성 (로그인 필요)
// =============================================================================

interface UseReservationBookingReturn {
  reservation: Reservation | null;
  isLoading: boolean;
  error: string | null;
  book: (reservedAt: string, formData: Record<string, any>) => Promise<Reservation | null>;
}

export function useReservationBooking(targetId: string): UseReservationBookingReturn {
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // reservedAt: ## 3 슬롯 응답의 slot 값을 그대로 전달
  const book = useCallback(async (reservedAt: string, formData: Record<string, any>) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${BASE_URL}/reservation/targets/${targetId}/bookings`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reserved_at: reservedAt, form_data: formData }),
        }
      );
      const json = await res.json();
      if (json.result !== 'SUCCESS') throw new Error(json.message || '예약 실패');
      setReservation(json.data);
      return json.data as Reservation;
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [targetId]);

  return { reservation, isLoading, error, book };
}

// =============================================================================
// useMyReservations — 내 예약 목록 + 수정 + 취소 (로그인 필요)
// =============================================================================

interface UseMyReservationsReturn {
  reservations: Reservation[];
  isLoading: boolean;
  error: string | null;
  fetchMine: (options?: { status?: ReservationStatus; limit?: number; offset?: number }) => Promise<void>;
  update: (reservationId: string, data: { reserved_at?: string; form_data?: Record<string, any> }) => Promise<Reservation | null>;
  cancel: (reservationId: string) => Promise<boolean>;
}

export function useMyReservations(): UseMyReservationsReturn {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMine = useCallback(async (
    options: { status?: ReservationStatus; limit?: number; offset?: number } = {}
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (options.status) params.set('status', options.status);
      params.set('limit', String(options.limit ?? 50));
      params.set('offset', String(options.offset ?? 0));
      const res = await fetch(
        `${BASE_URL}/reservation/bookings/me?${params}`,
        { credentials: 'include' }
      );
      const json = await res.json();
      if (json.result !== 'SUCCESS') throw new Error(json.message || '예약 내역 조회 실패');
      // data는 플랫 배열 (페이지네이션 래퍼 아님)
      setReservations(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const update = useCallback(async (
    reservationId: string,
    data: { reserved_at?: string; form_data?: Record<string, any> }
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${BASE_URL}/reservation/bookings/${reservationId}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      );
      const json = await res.json();
      if (json.result !== 'SUCCESS') throw new Error(json.message || '예약 수정 실패');
      return json.data as Reservation;
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const cancel = useCallback(async (reservationId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${BASE_URL}/reservation/bookings/${reservationId}`,
        { method: 'DELETE', credentials: 'include' }
      );
      const json = await res.json();
      if (json.result !== 'SUCCESS') throw new Error(json.message || '예약 취소 실패');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { reservations, isLoading, error, fetchMine, update, cancel };
}
