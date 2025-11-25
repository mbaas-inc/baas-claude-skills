/**
 * BaaS 회원가입 React Hook
 *
 * 사용법:
 * const { signup, isLoading, error, data } = useSignup();
 * await signup({
 *   user_id: 'user@example.com',
 *   user_pw: 'password123',
 *   name: '홍길동',
 *   phone: '010-1234-5678'
 * });
 */

import { useState, useCallback } from 'react';

// ============================================
// 타입 정의
// ============================================

interface SignupRequest {
  user_id: string;
  user_pw: string;
  name: string;
  phone: string;
  project_id?: string;
  terms_agreed?: boolean;
  privacy_agreed?: boolean;
  data?: Record<string, unknown>;
}

interface AccountResponse {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  is_profile_completed: boolean;
  last_logged_at: string | null;
  created_at: string;
  data: Record<string, unknown>;
}

interface SuccessResponse<T> {
  result: 'SUCCESS';
  data: T;
  message?: string;
}

interface ErrorResponse {
  result: 'FAIL';
  errorCode: string;
  message: string;
}

type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

interface UseSignupReturn {
  /** 회원가입 함수 */
  signup: (data: SignupRequest) => Promise<AccountResponse>;
  /** 로딩 상태 */
  isLoading: boolean;
  /** 에러 메시지 */
  error: string | null;
  /** 생성된 계정 데이터 */
  data: AccountResponse | null;
  /** 상태 초기화 */
  reset: () => void;
}

// ============================================
// 설정
// ============================================

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// ============================================
// Hook 구현
// ============================================

/**
 * BaaS 회원가입 Hook
 *
 * @returns {UseSignupReturn} 회원가입 함수와 상태
 *
 * @example
 * function SignupForm() {
 *   const { signup, isLoading, error } = useSignup();
 *   const [formData, setFormData] = useState({
 *     user_id: '',
 *     user_pw: '',
 *     name: '',
 *     phone: ''
 *   });
 *
 *   const handleSubmit = async (e: React.FormEvent) => {
 *     e.preventDefault();
 *     try {
 *       await signup(formData);
 *       // 회원가입 성공 - 로그인 페이지로 이동
 *       alert('회원가입이 완료되었습니다. 로그인해주세요.');
 *       window.location.href = '/login';
 *     } catch (err) {
 *       // 에러는 error 상태로 자동 관리됨
 *     }
 *   };
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       <input
 *         placeholder="이메일"
 *         value={formData.user_id}
 *         onChange={e => setFormData({...formData, user_id: e.target.value})}
 *       />
 *       <input
 *         type="password"
 *         placeholder="비밀번호 (8자 이상)"
 *         value={formData.user_pw}
 *         onChange={e => setFormData({...formData, user_pw: e.target.value})}
 *       />
 *       <input
 *         placeholder="이름"
 *         value={formData.name}
 *         onChange={e => setFormData({...formData, name: e.target.value})}
 *       />
 *       <input
 *         placeholder="전화번호"
 *         value={formData.phone}
 *         onChange={e => setFormData({...formData, phone: e.target.value})}
 *       />
 *       {error && <p className="error">{error}</p>}
 *       <button type="submit" disabled={isLoading}>
 *         {isLoading ? '가입 중...' : '회원가입'}
 *       </button>
 *     </form>
 *   );
 * }
 */
export function useSignup(): UseSignupReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AccountResponse | null>(null);

  const signup = useCallback(async (signupData: SignupRequest): Promise<AccountResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/account/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(signupData),
      });

      const result: ApiResponse<AccountResponse> = await response.json();

      if (result.result !== 'SUCCESS') {
        throw new Error(result.message || '회원가입에 실패했습니다');
      }

      setData(result.data);
      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '회원가입에 실패했습니다';
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

  return { signup, isLoading, error, data, reset };
}

export type { SignupRequest, AccountResponse, UseSignupReturn };