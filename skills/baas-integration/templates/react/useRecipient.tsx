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
import { BASE_URL, getProjectId } from './config';
import { validatePhone, formatPhone } from './utils';
import type { RecipientCreateRequest, RecipientResponse, UseRecipientReturn } from './types';

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
      const response = await fetch(`${BASE_URL}/recipient/${getProjectId()}`, {
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