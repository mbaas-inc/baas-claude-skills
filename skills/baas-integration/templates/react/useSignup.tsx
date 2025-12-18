/**
 * BaaS 회원가입 React Hook
 *
 * 사용법:
 * const { signup, isLoading, error, data } = useSignup();
 * await signup('user@example.com', 'password123', '홍길동', '010-1234-5678');
 *
 * 환경변수 설정 필요:
 * - REACT_APP_BAAS_PROJECT_ID (React CRA)
 * - NEXT_PUBLIC_BAAS_PROJECT_ID (Next.js)
 * - VITE_BAAS_PROJECT_ID (Vite)
 */

import { useState, useCallback } from 'react';
import { BASE_URL, getProjectId } from './config';

// ============================================
// 타입 정의
// ============================================

/** 회원가입 추가 옵션 */
interface SignupOptions {
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

interface UseSignupReturn {
  /** 회원가입 함수 */
  signup: (userId: string, userPw: string, name: string, phone: string, options?: SignupOptions) => Promise<AccountResponse>;
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
// Hook 구현
// ============================================

/**
 * BaaS 회원가입 Hook
 * project_id는 환경변수에서 자동 주입됩니다.
 *
 * @returns {UseSignupReturn} 회원가입 함수와 상태
 *
 * @example
 * function SignupForm() {
 *   const { signup, isLoading, error } = useSignup();
 *   const [userId, setUserId] = useState('');
 *   const [userPw, setUserPw] = useState('');
 *   const [name, setName] = useState('');
 *   const [phone, setPhone] = useState('');
 *
 *   const handleSubmit = async (e: React.FormEvent) => {
 *     e.preventDefault();
 *     try {
 *       await signup(userId, userPw, name, phone);
 *       alert('회원가입이 완료되었습니다.');
 *       window.location.href = '/login';
 *     } catch (err) {
 *       // 에러는 error 상태로 자동 관리됨
 *     }
 *   };
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       <input placeholder="이메일" value={userId} onChange={e => setUserId(e.target.value)} />
 *       <input type="password" placeholder="비밀번호" value={userPw} onChange={e => setUserPw(e.target.value)} />
 *       <input placeholder="이름" value={name} onChange={e => setName(e.target.value)} />
 *       <input placeholder="전화번호" value={phone} onChange={e => setPhone(e.target.value)} />
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

  const signup = useCallback(async (
    userId: string,
    userPw: string,
    name: string,
    phone: string,
    options: SignupOptions = {}
  ): Promise<AccountResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BASE_URL}/account/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          user_id: userId,
          user_pw: userPw,
          name,
          phone,
          project_id: getProjectId(),
          ...options,
        }),
      });

      const result = await response.json();

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

export type { SignupOptions, AccountResponse, UseSignupReturn };