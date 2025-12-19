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
 * @param {UseAccountInfoOptions} [options] - 옵션
 * @returns {UseAccountInfoReturn} 계정 정보와 상태
 *
 * @example
 * // 기본 사용법 - 마운트 시 자동 조회
 * function ProfilePage() {
 *   const { data: account, isLoading, error } = useAccountInfo();
 *
 *   if (isLoading) return <div>로딩 중...</div>;
 *   if (error) return <div>에러: {error}</div>;
 *   if (!account) return <div>로그인이 필요합니다</div>;
 *
 *   return (
 *     <div>
 *       <h1>안녕하세요, {account.name}님!</h1>
 *       <p>이메일: {account.user_id}</p>
 *     </div>
 *   );
 * }
 *
 * @example
 * // 옵션 사용
 * function Dashboard() {
 *   const { data: account, refetch } = useAccountInfo({
 *     redirectOnUnauthorized: '/login'
 *   });
 *
 *   return (
 *     <div>
 *       {account && <span>환영합니다, {account.name}님</span>}
 *       <button onClick={refetch}>새로고침</button>
 *     </div>
 *   );
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
        if (result.errorCode === 'UNAUTHORIZED' && redirectOnUnauthorized) {
          window.location.href = redirectOnUnauthorized;
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