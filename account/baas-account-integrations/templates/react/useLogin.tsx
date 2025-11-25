/**
 * BaaS 로그인 React Hook
 *
 * 사용법:
 * const { login, isLoading, error, data } = useLogin();
 * await login({ user_id: 'user@example.com', user_pw: 'password123' });
 */

import { useState, useCallback } from 'react';

// ============================================
// 타입 정의
// ============================================

interface LoginRequest {
  user_id: string;
  user_pw: string;
  project_id?: string;
}

interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
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

interface UseLoginReturn {
  /** 로그인 함수 */
  login: (data: LoginRequest) => Promise<TokenResponse>;
  /** 로딩 상태 */
  isLoading: boolean;
  /** 에러 메시지 */
  error: string | null;
  /** 토큰 데이터 */
  data: TokenResponse | null;
  /** 상태 초기화 */
  reset: () => void;
}

// ============================================
// 설정
// ============================================

const API_BASE_URL = process.env.REACT_APP_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ============================================
// Hook 구현
// ============================================

/**
 * BaaS 로그인 Hook
 *
 * @returns {UseLoginReturn} 로그인 함수와 상태
 *
 * @example
 * function LoginForm() {
 *   const { login, isLoading, error } = useLogin();
 *   const [userId, setUserId] = useState('');
 *   const [userPw, setUserPw] = useState('');
 *
 *   const handleSubmit = async (e: React.FormEvent) => {
 *     e.preventDefault();
 *     try {
 *       await login({ user_id: userId, user_pw: userPw });
 *       window.location.href = '/dashboard';
 *     } catch (err) {
 *       // 에러는 error 상태로 자동 관리됨
 *     }
 *   };
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       <input value={userId} onChange={e => setUserId(e.target.value)} />
 *       <input type="password" value={userPw} onChange={e => setUserPw(e.target.value)} />
 *       {error && <p className="error">{error}</p>}
 *       <button type="submit" disabled={isLoading}>
 *         {isLoading ? '로그인 중...' : '로그인'}
 *       </button>
 *     </form>
 *   );
 * }
 */
export function useLogin(): UseLoginReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TokenResponse | null>(null);

  const login = useCallback(async (loginData: LoginRequest): Promise<TokenResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/account/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(loginData),
      });

      const result: ApiResponse<TokenResponse> = await response.json();

      if (result.result !== 'SUCCESS') {
        throw new Error(result.message || '로그인에 실패했습니다');
      }

      setData(result.data);
      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '로그인에 실패했습니다';
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

  return { login, isLoading, error, data, reset };
}

export type { LoginRequest, TokenResponse, UseLoginReturn };
