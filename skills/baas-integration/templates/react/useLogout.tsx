/**
 * BaaS 로그아웃 React Hook
 *
 * 사용법:
 * const { logout, isLoading } = useLogout();
 * await logout();
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { BASE_URL } from './config';
import type { UseLogoutOptions, UseLogoutReturn } from './types';

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
 * // 기본 사용법
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
 *       sessionStorage.clear();
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

  // 콜백 refs - 최신 참조 유지 (불필요한 함수 재생성 방지)
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  });

  const logout = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BASE_URL}/account/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      const result = await response.json();

      if (result.result !== 'SUCCESS') {
        throw new Error(result.message || '로그아웃에 실패했습니다');
      }

      onSuccessRef.current?.();

      if (redirectTo) {
        window.location.href = redirectTo;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '로그아웃에 실패했습니다';
      setError(message);
      onErrorRef.current?.(err instanceof Error ? err : new Error(message));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [redirectTo]);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
  }, []);

  return { logout, isLoading, error, reset };
}