/**
 * BaaS 계정 정보 React Hook
 *
 * 사용법:
 * const { data: account, isLoading, error, refetch } = useAccountInfo();
 * // account?.name
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { BASE_URL } from './config';
import type { AccountResponse, UseAccountInfoOptions, UseAccountInfoReturn } from './types';

// ============================================
// Hook 구현
// ============================================

/**
 * BaaS 계정 정보 Hook
 *
 * ⚠️ 화면(페이지) 컴포넌트에서 직접 호출하지 마세요.
 * 이 훅은 앱 루트의 AuthProvider 내부에서 1회만 사용하고,
 * 각 화면은 useAuth()로 전역 인증 상태를 읽기만 합니다.
 * (화면마다 직접 호출하면 페이지 이동 시마다 /account/info가 중복 호출됩니다)
 *
 * 비로그인 상태의 401(UNAUTHORIZED)은 에러가 아닌 정상 신호로 취급하여
 * data=null로 조용히 반환합니다 (error 미설정, onError 미호출).
 *
 * @param {UseAccountInfoOptions} [options] - 옵션
 * @returns {UseAccountInfoReturn} 계정 정보와 상태
 *
 * @example
 * // 권장 사용법 - AuthProvider 경유 (AuthProvider.tsx 참조)
 * // 화면에서는 useAccountInfo() 대신 useAuth()를 사용
 * function ProfilePage() {
 *   const { user, isLoggedIn, isLoading } = useAuth();
 *
 *   if (isLoading) return <div>로딩 중...</div>;
 *   if (!isLoggedIn) return <div>로그인이 필요합니다</div>;
 *
 *   return <h1>안녕하세요, {user.name}님!</h1>;
 * }
 *
 * @example
 * // AuthProvider 내부에서의 사용 (앱에서 유일한 직접 호출 지점)
 * function AuthProvider({ children }) {
 *   const { data: user, isLoading, error, refetch, reset } = useAccountInfo();
 *   // ... Context로 하위 컴포넌트에 공유
 * }
 */
export function useAccountInfo(options: UseAccountInfoOptions = {}): UseAccountInfoReturn {
  const { enabled = true, redirectOnUnauthorized, onError } = options;
  const [data, setData] = useState<AccountResponse | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  // 콜백 ref - 최신 참조 유지 (무한 루프 방지)
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });

  const fetchAccountInfo = useCallback(async (): Promise<AccountResponse | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BASE_URL}/account/info`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      const result = await response.json();

      if (result.result !== 'SUCCESS') {
        // 401(UNAUTHORIZED) = 비로그인 정상 신호 - 에러로 취급하지 않음
        if (result.errorCode === 'UNAUTHORIZED') {
          if (redirectOnUnauthorized) {
            window.location.href = redirectOnUnauthorized;
          }
          setData(null);
          return null;
        }
        throw new Error(result.message || '계정 정보를 가져올 수 없습니다');
      }

      setData(result.data);
      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '계정 정보를 가져올 수 없습니다';
      setError(message);
      onErrorRef.current?.(err instanceof Error ? err : new Error(message));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [redirectOnUnauthorized]);

  const reset = useCallback(() => {
    setData(null);
    setIsLoading(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (enabled) {
      void fetchAccountInfo();
    }
  }, [enabled, fetchAccountInfo]);

  return { data, isLoading, error, refetch: fetchAccountInfo, reset };
}