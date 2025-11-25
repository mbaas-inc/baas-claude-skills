/**
 * BaaS 로그아웃 React Hook
 *
 * 사용법:
 * const { logout, isLoading } = useLogout();
 * await logout();
 */

import { useState, useCallback } from 'react';

// ============================================
// 타입 정의
// ============================================

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

interface UseLogoutOptions {
  /** 로그아웃 성공 후 리다이렉트 URL */
  redirectTo?: string;
  /** 로그아웃 성공 후 콜백 */
  onSuccess?: () => void;
  /** 로그아웃 실패 후 콜백 */
  onError?: (error: Error) => void;
}

interface UseLogoutReturn {
  /** 로그아웃 함수 */
  logout: () => Promise<void>;
  /** 로딩 상태 */
  isLoading: boolean;
  /** 에러 메시지 */
  error: string | null;
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
 * BaaS 로그아웃 Hook
 *
 * @param {UseLogoutOptions} [options] - 로그아웃 옵션
 * @returns {UseLogoutReturn} 로그아웃 함수와 상태
 *
 * @example
 * function LogoutButton() {
 *   const { logout, isLoading } = useLogout();
 *
 *   const handleLogout = async () => {
 *     await logout();
 *     window.location.href = '/login';
 *   };
 *
 *   return (
 *     <button onClick={handleLogout} disabled={isLoading}>
 *       {isLoading ? '로그아웃 중...' : '로그아웃'}
 *     </button>
 *   );
 * }
 *
 * @example
 * // 옵션 사용
 * function LogoutButton() {
 *   const { logout, isLoading } = useLogout({
 *     redirectTo: '/login',
 *     onSuccess: () => {
 *       localStorage.clear();
 *     }
 *   });
 *
 *   return (
 *     <button onClick={logout} disabled={isLoading}>
 *       로그아웃
 *     </button>
 *   );
 * }
 */
export function useLogout(options: UseLogoutOptions = {}): UseLogoutReturn {
  const { redirectTo, onSuccess, onError } = options;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logout = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/account/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      const result: ApiResponse<null> = await response.json();

      if (result.result !== 'SUCCESS') {
        throw new Error(result.message || '로그아웃에 실패했습니다');
      }

      onSuccess?.();

      if (redirectTo) {
        window.location.href = redirectTo;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '로그아웃에 실패했습니다';
      setError(message);
      onError?.(err instanceof Error ? err : new Error(message));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [redirectTo, onSuccess, onError]);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
  }, []);

  return { logout, isLoading, error, reset };
}

export type { UseLogoutOptions, UseLogoutReturn };
