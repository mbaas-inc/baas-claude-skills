/**
 * BaaS 발송대상 등록 React Hook
 *
 * 사용법:
 * const { register, isLoading, error, data } = useRecipient();
 * await register({ name: '홍길동', phone: '010-1234-5678' });
 *
 * 환경변수 설정 필요:
 * - REACT_APP_BAAS_PROJECT_ID (React CRA)
 * - NEXT_PUBLIC_BAAS_PROJECT_ID (Next.js)
 * - VITE_BAAS_PROJECT_ID (Vite)
 */

import { useState, useCallback } from 'react';

// ============================================
// 설정
// ============================================

const API_BASE_URL = 'https://api.aiapp.link';

/**
 * 환경변수에서 project_id를 가져옵니다.
 */
function getProjectId(): string {
  const projectId =
    process.env.REACT_APP_BAAS_PROJECT_ID ||
    process.env.NEXT_PUBLIC_BAAS_PROJECT_ID ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BAAS_PROJECT_ID);

  if (!projectId) {
    throw new Error(
      '[BaaS] project_id 환경변수 필요:\n' +
      '  - REACT_APP_BAAS_PROJECT_ID (React)\n' +
      '  - NEXT_PUBLIC_BAAS_PROJECT_ID (Next.js)\n' +
      '  - VITE_BAAS_PROJECT_ID (Vite)'
    );
  }
  return projectId;
}

// ============================================
// 타입 정의
// ============================================

/** 발송대상 등록 요청 */
interface RecipientCreateRequest {
  name: string;
  phone: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

/** 발송대상 응답 */
interface RecipientResponse {
  id: string;
  project_id: string;
  name: string;
  phone: string;
  description: string | null;
  data: string;
  created_at: string;
  removed_at: string | null;
}

interface UseRecipientReturn {
  /** 발송대상 등록 함수 */
  register: (request: RecipientCreateRequest) => Promise<RecipientResponse>;
  /** 로딩 상태 */
  isLoading: boolean;
  /** 에러 메시지 */
  error: string | null;
  /** 등록된 발송대상 데이터 */
  data: RecipientResponse | null;
  /** 상태 초기화 */
  reset: () => void;
  /** 전화번호 검증 */
  validatePhone: (phone: string) => boolean;
  /** 전화번호 포맷팅 */
  formatPhone: (value: string) => string;
}

// ============================================
// 유틸리티 함수
// ============================================

/**
 * 전화번호 형식 검증
 */
function validatePhone(phone: string): boolean {
  return /^010-\d{4}-\d{4}$/.test(phone);
}

/**
 * 전화번호 자동 포맷팅
 */
function formatPhone(value: string): string {
  const numbers = value.replace(/[^\d]/g, '');
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0,3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0,3)}-${numbers.slice(3,7)}-${numbers.slice(7,11)}`;
}

// ============================================
// Hook 구현
// ============================================

/**
 * BaaS 발송대상 등록 Hook
 * project_id는 환경변수에서 자동 주입됩니다.
 *
 * @returns {UseRecipientReturn} 등록 함수와 상태
 *
 * @example
 * function ContactForm() {
 *   const { register, isLoading, error, formatPhone, validatePhone } = useRecipient();
 *   const [name, setName] = useState('');
 *   const [phone, setPhone] = useState('');
 *
 *   const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
 *     setPhone(formatPhone(e.target.value));
 *   };
 *
 *   const handleSubmit = async (e: React.FormEvent) => {
 *     e.preventDefault();
 *     if (!validatePhone(phone)) {
 *       alert('전화번호 형식을 확인해주세요.');
 *       return;
 *     }
 *     try {
 *       await register({ name, phone });
 *       alert('등록이 완료되었습니다!');
 *     } catch (err) {
 *       // 에러는 error 상태로 자동 관리됨
 *     }
 *   };
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       <input value={name} onChange={e => setName(e.target.value)} placeholder="이름" />
 *       <input value={phone} onChange={handlePhoneChange} placeholder="010-1234-5678" />
 *       {error && <p className="error">{error}</p>}
 *       <button type="submit" disabled={isLoading}>
 *         {isLoading ? '등록 중...' : '등록하기'}
 *       </button>
 *     </form>
 *   );
 * }
 *
 * @example
 * // 예약 폼
 * function ReservationForm() {
 *   const { register, isLoading } = useRecipient();
 *
 *   const handleSubmit = async (formData) => {
 *     await register({
 *       name: formData.name,
 *       phone: formData.phone,
 *       description: `${formData.date} ${formData.time} 예약`,
 *       metadata: {
 *         type: 'reservation',
 *         date: formData.date,
 *         time: formData.time,
 *         partySize: formData.partySize
 *       }
 *     });
 *   };
 * }
 */
export function useRecipient(): UseRecipientReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RecipientResponse | null>(null);

  const register = useCallback(async (request: RecipientCreateRequest): Promise<RecipientResponse> => {
    // 전화번호 형식 검증
    if (!validatePhone(request.phone)) {
      const errorMsg = '전화번호 형식이 올바르지 않습니다. (예: 010-1234-5678)';
      setError(errorMsg);
      throw new Error(errorMsg);
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/recipient/${getProjectId()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: request.name,
          phone: request.phone,
          description: request.description || ' ',
          data: request.metadata ? JSON.stringify(request.metadata) : '{}'
        }),
      });

      const result = await response.json();

      if (result.result !== 'SUCCESS') {
        throw new Error(result.message || '발송대상 등록에 실패했습니다');
      }

      setData(result.data);
      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '발송대상 등록에 실패했습니다';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setData(null);
  }, []);

  return {
    register,
    isLoading,
    error,
    data,
    reset,
    validatePhone,
    formatPhone
  };
}

export type { RecipientCreateRequest, RecipientResponse, UseRecipientReturn };